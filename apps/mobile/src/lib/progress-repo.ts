/**
 * progress-repo.ts — 진행 저장 데이터 계층 (U7).
 * supabase / mock 두 모드를 동일 인터페이스(ProgressRepo)로 제공한다.
 *
 * 보안:
 *  - supabase 모드는 grant 화이트리스트 컬럼만 insert/update한다 (마이그레이션 §user_progress/§lesson_sessions).
 *    통계(streak/total_speaking_seconds)는 서버 트리거(handle_progress_recorded) 전담이므로
 *    클라이언트는 profiles를 직접 건드리지 않는다.
 *  - transcript·이메일 등 PII를 console에 출력하지 않는다 (에러 로그 포함).
 *  - conversation_turns는 불변 로그 — insert만 한다 (update/delete 없음).
 */
import type { SessionStatus } from '@ted-speak/shared';

/**
 * mock 세션용 로컬 고유 id. 실제 세션 id는 서버가 gen_random_uuid()로 발급하므로
 * 여기서는 단말 내 충돌만 피하면 충분하다 (uuid 의존성 회피).
 */
function localId(): string {
  return `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 공통 타입
// ─────────────────────────────────────────────────────────────────────────────

/** AsyncStorage 호환 시그니처 (mock 모드 영속 저장소) */
export interface KeyValueStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export interface SessionRow {
  id: string;
  lessonId: string;
  currentStep: number;
  status: SessionStatus;
  snapshot: string | null;
}

export interface TurnInput {
  order: number;
  role: 'user' | 'assistant';
  transcript: string;
  corrections?: unknown[];
}

export interface CompleteSessionInput {
  feedbackSummary: unknown;
}

export interface RecordProgressInput {
  lessonId: string;
  speakingSeconds: number;
  score: number;
}

export interface ProgressRepo {
  getOrCreateSession: (lessonId: string) => Promise<SessionRow>;
  saveStep: (sessionId: string, step: number, snapshot: string) => Promise<void>;
  recordTurn: (sessionId: string, turn: TurnInput) => Promise<void>;
  /** 세션의 누적 대화 턴을 order 오름차순으로 반환 (이어하기 시 히스토리 복원용) */
  getTurns: (sessionId: string) => Promise<TurnInput[]>;
  completeSession: (sessionId: string, input: CompleteSessionInput) => Promise<void>;
  recordProgress: (input: RecordProgressInput) => Promise<void>;
  getCompletedLessonIds: () => Promise<string[]>;
  isLessonCompletedToday: () => Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Repo — KeyValueStorage 직렬화 영속, now 주입으로 날짜 결정성 확보
// ─────────────────────────────────────────────────────────────────────────────

interface MockState {
  /** lessonId → 현재 활성(in_progress) 세션 */
  sessions: Record<string, SessionRow>;
  /** sessionId → 턴 누적 */
  turns: Record<string, TurnInput[]>;
  /** lessonId → 마지막 완료 날짜 (YYYY-MM-DD, 로컬) */
  progress: Record<string, string>;
}

const MOCK_KEY_BASE = 'talkted.progress.v1';

/**
 * 저장 키 — namespace(보통 user id) 지정 시 사용자별로 격리한다.
 * 공유 단말에서 다른 사용자의 진행/대화 데이터가 섞이지 않도록 한다(PII).
 * namespace 미지정 시 기존 키를 유지(하위 호환).
 */
function mockKey(namespace?: string): string {
  return namespace ? `${MOCK_KEY_BASE}.${namespace}` : MOCK_KEY_BASE;
}

function emptyState(): MockState {
  return { sessions: {}, turns: {}, progress: {} };
}

/** 로컬 날짜 문자열 (YYYY-MM-DD). KST 경계는 서버 트리거 소관 — 클라이언트는 로컬 비교면 충분 */
function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function createMockProgressRepo(
  storage: KeyValueStorage,
  opts: { now?: () => Date; namespace?: string } = {},
): ProgressRepo {
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
    async getOrCreateSession(lessonId) {
      const state = await load();
      const existing = state.sessions[lessonId];
      if (existing) return existing;
      const session: SessionRow = {
        id: localId(),
        lessonId,
        currentStep: 1,
        status: 'in_progress',
        snapshot: null,
      };
      state.sessions[lessonId] = session;
      await save(state);
      return session;
    },

    async saveStep(sessionId, step, snapshot) {
      const state = await load();
      for (const lessonId of Object.keys(state.sessions)) {
        if (state.sessions[lessonId].id === sessionId) {
          state.sessions[lessonId] = {
            ...state.sessions[lessonId],
            currentStep: step,
            snapshot,
          };
          break;
        }
      }
      await save(state);
    },

    async recordTurn(sessionId, turn) {
      const state = await load();
      (state.turns[sessionId] ??= []).push(turn);
      await save(state);
    },

    async getTurns(sessionId) {
      const state = await load();
      const turns = state.turns[sessionId] ?? [];
      return [...turns].sort((a, b) => a.order - b.order);
    },

    async completeSession(sessionId) {
      const state = await load();
      // 완료된 세션은 활성 목록에서 제거 — 다음 getOrCreateSession이 새 세션을 생성한다
      for (const lessonId of Object.keys(state.sessions)) {
        if (state.sessions[lessonId].id === sessionId) {
          delete state.sessions[lessonId];
          break;
        }
      }
      await save(state);
    },

    async recordProgress(input) {
      const state = await load();
      state.progress[input.lessonId] = localDateString(now());
      await save(state);
    },

    async getCompletedLessonIds() {
      const state = await load();
      return Object.keys(state.progress);
    },

    async isLessonCompletedToday() {
      const state = await load();
      const today = localDateString(now());
      return Object.values(state.progress).some((date) => date === today);
    },
  };
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
}

/** 데이터 계층 에러 — AiError와 분리 (도메인 경계). PII·서버 원문을 포함하지 않는다 */
function dataError(operation: string): Error {
  return new Error(`progress-repo: ${operation} 실패`);
}

function mapSessionRow(row: Record<string, unknown>): SessionRow {
  // DB는 snake_case(lesson_id/current_step)로 반환하지만, 일부 경로(이미 매핑된 행)는
  // camelCase일 수 있어 양쪽을 모두 수용한다.
  const lessonId = row.lesson_id ?? row.lessonId;
  const currentStep = row.current_step ?? row.currentStep;
  return {
    id: String(row.id),
    lessonId: String(lessonId),
    currentStep: Number(currentStep),
    status: row.status as SessionStatus,
    snapshot: (row.snapshot as string | null) ?? null,
  };
}

export function createSupabaseProgressRepo(
  client: SupabaseLike,
  userId: string,
): ProgressRepo {
  return {
    async getOrCreateSession(lessonId) {
      // in_progress 세션 조회 — 있으면 이어하기.
      // RLS가 행을 본인(user_id)으로 이미 한정하므로, 같은 lesson의 in_progress 세션만 추려낸다.
      const { data, error } = await client
        .from('lesson_sessions')
        .select('id, lesson_id, current_step, status, snapshot')
        .eq('lesson_id', lessonId)
        .eq('status', 'in_progress');
      if (error) throw dataError('세션 조회');

      const rows = (data as Record<string, unknown>[] | null) ?? [];
      const active = rows
        .map(mapSessionRow)
        .find((s) => s.lessonId === lessonId && s.status === 'in_progress');
      if (active) return active;

      // 없으면 생성 — payload는 화이트리스트 컬럼만 (user_id, lesson_id, status, current_step).
      // supabase-js v2는 .select() 체이닝 없이는 insert 행을 반환하지 않으므로 반드시 체이닝한다.
      const insertRes = await client
        .from('lesson_sessions')
        .insert({
          user_id: userId,
          lesson_id: lessonId,
          current_step: 1,
          status: 'in_progress',
        })
        .select('id, lesson_id, current_step, status, snapshot');
      if (insertRes.error) throw dataError('세션 생성');

      const inserted = (insertRes.data as Record<string, unknown>[] | null) ?? [];
      if (inserted.length === 0) throw dataError('세션 생성 행 반환');
      return mapSessionRow(inserted[0]);
    },

    async saveStep(sessionId, step, snapshot) {
      // update payload는 화이트리스트(current_step, snapshot)만
      const { error } = await client
        .from('lesson_sessions')
        .update({ current_step: step, snapshot })
        .eq('id', sessionId);
      if (error) throw dataError('진행 단계 저장');
    },

    async recordTurn(sessionId, turn) {
      // conversation_turns insert (불변 로그). transcript는 저장하되 절대 로깅하지 않는다
      const { error } = await client.from('conversation_turns').insert({
        session_id: sessionId,
        order: turn.order,
        role: turn.role,
        transcript: turn.transcript,
        corrections: turn.corrections ?? [],
      });
      if (error) throw dataError('대화 턴 저장');
    },

    async getTurns(sessionId) {
      // 세션 턴 조회 — RLS가 본인 세션 행만 반환하므로 session_id 필터만 둔다. order 오름차순.
      const { data, error } = await client
        .from('conversation_turns')
        .select('order, role, transcript, corrections')
        .eq('session_id', sessionId)
        .order('order', { ascending: true });
      if (error) throw dataError('대화 턴 조회');
      const rows = (data as Record<string, unknown>[] | null) ?? [];
      return rows.map((r) => ({
        order: Number(r.order),
        role: r.role as TurnInput['role'],
        transcript: String(r.transcript ?? ''),
        corrections: Array.isArray(r.corrections) ? (r.corrections as unknown[]) : [],
      }));
    },

    async completeSession(sessionId, input) {
      // update payload는 화이트리스트(status, completed_at, feedback_summary)만
      const { error } = await client
        .from('lesson_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          feedback_summary: input.feedbackSummary,
        })
        .eq('id', sessionId);
      if (error) throw dataError('세션 완료');
    },

    async recordProgress(input) {
      // insert payload는 grant 화이트리스트(user_id, lesson_id, speaking_seconds, score)만.
      // streak/total_speaking_seconds는 서버 트리거가 누적한다 (클라이언트 위조 차단)
      const { error } = await client.from('user_progress').insert({
        user_id: userId,
        lesson_id: input.lessonId,
        speaking_seconds: input.speakingSeconds,
        score: input.score,
      });
      // PK/유니크 충돌(23505)은 같은 레슨을 재완료한 경우 — 이미 기록이 존재하므로
      // 멱등하게 무시한다(완료 재진입 시 이중 기록 방지). 그 외 오류만 throw.
      if (error && (error as { code?: string }).code !== '23505') throw dataError('진행도 기록');
    },

    async getCompletedLessonIds() {
      // RLS가 본인 행만 반환하므로 별도 user_id 필터 없이 조회한다.
      const { data, error } = await client.from('user_progress').select('lesson_id');
      if (error) throw dataError('진행도 조회');
      const rows = (data as Record<string, unknown>[] | null) ?? [];
      return rows.map((r) => String(r.lesson_id));
    },

    async isLessonCompletedToday() {
      // 완료 여부는 서버 completed_at(KST) 기준이 권위 — 여기서는 당일 기록 존재만 근사 확인.
      // 정밀 날짜 경계는 서버 트리거 소관이므로 클라이언트는 오늘 UTC 범위로 보수적 조회한다.
      // RLS가 본인 행만 반환하므로 별도 user_id 필터 없이 조회한다.
      const { data, error } = await client.from('user_progress').select('completed_at');
      if (error) throw dataError('당일 완료 조회');
      const rows = (data as Record<string, unknown>[] | null) ?? [];
      const today = new Date().toISOString().slice(0, 10);
      return rows.some((r) => String(r.completed_at ?? '').slice(0, 10) === today);
    },
  };
}
