/**
 * tutor-repo.ts — 프리토킹 세션 데이터 계층 (P2 W2).
 * progress-repo.ts 패턴: mock / supabase 두 모드를 동일 인터페이스(TutorRepo)로 제공한다.
 *
 * 보안:
 *  - supabase 모드는 화이트리스트 컬럼만 insert/update한다 (tutor_sessions / tutor_turns).
 *  - tutor duration_seconds는 profiles 통계에 누적하지 않는다(서버 트리거 없음 — ADR-0008,
 *    라이브 발화 시간 위조 방지가 어려워 farming 표면을 만들지 않는다). 주간 리포트는 클라 집계.
 *  - tutor_turns는 불변 로그 — insert만 한다(update/delete 없음).
 *  - transcript 등 PII를 console에 출력하지 않는다(에러 로그 포함).
 *  - 세션 완료(발화시간·턴수 확정)는 서버 RPC(complete_tutor_session)로만 한다 — duration_seconds를
 *    클라이언트가 위조하면 일일 캡이 무력화되므로 서버가 started_at 기준으로 산정한다(ADR-0008).
 */
import { SESSION_MAX_SECONDS } from './tutor-core';

/** 일일 프리토킹 시간 상한(초) — 5분 소프트 제한(MVP, ADR-0007 비용 통제) */
export const DAILY_CAP_SECONDS = 300;

/** 남은 일일 캡(초) — 음수는 0으로 클램프 */
export function remainingDailyCap(usedSeconds: number, cap: number = DAILY_CAP_SECONDS): number {
  return Math.max(0, cap - usedSeconds);
}

// ─────────────────────────────────────────────────────────────────────────────
// 공통 타입
// ─────────────────────────────────────────────────────────────────────────────

/** AsyncStorage 호환 시그니처 (mock 모드 영속 저장소) */
export interface KeyValueStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export interface TutorSessionRow {
  id: string;
  topic: string;
  status: 'in_progress' | 'completed' | 'aborted';
}

export interface TutorTurnInput {
  order: number;
  role: 'user' | 'assistant';
  transcript: string;
  corrections?: unknown[];
}

export interface CompleteTutorSessionInput {
  summary: unknown;
  durationSeconds: number;
  turnCount: number;
}

export interface TutorRepo {
  createSession: (topic: string) => Promise<TutorSessionRow>;
  appendTurn: (sessionId: string, turn: TutorTurnInput) => Promise<void>;
  completeSession: (sessionId: string, input: CompleteTutorSessionInput) => Promise<void>;
  /**
   * 오늘(KST) 누적 세션 시간(초) — 일일 캡 판정용.
   * 완료 세션은 서버 산정 duration_seconds, 진행 중 세션은 경과 시간(미완료/중단 우회 차단)을
   * SESSION_MAX_SECONDS로 클램프해 합산한다.
   */
  getTodaySessionSeconds: () => Promise<number>;
}

