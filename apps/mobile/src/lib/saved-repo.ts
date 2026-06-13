/**
 * saved-repo.ts — 저장된 표현(복습 노트) 데이터 계층 (P2 W5).
 * tutor-repo.ts 패턴: mock / supabase 두 모드를 동일 인터페이스(SavedRepo)로 제공한다.
 *
 * 보안:
 *  - supabase 모드는 화이트리스트 컬럼만 insert한다(user_id, original, suggested, type, context).
 *    id·created_at은 서버 default — 클라이언트가 보내지 않는다.
 *  - 저장 표현은 사용자 소유 노트 — 통계·캡·보상에 연결하지 않는다(파밍 표면 0). delete 허용.
 *  - 같은 (user_id, original, suggested)는 unique 제약 — 중복 저장(23505)은 무시(idempotent).
 *  - original/suggested/context 등 PII를 console에 출력하지 않는다(에러 로그 포함).
 */
import type { SavedExpression, SavedExpressionInput } from '@ted-speak/shared';

/** AsyncStorage 호환 시그니처 (mock 모드 영속 저장소) */
export interface KeyValueStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export interface SavedRepo {
  /** 표현 저장 — 같은 (original, suggested)는 중복 무시(idempotent) */
  save: (input: SavedExpressionInput) => Promise<void>;
  /** 저장된 표현 목록 — 최신순(createdAt desc) */
  list: () => Promise<SavedExpression[]>;
  /** id로 삭제 — 없는 id는 무시 */
  remove: (id: string) => Promise<void>;
}

/** Postgres unique_violation — 중복 저장을 idempotent하게 처리하기 위한 코드 */
const UNIQUE_VIOLATION = '23505';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Repo — KeyValueStorage 직렬화 영속, now 주입으로 시각 결정성 확보
// ─────────────────────────────────────────────────────────────────────────────

interface MockState {
  expressions: SavedExpression[];
}

const MOCK_KEY_BASE = 'talkted.saved.v1';

function mockKey(namespace?: string): string {
  return namespace ? `${MOCK_KEY_BASE}.${namespace}` : MOCK_KEY_BASE;
}

function emptyState(): MockState {
  return { expressions: [] };
}

/** mock 표현용 로컬 고유 id — 단말 내 충돌만 피하면 충분(uuid 의존 회피) */
function localId(): string {
  return `saved-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createMockSavedRepo(
  storage: KeyValueStorage,
  opts: { now?: () => Date; namespace?: string } = {},
): SavedRepo {
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
    async save(input) {
      const state = await load();
      // 중복(original+suggested) 무시 — idempotent
      const dup = state.expressions.some(
        (e) => e.original === input.original && e.suggested === input.suggested,
      );
      if (dup) return;
      state.expressions.push({
        id: localId(),
        original: input.original,
        suggested: input.suggested,
        type: input.type,
        context: input.context,
        createdAt: now().toISOString(),
      });
      await save(state);
    },

    async list() {
      const state = await load();
      // 최신순 — createdAt desc (동률이면 안정 정렬 유지)
      return [...state.expressions].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    },

    async remove(id) {
      const state = await load();
      const next = state.expressions.filter((e) => e.id !== id);
      if (next.length === state.expressions.length) return; // 변화 없으면 쓰기 생략
      state.expressions = next;
      await save(state);
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
    delete: (...args: unknown[]) => any;
  };
}

/** 데이터 계층 에러 — PII·서버 원문을 포함하지 않는다 */
function dataError(operation: string): Error {
  return new Error(`saved-repo: ${operation} 실패`);
}

export function createSupabaseSavedRepo(client: SupabaseLike, userId: string): SavedRepo {
  return {
    async save(input) {
      // insert payload는 grant 화이트리스트만 — id/created_at은 서버 default.
      const { error } = await client.from('saved_expressions').insert({
        user_id: userId,
        original: input.original,
        suggested: input.suggested,
        type: input.type,
        context: input.context ?? null,
      });
      // unique 위반은 "이미 저장됨"으로 보고 삼킨다(idempotent). 그 외만 에러.
      if (error && (error as { code?: string }).code !== UNIQUE_VIOLATION) {
        throw dataError('표현 저장');
      }
    },

    async list() {
      // RLS가 본인 행만 반환하므로 user_id 필터 없이 최신순 조회.
      const { data, error } = await client
        .from('saved_expressions')
        .select('id, original, suggested, type, context, created_at')
        .order('created_at', { ascending: false });
      if (error) throw dataError('표현 목록 조회');
      const rows = (data as Record<string, unknown>[] | null) ?? [];
      return rows.map((r) => ({
        id: String(r.id),
        original: String(r.original),
        suggested: String(r.suggested),
        type: r.type as SavedExpression['type'],
        context: r.context == null ? undefined : String(r.context),
        createdAt: String(r.created_at),
      }));
    },

    async remove(id) {
      // RLS가 본인 행만 삭제 가능하도록 강제한다(id만으로 충분).
      const { error } = await client.from('saved_expressions').delete().eq('id', id);
      if (error) throw dataError('표현 삭제');
    },
  };
}
