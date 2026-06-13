/**
 * 레슨 3단계 상태 머신 (U5~U7) — Learn → Drill → Conversation → complete.
 * zustand·RN 의존 없는 순수 로직으로, 모든 전이는 불변 업데이트한다.
 * 타입은 @ted-speak/shared의 zod 스키마에서 파생 (중복 정의 금지 — CLAUDE.md).
 */
import type { Correction, Lesson, TurnFeedback } from '@ted-speak/shared';

/** 레슨 진행 단계 */
export type LessonStep = 'learn' | 'drill' | 'conversation' | 'complete';

/** 드릴 채점 임계값 기본값 (drill-score.ts와 동일) */
const DEFAULT_PASS_THRESHOLD = 80;
/** 연속 실패 N회부터 건너뛰기 허용 */
const SKIP_AFTER_FAILS = 2;
/** 레슨 완료 시 부여 XP (고정) */
const LESSON_XP = 30;
/** 요약 문구 최대 노출 개수 */
const MAX_SUMMARY_ITEMS = 2;

// ── 상태 ──────────────────────────────────────────────────────────────────────

export interface LessonState {
  step: LessonStep;
  /** 현재 드릴 인덱스 (0-based) */
  drillIndex: number;
  /** 현재 드릴 연속 실패 횟수 */
  drillFails: number;
  /** 건너뛰기 가능 여부 (연속 2회 실패 시 true) */
  canSkipDrill: boolean;
  /** Conversation 단계 누적 턴 수 */
  turnCount: number;
  /** Conversation 단계 누적 교정 (요약 재료) */
  corrections: Correction[];
  /** 발화한 문장 수 (드릴 통과 + 대화 턴) */
  sentencesSpoken: number;
  /** 누적 발화 시간(초) */
  speakingSeconds: number;
}

/** 드릴 채점 결과 입력 — 점수는 scoreDrill()로 미리 계산해 전달 */
export interface DrillResultInput {
  score: number;
  missing: string[];
  passThreshold?: number;
  speakingSeconds: number;
}

/**
 * 드릴 처리 결과 분기.
 * missing은 모든 분기에 두어 호출부에서 타입 가드 없이 접근 가능(계약 테스트 요건).
 * pass일 때는 빈 배열.
 */
export type DrillOutcome =
  | { kind: 'pass'; missing: string[] }
  | { kind: 'retry'; missing: string[] }
  | { kind: 'skip_available'; missing: string[] };

/** 대화 턴 입력 */
export interface ConversationTurnInput {
  feedback: TurnFeedback;
  speakingSeconds: number;
}

/** 완료 화면용 요약 */
export interface LessonSummary {
  xp: number;
  sentencesSpoken: number;
  speakingSeconds: number;
  /** 잘한 점 (최대 2개) */
  strengths: string[];
  /** 다음엔 이렇게 (최대 2개) */
  improvements: string[];
}

// ── 전이 함수 ──────────────────────────────────────────────────────────────────

/** 초기 상태 — learn 단계, 모든 카운터 0 */
export function createLessonState(_lesson: Lesson): LessonState {
  return {
    step: 'learn',
    drillIndex: 0,
    drillFails: 0,
    canSkipDrill: false,
    turnCount: 0,
    corrections: [],
    sentencesSpoken: 0,
    speakingSeconds: 0,
  };
}

/** Learn 완료 → Drill 진입 */
export function completeLearn(state: LessonState): LessonState {
  return { ...state, step: 'drill' };
}

/** 마지막 드릴 다음으로 넘어갈 단계 결정 */
function stepAfterDrill(nextDrillIndex: number, lesson: Lesson): LessonStep {
  return nextDrillIndex >= lesson.drills.length ? 'conversation' : 'drill';
}

/**
 * 드릴 채점 결과 적용.
 * - 통과(score ≥ threshold): drillIndex+1, fails·canSkip 리셋, 발화 카운트 누적.
 *   마지막 드릴이면 conversation으로 전이.
 * - 실패: fails+1. 누적 2회부터 건너뛰기 허용(skip_available), 그 전엔 retry.
 *   실패해도 발화 카운트는 누적하지 않는다(모범 발음 재시도 유도).
 */
export function applyDrillResult(
  state: LessonState,
  lesson: Lesson,
  input: DrillResultInput,
): { state: LessonState; outcome: DrillOutcome } {
  const threshold = input.passThreshold ?? DEFAULT_PASS_THRESHOLD;

  if (input.score >= threshold) {
    const nextDrillIndex = state.drillIndex + 1;
    return {
      state: {
        ...state,
        step: stepAfterDrill(nextDrillIndex, lesson),
        drillIndex: nextDrillIndex,
        drillFails: 0,
        canSkipDrill: false,
        sentencesSpoken: state.sentencesSpoken + 1,
        speakingSeconds: state.speakingSeconds + input.speakingSeconds,
      },
      outcome: { kind: 'pass', missing: [] },
    };
  }

  const drillFails = state.drillFails + 1;
  const canSkipDrill = drillFails >= SKIP_AFTER_FAILS;
  return {
    state: {
      ...state,
      drillFails,
      canSkipDrill,
      // 실패도 발화 시간은 누적(연습한 만큼 인정), 문장 수는 통과 시에만.
      speakingSeconds: state.speakingSeconds + input.speakingSeconds,
    },
    outcome: canSkipDrill
      ? { kind: 'skip_available', missing: input.missing }
      : { kind: 'retry', missing: input.missing },
  };
}

