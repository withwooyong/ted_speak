/**
 * 프리토킹 세션 상태 머신 (P2 W2) — topic → connecting → active → ending → summary.
 * zustand·RN·전송 계층 의존 없는 순수 로직. 모든 전이는 불변 업데이트한다.
 * 레슨(lesson-core.ts) 패턴을 미러링하되, 자유 대화는 단계가 아니라 시간·턴으로 진행한다.
 * 교정 타입은 @ted-speak/shared의 zod 스키마에서 파생(Correction).
 */
import type { Correction, RoleplayObjective } from '@ted-speak/shared';

/** 세션 진행 단계 */
export type TutorPhase = 'topic' | 'connecting' | 'active' | 'ending' | 'summary';

/** 세션 종료 사유 — 요약 문구·로깅용 */
export type TutorEndReason = 'time_up' | 'user_ended' | 'error';

/** 세션 길이 상한(초) — 5분. ADR-0007 비용 통제(일일 시간 상한과 함께) */
export const SESSION_MAX_SECONDS = 300;
/** 턴당 발화 시간 상한(초) — 부풀리기/비용 1차 방어, 레슨과 동일 제약 */
export const TURN_MAX_SECONDS = 30;
/** 모델 전송용 히스토리 슬라이딩 윈도우(턴) — 레슨과 동일 */
export const HISTORY_WINDOW = 6;
/** 요약 문구 최대 노출 개수 */
const MAX_SUMMARY_ITEMS = 2;

// ── 시드 주제 ─────────────────────────────────────────────────────────────────

export interface TutorTopic {
  id: string;
  /** 사용자 노출 제목(한글) */
  title: string;
  /** 영문 제목 */
  titleEn: string;
  /** 모델 system 프롬프트에 주입할 대화 유도 방향(영문) */
  prompt: string;
}

/** MVP 시드 프리토킹 주제 — 초·중급(A1~B1) 일상 회화 중심 */
export const TUTOR_TOPICS: readonly TutorTopic[] = [
  {
    id: 'daily-life',
    title: '오늘 하루',
    titleEn: 'Your Day',
    prompt: 'Chat casually about how the learner spent their day and small daily routines.',
  },
  {
    id: 'hobbies',
    title: '취미와 여가',
    titleEn: 'Hobbies & Free Time',
    prompt: 'Talk about the learner’s hobbies, weekend plans, and things they enjoy.',
  },
  {
    id: 'travel',
    title: '여행 이야기',
    titleEn: 'Travel',
    prompt: 'Chat about places the learner has visited or wants to visit, and travel experiences.',
  },
  {
    id: 'food',
    title: '음식과 맛집',
    titleEn: 'Food',
    prompt: 'Talk about favorite foods, cooking, and restaurants in a friendly way.',
  },
];

/** id로 주제 조회 — 없으면 undefined */
export function findTopic(topicId: string): TutorTopic | undefined {
  return TUTOR_TOPICS.find((t) => t.id === topicId);
}

// ── 상태 ──────────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  role: 'user' | 'assistant';
  text: string;
}

export interface TutorState {
  phase: TutorPhase;
  topicId: string;
  /** 완료된 교환(사용자+Ted) 수 */
  turnCount: number;
  /** 누적 교정 (요약 재료) */
  corrections: Correction[];
  /** 누적 발화 시간(초) — 사용자 발화만 */
  speakingSeconds: number;
  /** 세션 경과 시간(초) — tick으로 갱신 */
  elapsedSeconds: number;
  /** 모델 전송용 최근 대화 (최대 HISTORY_WINDOW) */
  history: HistoryEntry[];
  /** 종료 사유 — 아직 종료 전이면 null */
  endedReason: TutorEndReason | null;
  /** 롤플레이 목표 (프리토킹은 빈 배열) — 종료 시 체크리스트로 노출 */
  objectives: readonly RoleplayObjective[];
  /** 달성된 목표 id (objectives에 존재하는 id만, 중복 없음) */
  metObjectiveIds: string[];
}

export interface UserTurnInput {
  transcript: string;
  /** 이 턴의 발화 시간(초) — TURN_MAX_SECONDS로 클램프된다 */
  seconds: number;
}

