/**
 * weekly-report.ts — 주간 스피킹 리포트 집계 (P2 W6).
 *
 * 저장소 의존 없는 순수 함수만 — history.ts 패턴(단위 테스트 용이).
 * 모든 지표는 **서버 측 불변값**만 집계한다(ADR-0010 정직성 원칙 — 가짜 지표 출시 안 함):
 *  - 발화 시간: 레슨(user_progress.speaking_seconds — 완료 시 서버 적재·불변) +
 *    튜터(tutor_sessions.duration_seconds — complete_tutor_session RPC가 now()-started_at로 산정).
 *  - 완료 레슨 수: 기간 내 user_progress 행 수(PK가 (user_id, lesson_id)라 레슨당 1행·최초 완료 시각).
 *  - 교정 TOP5: 기간 내 대화 턴 corrections를 빈도순 집계(사용자가 실제로 받은 교정만).
 *
 * 기간은 rolling 7일(now - 7d) — 캘린더 주의 "월요일 빈 카드" UX 문제를 피한다. now 주입으로 결정적.
 */
import type { Correction } from '@ted-speak/shared';

import type { ProgressRecord, ProgressRepo } from './progress-repo';
import type { TutorRepo, TutorSessionSummary } from './tutor-repo';

/** 집계 기간 — 최근 7일 */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 교정 1건의 빈도 집계 결과 */
export interface CorrectionCount {
  original: string;
  suggested: string;
  type: Correction['type'];
  count: number;
}

/** 주간 리포트 — 프로필 카드용 */
export interface WeeklyReport {
  /** 레슨 + 완료 튜터 세션 발화 시간(초) */
  speakingSeconds: number;
  /** 기간 내 완료 레슨 수 */
  completedLessons: number;
  /** 교정 빈도 상위 N */
  topCorrections: CorrectionCount[];
}

/** 집계 기간 시작 시각(ms) — now 기준 7일 전 */
export function weekStartMs(now: Date): number {
  return now.getTime() - WEEK_MS;
}

/** ISO 시각이 [weekStart, now] 구간 안인지 — 파싱 불가/미래는 제외 */
export function isWithinWeek(iso: string, now: Date): boolean {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return false;
  return ts >= weekStartMs(now) && ts <= now.getTime();
}

/**
 * 기간 내 발화 시간(초) — 레슨 speaking_seconds + 완료 튜터 duration_seconds.
 * 진행 중·중단 튜터 세션은 확정 발화가 아니므로 제외한다(완료분만 센다).
 */
export function sumSpeakingSeconds(
  progress: ProgressRecord[],
  tutor: TutorSessionSummary[],
  now: Date,
): number {
  const lessonSeconds = progress
    .filter((p) => isWithinWeek(p.completedAt, now))
    .reduce((sum, p) => sum + Math.max(0, p.speakingSeconds), 0);
  const tutorSeconds = tutor
    .filter((t) => t.status === 'completed' && isWithinWeek(t.startedAt, now))
    .reduce((sum, t) => sum + Math.max(0, t.durationSeconds), 0);
  return lessonSeconds + tutorSeconds;
}

/** 기간 내 완료 레슨 수 — user_progress 행은 레슨당 1행(최초 완료) */
export function countCompletedLessons(progress: ProgressRecord[], now: Date): number {
  return progress.filter((p) => isWithinWeek(p.completedAt, now)).length;
}

/** 정규화 dedupe 키 — 대소문자·앞뒤·중복 공백 차이를 같은 교정으로 묶는다 */
function correctionKey(c: Correction): string {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  // JSON 배열 키 — 원문에 구분자(→ 등)가 섞여도 다른 교정이 충돌하지 않는다.
  return JSON.stringify([norm(c.original), norm(c.suggested)]);
}

/**
 * 교정을 빈도순으로 집계해 상위 limit개 반환.
 * - 정규화 키로 dedupe하되 대표 표기(original/suggested/type)는 첫 등장 기준.
 * - count 내림차순, 동률은 첫 등장 순서를 안정적으로 유지(Map 삽입 순서 + 안정 정렬).
 */
export function topCorrections(corrections: Correction[], limit = 5): CorrectionCount[] {
  const acc = new Map<string, CorrectionCount & { seq: number }>();
  corrections.forEach((c, i) => {
    const key = correctionKey(c);
    const existing = acc.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      acc.set(key, { original: c.original, suggested: c.suggested, type: c.type, count: 1, seq: i });
    }
  });
  return [...acc.values()]
    .sort((a, b) => b.count - a.count || a.seq - b.seq)
    .slice(0, limit)
    .map(({ original, suggested, type, count }) => ({ original, suggested, type, count }));
}

/** 발화·완료·교정을 한 리포트로 조립 */
export function buildWeeklyReport(input: {
  progress: ProgressRecord[];
  tutor: TutorSessionSummary[];
  corrections: Correction[];
  now: Date;
}): WeeklyReport {
  return {
    speakingSeconds: sumSpeakingSeconds(input.progress, input.tutor, input.now),
    completedLessons: countCompletedLessons(input.progress, input.now),
    topCorrections: topCorrections(input.corrections),
  };
}

/** 리포트 집계가 의존하는 저장소 읽기 메서드(주입 가능 — 단위 테스트 용이) */
type ProgressSource = Pick<ProgressRepo, 'listProgress' | 'listSessions' | 'getSessionTurns'>;
type TutorSource = Pick<TutorRepo, 'listSessions' | 'getSessionTurns'>;

/**
 * 저장소에서 주간 리포트를 집계한다. 교정은 **기간 내 세션의 턴**에서만 모은다(N+1, 주간 세션 수 적음).
 * 발화·완료 집계는 buildWeeklyReport가 기간을 내부 필터링하므로 전체 목록을 그대로 넘긴다.
 * repo가 null(미로그인/미초기화)이면 해당 출처는 빈 값으로 취급한다.
 *
 * 주의: 교정 턴은 세션 `startedAt` 기준으로 필터링하고 완료 레슨은 `completedAt` 기준이라,
 * 기간 경계에 걸쳐 시작·완료된 레슨은 교정이 누락될 수 있다(레슨은 수 시간 내 완료 설계라 실무상 무해).
 */
export async function collectWeeklyReport(deps: {
  progressRepo: ProgressSource | null;
  tutorRepo: TutorSource | null;
  now: Date;
}): Promise<WeeklyReport> {
  const { progressRepo, tutorRepo, now } = deps;
  const [progress, lessonSessions, tutorSessions] = await Promise.all([
    progressRepo ? progressRepo.listProgress() : Promise.resolve([]),
    progressRepo ? progressRepo.listSessions() : Promise.resolve([]),
    tutorRepo ? tutorRepo.listSessions() : Promise.resolve([]),
  ]);

  const lessonTurnFetches = progressRepo
    ? lessonSessions.filter((s) => isWithinWeek(s.startedAt, now)).map((s) => progressRepo.getSessionTurns(s.id))
    : [];
  const tutorTurnFetches = tutorRepo
    ? tutorSessions.filter((s) => isWithinWeek(s.startedAt, now)).map((s) => tutorRepo.getSessionTurns(s.id))
    : [];
  const turnLists = await Promise.all([...lessonTurnFetches, ...tutorTurnFetches]);
  const corrections = turnLists.flat().flatMap((t) => t.corrections);

  return buildWeeklyReport({ progress, tutor: tutorSessions, corrections, now });
}