/**
 * 드릴 건너뛰기 — canSkipDrill일 때만 동작(아니면 no-op).
 * drillIndex+1, fails·canSkip 리셋. 발화 카운트는 늘리지 않는다.
 */
export function skipDrill(state: LessonState, lesson: Lesson): LessonState {
  if (!state.canSkipDrill) return state;

  const nextDrillIndex = state.drillIndex + 1;
  return {
    ...state,
    step: stepAfterDrill(nextDrillIndex, lesson),
    drillIndex: nextDrillIndex,
    drillFails: 0,
    canSkipDrill: false,
  };
}

/**
 * 대화 턴 적용 — conversation 단계에서만 동작(아니면 no-op).
 * turnCount·sentencesSpoken+1, speakingSeconds·corrections 누적.
 * turnCount가 targetTurns에 도달하면 complete로 전이.
 */
export function applyConversationTurn(
  state: LessonState,
  lesson: Lesson,
  input: ConversationTurnInput,
): LessonState {
  if (state.step !== 'conversation') return state;

  const turnCount = state.turnCount + 1;
  const reachedTarget = turnCount >= lesson.conversation.targetTurns;
  return {
    ...state,
    step: reachedTarget ? 'complete' : 'conversation',
    turnCount,
    sentencesSpoken: state.sentencesSpoken + 1,
    speakingSeconds: state.speakingSeconds + input.speakingSeconds,
    corrections: [...state.corrections, ...input.feedback.corrections],
  };
}

// ── 직렬화 ────────────────────────────────────────────────────────────────────

/** 상태를 JSON 문자열로 직렬화 (LessonSession 스냅샷 보존용) */
export function toSnapshot(state: LessonState): string {
  return JSON.stringify(state);
}

const STEPS: readonly LessonStep[] = ['learn', 'drill', 'conversation', 'complete'];

/** 알 수 없는 값이 유한한 0 이상 정수인지 */
function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/**
 * JSON 스냅샷에서 상태 복원 — 방어적.
 * parse 실패·필드 누락/타입 불일치·드릴 인덱스 범위 초과 시 초기 상태로 폴백한다.
 */
export function fromSnapshot(json: string, lesson: Lesson): LessonState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return createLessonState(lesson);
  }

  if (typeof raw !== 'object' || raw === null) return createLessonState(lesson);
  const o = raw as Record<string, unknown>;

  const stepOk = typeof o.step === 'string' && (STEPS as readonly string[]).includes(o.step);
  const countsOk =
    isCount(o.drillIndex) &&
    isCount(o.drillFails) &&
    isCount(o.turnCount) &&
    isCount(o.sentencesSpoken) &&
    typeof o.speakingSeconds === 'number' &&
    Number.isFinite(o.speakingSeconds) &&
    o.speakingSeconds >= 0;
  const flagsOk = typeof o.canSkipDrill === 'boolean';
  const correctionsOk = Array.isArray(o.corrections);

  if (!stepOk || !countsOk || !flagsOk || !correctionsOk) {
    return createLessonState(lesson);
  }
  // 드릴 인덱스가 레슨 드릴 수 이상이면 손상으로 간주.
  if ((o.drillIndex as number) > lesson.drills.length) {
    return createLessonState(lesson);
  }

  return {
    step: o.step as LessonStep,
    drillIndex: o.drillIndex as number,
    drillFails: o.drillFails as number,
    canSkipDrill: o.canSkipDrill as boolean,
    turnCount: o.turnCount as number,
    corrections: o.corrections as Correction[],
    sentencesSpoken: o.sentencesSpoken as number,
    speakingSeconds: o.speakingSeconds as number,
  };
}

// ── 요약 ──────────────────────────────────────────────────────────────────────

/** 교정 type → 개선 문구 (사용자 노출, "다음엔 이렇게" 톤) */
const IMPROVEMENT_LABEL: Record<Correction['type'], string> = {
  grammar: '문장 어순과 문법을 한 번 더 다듬어 봐요.',
  vocab: '상황에 더 맞는 단어를 골라 말해 봐요.',
  pronunciation: '핵심 단어 발음을 또박또박 연습해 봐요.',
};

/**
 * 완료 요약 생성.
 * - xp 30 고정, 발화 통계는 누적값 그대로.
 * - corrections를 type별 집계해 improvements 생성(많은 순, 최대 2개).
 * - 교정이 없으면 improvements는 비우고 strengths에 격려 문구.
 */
export function summarize(state: LessonState, _lesson: Lesson): LessonSummary {
  // type별 교정 건수 집계
  const byType = new Map<Correction['type'], number>();
  for (const c of state.corrections) {
    byType.set(c.type, (byType.get(c.type) ?? 0) + 1);
  }

  const improvements = [...byType.entries()]
    .sort((a, b) => b[1] - a[1]) // 자주 틀린 영역 우선
    .slice(0, MAX_SUMMARY_ITEMS)
    .map(([type]) => IMPROVEMENT_LABEL[type]);

  // strengths — 늘 1~2개 보장 (완료 자체가 성취)
  const strengths: string[] = ['레슨을 끝까지 완주했어요. 잘했어요!'];
  if (state.corrections.length === 0) {
    strengths.push('교정 없이 자연스럽게 말했어요.');
  } else {
    strengths.push(`${state.turnCount}번의 대화 턴을 끝까지 이어갔어요.`);
  }

  return {
    xp: LESSON_XP,
    sentencesSpoken: state.sentencesSpoken,
    speakingSeconds: state.speakingSeconds,
    strengths: strengths.slice(0, MAX_SUMMARY_ITEMS),
    improvements,
  };
}
