/**
 * user-core.ts — 온보딩 선택값·보상 적용 순수 로직 (U3).
 * RN·Supabase 의존 없는 순수 함수 — 단위 테스트로 계약 고정.
 */
import { CEFR_LEVELS, LEARNING_GOALS, type CEFRLevel, type LearningGoal } from '@ted-speak/shared';

export interface OnboardingSelections {
  goal: LearningGoal;
  level: CEFRLevel;
  dailyGoalMinutes: number;
  /** 마이크 권한 — UI 분기용. DB 컬럼이 아니므로 profile update에 포함하지 않는다 */
  micGranted: boolean;
}

/** 방어적 enum 검증용 valid 값 집합 (서버 row 오염 방어 — profileToHydration). shared 런타임 상수가 단일 출처 */
const VALID_GOALS = LEARNING_GOALS;
const VALID_LEVELS = CEFR_LEVELS;

/** last_study_date 형식 — DB date 컬럼은 YYYY-MM-DD로 직렬화된다. 그 외 형식은 오염으로 본다 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * profiles 테이블 update payload — grant 화이트리스트 컬럼만.
 *
 * 보안: profiles의 update grant는 (display_name, level, goal, daily_goal_minutes, onboarded_at)이다
 * (20260612000000_init.sql 36행 + 20260613000000_profiles_onboarded_at.sql). is_premium·streak·
 * total_speaking_seconds·last_study_date 등 통계·과금 컬럼은 서버 트리거/service_role 전담이므로
 * 절대 포함하지 않는다. grant 밖 컬럼은 Supabase가 거부하지만, 시도 자체가 결함이므로 여기서
 * 화이트리스트를 강제한다.
 *
 * onboarded_at은 온보딩 완료 마커 — 위조해도 영향은 *본인* 온보딩 스킵뿐이라 무해(마이그레이션 위조 분석 참조).
 */
export function buildProfileUpdate(
  selections: OnboardingSelections,
  onboardedAt: string,
): {
  goal: LearningGoal;
  level: CEFRLevel;
  daily_goal_minutes: number;
  onboarded_at: string;
} {
  return {
    goal: selections.goal,
    level: selections.level,
    daily_goal_minutes: selections.dailyGoalMinutes,
    onboarded_at: onboardedAt,
  };
}

/**
 * 서버 profiles 행 — 재로그인 하이드레이션 입력 (HANDOFF 2b).
 * select('goal, level, daily_goal_minutes, streak, last_study_date, onboarded_at') 결과 형태.
 */
export interface ProfileRow {
  goal: LearningGoal;
  level: CEFRLevel;
  daily_goal_minutes: number;
  streak: number;
  last_study_date: string | null;
  /** 온보딩 완료 마커 — null이면 온보딩 미완료 */
  onboarded_at: string | null;
}

/**
 * 서버 profiles → 로컬 스토어에 반영할 패치.
 * xp·todaySpeakingSeconds(서버 컬럼 없음)·micGranted(기기 로컬)는 포함하지 않는다.
 */
export interface HydrationPatch {
  onboarded: true;
  goal: LearningGoal;
  level: CEFRLevel;
  dailyGoalMinutes: number;
  streak: number;
  lastStudyDate: string | null;
}

/**
 * 서버 profiles 행을 HydrationPatch로 변환한다 — 재로그인 시 온보딩 스킵·서버 통계 반영.
 *
 * 서버 streak·last_study_date가 권위 출처(handle_progress_recorded 트리거, KST 경계)이므로
 * 로컬 값 대신 서버 값을 반영한다. enum/수치는 방어적으로 검증한다 — 서버 값이 오염됐다면
 * null을 반환해 온보딩으로 재진입시키는 편이 안전하다(잘못된 goal/level로 홈에 들어가는 것보다).
 *
 * 반환:
 *  - onboarded_at == null → null (온보딩 미완료, 로컬 폴백)
 *  - goal/level이 허용 범위 밖 → null (오염 방어, 온보딩 재진입)
 *  - 그 외 → HydrationPatch (daily_goal_minutes·streak은 범위 밖이면 안전 기본값으로 폴백)
 */
export function profileToHydration(row: ProfileRow): HydrationPatch | null {
  if (row.onboarded_at == null) return null;
  if (!(VALID_GOALS as readonly string[]).includes(row.goal)) return null;
  if (!(VALID_LEVELS as readonly string[]).includes(row.level)) return null;

  // daily_goal_minutes: 1..120 정수만 유효 (init.sql CHECK과 동일), 그 외 기본값 10
  const minutes = row.daily_goal_minutes;
  const dailyGoalMinutes =
    Number.isInteger(minutes) && minutes >= 1 && minutes <= 120 ? minutes : 10;

  // streak: 0 이상 정수만 유효, 그 외 0으로 폴백
  const streak = Number.isInteger(row.streak) && row.streak >= 0 ? row.streak : 0;

  // last_study_date: YYYY-MM-DD 형식만 유효, 그 외(오염)는 null 폴백 — streak 판정이 안전하게 리셋된다
  const lastStudyDate =
    row.last_study_date != null && DATE_RE.test(row.last_study_date) ? row.last_study_date : null;

  return {
    onboarded: true,
    goal: row.goal,
    level: row.level,
    dailyGoalMinutes,
    streak,
    lastStudyDate,
  };
}

export interface RewardState {
  xp: number;
  streak: number;
  todaySpeakingSeconds: number;
  /** 마지막 학습 날짜 (YYYY-MM-DD, 로컬). null이면 첫 학습 */
  lastStudyDate: string | null;
}

export interface RewardInput {
  xp: number;
  speakingSeconds: number;
  /** 오늘 날짜 (YYYY-MM-DD). 주입으로 테스트 결정성 확보 — Date 직접 호출 금지 */
  today: string;
}

/**
 * 레슨 완료 보상을 로컬 상태에 적용한다 (낙관적 UI 갱신용).
 *
 * 주의: streak·발화시간의 **권위 있는 출처는 서버 트리거**(handle_progress_recorded, KST 경계)다.
 * 이 함수는 클라이언트 즉시 피드백용 근사치다. 날짜 판정은 로컬 YYYY-MM-DD 문자열 비교로 충분하며,
 * 정밀한 KST 경계 보정은 서버가 담당한다.
 */
export function applyLessonReward(state: RewardState, input: RewardInput): RewardState {
  const { today } = input;
  const studiedToday = state.lastStudyDate === today;

  // 어제 날짜 문자열 — Date 비교 없이 결정적으로 계산
  const yesterday = previousDay(today);

  let streak: number;
  if (studiedToday) {
    streak = state.streak; // 오늘 이미 학습 — streak 불변
  } else if (state.lastStudyDate === yesterday) {
    streak = state.streak + 1; // 어제 연속 학습
  } else {
    streak = 1; // 첫 학습 또는 공백 — 리셋
  }

  return {
    xp: state.xp + input.xp,
    streak,
    todaySpeakingSeconds: studiedToday
      ? state.todaySpeakingSeconds + input.speakingSeconds
      : input.speakingSeconds,
    lastStudyDate: today,
  };
}

/** YYYY-MM-DD 문자열의 전날을 반환한다 (UTC 기준 계산 — 로컬 비교용 순수 문자열 연산) */
function previousDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}