/** KST(Asia/Seoul) 기준 날짜 문자열(YYYY-MM-DD) — init.sql 통계 트리거 경계와 일치 */
function kstDateString(d: Date): string {
  // en-CA 로케일은 YYYY-MM-DD 형식을 보장한다
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Repo — KeyValueStorage 직렬화 영속, now 주입으로 날짜 결정성 확보
// ─────────────────────────────────────────────────────────────────────────────

interface MockSession {
  id: string;
  topic: string;
  status: TutorSessionRow['status'];
  /** 완료 시 기록되는 발화 시간(초) */
  durationSeconds: number;
  /** 세션 시작 KST 날짜(YYYY-MM-DD) */
  startedDate: string;
  /** 세션 시작 시각(ms) — 진행 중 세션의 경과 시간 산정용 */
  startedAtMs: number;
}

interface MockState {
  sessions: Record<string, MockSession>;
}

const MOCK_KEY_BASE = 'talkted.tutor.v1';

function mockKey(namespace?: string): string {
  return namespace ? `${MOCK_KEY_BASE}.${namespace}` : MOCK_KEY_BASE;
}

function emptyState(): MockState {
  return { sessions: {} };
}

/** mock 세션용 로컬 고유 id — 단말 내 충돌만 피하면 충분(uuid 의존 회피) */
function localId(): string {
  return `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createMockTutorRepo(
  storage: KeyValueStorage,
  opts: { now?: () => Date; namespace?: string } = {},
): TutorRepo {
  const now = opts.now ?? (() => new Date());
  const key = mockKey(opts.namespace);

  async function load(): Promise<MockState> {
    const raw = await storage.getItem(key);
    if (!raw) return emptyState();
    try {
      return { ...emptyState(), ...(JSON.parse(raw) as MockState) };
    } catch {
      // 손상된 저장소 — PII 노출 없이 빈 상태로 복구
      return emptyState();
    }
  }

  async function save(state: MockState): Promise<void> {
    await storage.setItem(key, JSON.stringify(state));
  }

  return {
    async createSession(topic) {
      const state = await load();
      const t = now();
      const session: MockSession = {
        id: localId(),
        topic,
        status: 'in_progress',
        durationSeconds: 0,
        startedDate: kstDateString(t),
        startedAtMs: t.getTime(),
      };
      state.sessions[session.id] = session;
      await save(state);
      return { id: session.id, topic, status: 'in_progress' };
    },

    async appendTurn() {
      // mock은 턴 본문을 보존하지 않는다(요약 통계만 관심) — PII 디스크 영속 최소화.
      // 인터페이스 계약(throw 안 함)만 만족한다.
      return;
    },

    async completeSession(sessionId, input) {
      const state = await load();
      const session = state.sessions[sessionId];
      if (!session) return;
      session.status = 'completed';
      session.durationSeconds = Math.max(0, input.durationSeconds);
      await save(state);
    },

    async getTodaySessionSeconds() {
      const state = await load();
      const t = now();
      const today = kstDateString(t);
      return Object.values(state.sessions)
        .filter((s) => s.startedDate === today)
        .reduce((sum, s) => sum + sessionSeconds(s.status, s.durationSeconds, t.getTime() - s.startedAtMs), 0);
    },
  };
}

/**
 * 세션 1건의 캡 반영 시간(초).
 * 완료 세션은 서버/저장된 duration_seconds, 진행 중·중단 세션은 경과 시간을 SESSION_MAX_SECONDS로
 * 클램프해 쓴다 — 미완료로 두면 캡을 우회하는 것을 막는다(MEDIUM 보안 리뷰 반영).
 */
function sessionSeconds(status: string, durationSeconds: number, elapsedMs: number): number {
  if (status === 'completed') return Math.max(0, durationSeconds);
  const elapsed = Math.max(0, Math.floor(elapsedMs / 1000));
  return Math.min(elapsed, SESSION_MAX_SECONDS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Repo — 실제 supabase-js 체이닝과 호환되는 호출 형태
// ─────────────────────────────────────────────────────────────────────────────

interface SupabaseLike {
  from: (table: string) => {
    select: (...args: unknown[]) => any;
    insert: (...args: unknown[]) => any;
    update: (...args: unknown[]) => any;
  };
  rpc: (fn: string, params: Record<string, unknown>) => any;
}

/** 데이터 계층 에러 — PII·서버 원문을 포함하지 않는다 */
function dataError(operation: string): Error {
  return new Error(`tutor-repo: ${operation} 실패`);
}

/** KST 오늘 0시의 UTC ISO — started_at 범위 조회용 */
function kstTodayStartIso(d: Date): string {
  const ymd = kstDateString(d); // YYYY-MM-DD (KST)
  // KST 자정 = 전날 15:00 UTC. ISO에 +09:00 오프셋을 명시해 정확히 환산한다.
  return new Date(`${ymd}T00:00:00+09:00`).toISOString();
}

export function createSupabaseTutorRepo(
  client: SupabaseLike,
  userId: string,
  opts: { now?: () => Date } = {},
): TutorRepo {
  const now = opts.now ?? (() => new Date());
  return {
    async createSession(topic) {
      // insert payload는 grant 화이트리스트(user_id, topic)만 — status/started_at/duration은 default.
      const res = await client
        .from('tutor_sessions')
        .insert({ user_id: userId, topic })
        .select('id, topic, status');
      if (res.error) throw dataError('세션 생성');
      const rows = (res.data as Record<string, unknown>[] | null) ?? [];
      if (rows.length === 0) throw dataError('세션 생성 행 반환');
      const row = rows[0];
      return {
        id: String(row.id),
        topic: String(row.topic ?? topic),
        status: (row.status as TutorSessionRow['status']) ?? 'in_progress',
      };
    },

    async appendTurn(sessionId, turn) {
      // tutor_turns insert (불변 로그). transcript는 저장하되 절대 로깅하지 않는다.
      const { error } = await client.from('tutor_turns').insert({
        session_id: sessionId,
        order: turn.order,
        role: turn.role,
        transcript: turn.transcript,
        corrections: turn.corrections ?? [],
      });
      if (error) throw dataError('대화 턴 저장');
    },

    async completeSession(sessionId, input) {
      // 완료는 서버 RPC로만 — duration_seconds를 서버가 started_at 기준으로 산정한다(클라 위조 차단).
      // 클라가 보고한 durationSeconds는 신뢰하지 않으므로 전달하지 않는다.
      const { error } = await client.rpc('complete_tutor_session', {
        p_session_id: sessionId,
        p_turn_count: input.turnCount,
        p_summary: input.summary,
      });
      if (error) throw dataError('세션 완료');
    },

    async getTodaySessionSeconds() {
      // RLS가 본인 행만 반환하므로 user_id 필터 없이 오늘(KST) 시작 이후 세션을 조회한다.
      const { data, error } = await client
        .from('tutor_sessions')
        .select('duration_seconds, status, started_at')
        .gte('started_at', kstTodayStartIso(now()));
      if (error) throw dataError('당일 세션 시간 조회');
      const rows = (data as Record<string, unknown>[] | null) ?? [];
      const nowMs = now().getTime();
      return rows.reduce((sum, r) => {
        const elapsedMs = nowMs - new Date(String(r.started_at ?? 0)).getTime();
        return sum + sessionSeconds(String(r.status ?? ''), Number(r.duration_seconds ?? 0), elapsedMs);
      }, 0);
    },
  };
}