export interface TedTurnInput {
  reply: string;
  corrections: Correction[];
  /** 이 턴에 달성된 롤플레이 목표 id (라이브에선 모델 판정, 목에선 스크립트) */
  metObjectiveIds?: string[];
}

/** 롤플레이 목표 달성 판정 — 프리토킹이면 summary.goal=null */
export interface TutorGoalSummary {
  /** 전체 목표 수 */
  total: number;
  /** 달성한 목표 수 */
  met: number;
  /** 전체 달성 여부 */
  achieved: boolean;
  /** objectives 순서·라벨 보존한 달성 체크리스트 */
  checklist: { id: string; label: string; met: boolean }[];
}

export interface TutorSummary {
  speakingSeconds: number;
  turnCount: number;
  endedReason: TutorEndReason | null;
  /** 잘한 점 (최대 2개) */
  strengths: string[];
  /** 다음엔 이렇게 (최대 2개) */
  improvements: string[];
  /** 롤플레이 목표 판정 — 프리토킹(목표 없음)이면 null */
  goal: TutorGoalSummary | null;
}

// ── 전이 함수 ──────────────────────────────────────────────────────────────────

/**
 * 초기 상태 — topic 선택 단계, 모든 카운터 0.
 * 롤플레이는 시나리오 objectives를 주입하고, 프리토킹은 기본 빈 배열(목표 없음)로 시작한다.
 */
export function createTutorState(
  topicId: string,
  objectives: readonly RoleplayObjective[] = [],
): TutorState {
  return {
    phase: 'topic',
    topicId,
    turnCount: 0,
    corrections: [],
    speakingSeconds: 0,
    elapsedSeconds: 0,
    history: [],
    endedReason: null,
    objectives,
    metObjectiveIds: [],
  };
}

/** topic → connecting (전송 계층 연결 시작) */
export function startConnecting(state: TutorState): TutorState {
  if (state.phase !== 'topic') return state;
  return { ...state, phase: 'connecting' };
}

/** connecting → active (연결 완료, 대화 시작) */
export function markActive(state: TutorState): TutorState {
  if (state.phase !== 'connecting') return state;
  return { ...state, phase: 'active' };
}

/** 히스토리에 항목을 추가하고 윈도우를 트림 */
function pushHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...history, entry];
  return next.length > HISTORY_WINDOW ? next.slice(next.length - HISTORY_WINDOW) : next;
}

/**
 * 사용자 발화 턴 적용 — active 단계에서만 동작(아니면 no-op).
 * 발화 시간을 TURN_MAX_SECONDS로 클램프해 누적하고 history에 추가한다.
 * turnCount는 교환이 끝나는 applyTedTurn에서 증가한다(이중 집계 방지).
 */
export function applyUserTurn(state: TutorState, input: UserTurnInput): TutorState {
  if (state.phase !== 'active') return state;
  const seconds = Math.max(0, Math.min(input.seconds, TURN_MAX_SECONDS));
  return {
    ...state,
    speakingSeconds: state.speakingSeconds + seconds,
    history: pushHistory(state.history, { role: 'user', text: input.transcript }),
  };
}

/**
 * 들어온 목표 신호를 기존 달성 목록에 머지한다.
 * - objectives에 실제로 존재하는 id만 채택(미지의 id 무시 — 전송 신뢰 경계).
 * - 중복 제거, 기존 순서 유지 + 새 달성을 뒤에 추가.
 */
