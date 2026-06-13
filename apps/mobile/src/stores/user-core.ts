/**
 * user-core.ts — 온보딩 선택값·보상 적용 순수 로직 (U3).
 * RN·Supabase 의존 없는 순수 함수 — 단위 테스트로 계약 고정.
 */
import type { CEFRLevel, LearningGoal } from '@ted-speak/shared';

export interface OnboardingSelections {
  goal: LearningGoal;
  level: CEFRLevel;
  dailyGoalMinutes: number;
  /** 마이크 권한 — UI 분기용. DB 컬럼이 아니므로 profile update에 포함하지 않는다 */
  micGranted: boolean;
}

/**
 * profiles 테이블 update payload — grant 화이트리스트 컬럼만.
 *
 * 보안: profiles의 update grant는 (display_name, level, goal, daily_goal_minutes)뿐이다
 * (마이그레이션 36행). is_premium·streak·total_speaking_seconds·last_study_date 등 통계·과금
 * 컬럼은 서버 트리거/service_role 전담이므로 절대 포함하지 않는다. grant 밖 컬럼은
 * Supabase가 거부하지만, 시도 자체가 결함이므로 여기서 화이트리스트를 강제한다.
 */
export function buildProfileUpdate(selections: OnboardingSelections): {
  goal: LearningGoal;
  level: CEFRLevel;
  daily_goal_minutes: number;
} {
  return {
    goal: selections.goal,
    level: selections.level,
    daily_goal_minutes: selections.dailyGoalMinutes,
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