function mergeMetObjectives(state: TutorState, incoming: string[] | undefined): string[] {
  if (!incoming || incoming.length === 0) return state.metObjectiveIds;
  const valid = new Set(state.objectives.map((o) => o.id));
  const seen = new Set(state.metObjectiveIds);
  const merged = [...state.metObjectiveIds];
  for (const id of incoming) {
    if (valid.has(id) && !seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
}

/**
 * Ted 응답 턴 적용 — active 단계에서만 동작(아니면 no-op).
 * 교환 1회 완료로 보고 turnCount+1, 교정 누적, assistant history 추가.
 * 롤플레이면 metObjectiveIds를 머지(프리토킹은 미지정 → 변화 없음).
 */
export function applyTedTurn(state: TutorState, input: TedTurnInput): TutorState {
  if (state.phase !== 'active') return state;
  return {
    ...state,
    turnCount: state.turnCount + 1,
    corrections: [...state.corrections, ...input.corrections],
    history: pushHistory(state.history, { role: 'assistant', text: input.reply }),
    metObjectiveIds: mergeMetObjectives(state, input.metObjectiveIds),
  };
}

/**
 * 경과 시간 갱신 — active 단계에서만 의미. elapsedSeconds를 설정하고,
 * SESSION_MAX_SECONDS에 도달하면 ending(time_up)으로 전이한다.
 */
export function tick(state: TutorState, elapsedSeconds: number): TutorState {
  if (state.phase !== 'active') return state;
  if (elapsedSeconds >= SESSION_MAX_SECONDS) {
    return { ...state, elapsedSeconds, phase: 'ending', endedReason: 'time_up' };
  }
  return { ...state, elapsedSeconds };
}

/**
 * 세션 종료 — active/ending에서 ending으로 전이하고 사유를 남긴다.
 * 이미 종료 사유가 있으면(예: tick이 time_up 설정) 사유를 덮어쓰지 않는다.
 */
export function endSession(state: TutorState, reason: TutorEndReason): TutorState {
  if (state.phase !== 'active' && state.phase !== 'ending') return state;
  return {
    ...state,
    phase: 'ending',
    endedReason: state.endedReason ?? reason,
  };
}

/** ending → summary (전송 종료·최종 교정 정리 후 요약 화면) */
export function toSummary(state: TutorState): TutorState {
  if (state.phase !== 'ending') return state;
  return { ...state, phase: 'summary' };
}

// ── 요약 ──────────────────────────────────────────────────────────────────────

/** 교정 type → 개선 문구 (프리토킹 톤, "다음엔 이렇게") */
const IMPROVEMENT_LABEL: Record<Correction['type'], string> = {
  grammar: '문장 어순과 문법을 조금 더 다듬어 봐요.',
  vocab: '상황에 더 어울리는 표현을 골라 말해 봐요.',
  pronunciation: '핵심 단어 발음을 또박또박 연습해 봐요.',
};

/**
 * 롤플레이 목표 판정 생성 — objectives가 없으면(프리토킹) null.
 * 체크리스트는 objectives 순서·라벨을 보존하고, 각 목표의 달성 여부를 표시한다.
 */
function buildGoalSummary(state: TutorState): TutorGoalSummary | null {
  if (state.objectives.length === 0) return null;
  const met = new Set(state.metObjectiveIds);
  const checklist = state.objectives.map((o) => ({
    id: o.id,
    label: o.label,
    met: met.has(o.id),
  }));
  const metCount = checklist.filter((c) => c.met).length;
  return {
    total: state.objectives.length,
    met: metCount,
    achieved: metCount === state.objectives.length,
    checklist,
  };
}

/**
 * 세션 요약 생성.
 * - 발화 통계는 누적값 그대로.
 * - corrections를 type별 집계해 improvements 생성(빈도순, 최대 2개).
 * - strengths는 항상 1~2개 보장(대화를 이어간 것 자체가 성취).
 * - 롤플레이면 목표 판정(goal)을 채우고, 전체 달성 시 칭찬 strength를 우선 노출.
 */
export function summarizeTutor(state: TutorState): TutorSummary {
  const byType = new Map<Correction['type'], number>();
  for (const c of state.corrections) {
    byType.set(c.type, (byType.get(c.type) ?? 0) + 1);
  }

  const improvements = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SUMMARY_ITEMS)
    .map(([type]) => IMPROVEMENT_LABEL[type]);

  const goal = buildGoalSummary(state);

  const strengths: string[] = [];
  if (goal?.achieved) {
    strengths.push('롤플레이 목표를 모두 달성했어요. 훌륭해요! 🎉');
  }
  strengths.push(
    state.turnCount > 0
      ? '끝까지 영어로 대화를 이어갔어요. 멋져요!'
      : '대화를 시작한 것만으로도 좋은 출발이에요!',
  );
  if (state.turnCount > 0) {
    strengths.push(
      state.corrections.length === 0
        ? '교정 없이 자연스럽게 말했어요.'
        : `${state.turnCount}번의 대화를 주고받았어요.`,
    );
  }

  return {
    speakingSeconds: state.speakingSeconds,
    turnCount: state.turnCount,
    endedReason: state.endedReason,
    strengths: strengths.slice(0, MAX_SUMMARY_ITEMS),
    improvements,
    goal,
  };
}
