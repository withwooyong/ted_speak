import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockTutorRepo,
  createSupabaseTutorRepo,
  DAILY_CAP_SECONDS,
  remainingDailyCap,
  type KeyValueStorage,
} from '../src/lib/tutor-repo';

// ── 인메모리 KeyValueStorage (progress-repo 테스트 패턴) ──────────────────────

function memStorage(): KeyValueStorage & { dump: () => Record<string, string> } {
  const map: Record<string, string> = {};
  return {
    getItem: async (k) => map[k] ?? null,
    setItem: async (k, v) => {
      map[k] = v;
    },
    dump: () => ({ ...map }),
  };
}

// ── remainingDailyCap (순수 헬퍼) ─────────────────────────────────────────────

describe('remainingDailyCap', () => {
  it('사용량을 캡에서 뺀다', () => {
    expect(remainingDailyCap(60)).toBe(DAILY_CAP_SECONDS - 60);
  });
  it('캡을 넘으면 0으로 클램프한다(음수 없음)', () => {
    expect(remainingDailyCap(DAILY_CAP_SECONDS + 100)).toBe(0);
  });
  it('정확히 소진하면 0', () => {
    expect(remainingDailyCap(DAILY_CAP_SECONDS)).toBe(0);
  });
  it('캡을 인자로 오버라이드할 수 있다', () => {
    expect(remainingDailyCap(10, 100)).toBe(90);
  });
});

// ── Mock Repo ─────────────────────────────────────────────────────────────────

describe('createMockTutorRepo', () => {
  let storage: ReturnType<typeof memStorage>;
  beforeEach(() => {
    storage = memStorage();
  });

  it('세션을 생성하고 id를 발급한다', async () => {
    const repo = createMockTutorRepo(storage);
    const s = await repo.createSession('hobbies');
    expect(s.id).toBeTruthy();
    expect(s.topic).toBe('hobbies');
    expect(s.status).toBe('in_progress');
  });

  it('완료 시 오늘 발화 시간에 duration이 합산된다', async () => {
    const day = new Date('2026-06-13T10:00:00+09:00');
    const repo = createMockTutorRepo(storage, { now: () => day });
    const s = await repo.createSession('hobbies');
    await repo.completeSession(s.id, { summary: { ok: true }, durationSeconds: 120, turnCount: 4 });
    expect(await repo.getTodaySessionSeconds()).toBe(120);
  });

  it('여러 세션의 오늘 발화 시간을 누적한다', async () => {
    const day = new Date('2026-06-13T10:00:00+09:00');
    const repo = createMockTutorRepo(storage, { now: () => day });
    const a = await repo.createSession('hobbies');
    await repo.completeSession(a.id, { summary: {}, durationSeconds: 90, turnCount: 2 });
    const b = await repo.createSession('travel');
    await repo.completeSession(b.id, { summary: {}, durationSeconds: 60, turnCount: 1 });
    expect(await repo.getTodaySessionSeconds()).toBe(150);
  });

  it('어제 세션은 오늘 발화 시간에 포함되지 않는다(KST 경계)', async () => {
    let clock = new Date('2026-06-12T10:00:00+09:00');
    const repo = createMockTutorRepo(storage, { now: () => clock });
    const y = await repo.createSession('hobbies');
    await repo.completeSession(y.id, { summary: {}, durationSeconds: 200, turnCount: 5 });
    // 다음 날로 이동
    clock = new Date('2026-06-13T09:00:00+09:00');
    expect(await repo.getTodaySessionSeconds()).toBe(0);
  });

  it('진행 중 세션의 경과 시간도 캡에 반영된다(미완료 우회 차단)', async () => {
    let clock = new Date('2026-06-13T10:00:00+09:00');
    const repo = createMockTutorRepo(storage, { now: () => clock });
    await repo.createSession('hobbies');
    // 막 시작한 직후엔 0
    expect(await repo.getTodaySessionSeconds()).toBe(0);
    // 90초 경과 후엔 90초가 반영(완료하지 않아도)
    clock = new Date(clock.getTime() + 90_000);
    expect(await repo.getTodaySessionSeconds()).toBe(90);
  });

  it('턴 추가는 throw하지 않는다(불변 로그 append)', async () => {
    const repo = createMockTutorRepo(storage);
    const s = await repo.createSession('food');
    await expect(
      repo.appendTurn(s.id, { order: 1, role: 'user', transcript: 'hi', corrections: [] }),
    ).resolves.toBeUndefined();
  });

  it('namespace로 사용자별 저장소를 격리한다(PII 분리)', async () => {
    const day = new Date('2026-06-13T10:00:00+09:00');
    const repoA = createMockTutorRepo(storage, { now: () => day, namespace: 'userA' });
    const repoB = createMockTutorRepo(storage, { now: () => day, namespace: 'userB' });
    const a = await repoA.createSession('hobbies');
    await repoA.completeSession(a.id, { summary: {}, durationSeconds: 120, turnCount: 3 });
    expect(await repoA.getTodaySessionSeconds()).toBe(120);
    expect(await repoB.getTodaySessionSeconds()).toBe(0);
  });
});

// ── Supabase Repo (fake 클라이언트) ───────────────────────────────────────────

interface FakeResponse {
  data: unknown;
  error: unknown;
}

/** 최소 체이닝 fake — 호출을 기록하고 동사별 preset 응답을 반환한다 (progress-repo 테스트 패턴) */
function makeFakeSupabase() {
  const calls: Array<{ table: string; operation: string; args: unknown[] }> = [];
  let table = '';
  let preset: FakeResponse = { data: [], error: null };
  const presets = new Map<string, FakeResponse>();

  const thenable = {
    then(resolve: (v: FakeResponse) => unknown) {
      return Promise.resolve(preset).then(resolve);
    },
  };
  const chain: Record<string, (...a: unknown[]) => unknown> = {};
  ['select', 'eq', 'gte', 'order', 'single'].forEach((m) => {
    chain[m] = (...args: unknown[]) => {
      calls.push({ table, operation: m, args });
      return { ...chain, ...thenable };
    };
  });
  function verb(operation: string, args: unknown[]) {
    calls.push({ table, operation, args });
    preset = presets.get(`${table}.${operation}`) ?? { data: null, error: null };
    return { ...chain, ...thenable };
  }
  return {
    from: (t: string) => {
      table = t;
      return {
        select: (...a: unknown[]) => verb('select', a),
        insert: (...a: unknown[]) => verb('insert', a),
        update: (...a: unknown[]) => verb('update', a),
      };
    },
    rpc: (fn: string, params: Record<string, unknown>) => {
      calls.push({ table: `rpc:${fn}`, operation: 'rpc', args: [params] });
      preset = presets.get(`rpc.${fn}`) ?? { data: null, error: null };
      return { ...thenable };
    },
    getCalls: () => calls,
    setPreset: (k: string, r: FakeResponse) => presets.set(k, r),
  };
}

type FakeClient = ReturnType<typeof makeFakeSupabase>;
const USER_ID = 'user-123';

describe('createSupabaseTutorRepo', () => {
  let fake: FakeClient;
  let repo: ReturnType<typeof createSupabaseTutorRepo>;
  const at = () => new Date('2026-06-13T10:00:00+09:00');

  beforeEach(() => {
    fake = makeFakeSupabase();
    repo = createSupabaseTutorRepo(
      fake as unknown as Parameters<typeof createSupabaseTutorRepo>[0],
      USER_ID,
      { now: at },
    );
  });

  it('createSession은 화이트리스트 컬럼만 insert하고 행을 반환한다', async () => {
    fake.setPreset('tutor_sessions.insert', {
      data: [{ id: 'sess-1', topic: 'hobbies', status: 'in_progress' }],
      error: null,
    });
    const row = await repo.createSession('hobbies');
    expect(row.id).toBe('sess-1');
    const insert = fake.getCalls().find((c) => c.operation === 'insert');
    // grant 화이트리스트 — status/duration/started_at은 보내지 않는다(서버 default·RPC 권위)
    expect(insert?.args[0]).toEqual({ user_id: USER_ID, topic: 'hobbies' });
  });

  it('createSession은 행이 없으면 throw한다', async () => {
    fake.setPreset('tutor_sessions.insert', { data: [], error: null });
    await expect(repo.createSession('hobbies')).rejects.toThrow(/세션 생성/);
  });

  it('createSession은 에러 시 PII 없는 도메인 에러로 throw한다', async () => {
    fake.setPreset('tutor_sessions.insert', { data: null, error: { message: 'boom' } });
    await expect(repo.createSession('hobbies')).rejects.toThrow(/tutor-repo/);
  });

  it('appendTurn은 tutor_turns에 불변 로그를 insert한다', async () => {
    fake.setPreset('tutor_turns.insert', { data: null, error: null });
    await repo.appendTurn('sess-1', { order: 1, role: 'user', transcript: 'hi', corrections: [] });
    const insert = fake.getCalls().find((c) => c.table === 'tutor_turns' && c.operation === 'insert');
    expect((insert?.args[0] as Record<string, unknown>).session_id).toBe('sess-1');
  });

  it('appendTurn은 에러 시 throw한다', async () => {
    fake.setPreset('tutor_turns.insert', { data: null, error: { message: 'x' } });
    await expect(
      repo.appendTurn('sess-1', { order: 1, role: 'user', transcript: 'hi' }),
    ).rejects.toThrow(/대화 턴 저장/);
  });

  it('completeSession은 서버 RPC로만 완료하고 duration은 클라가 보내지 않는다', async () => {
    fake.setPreset('rpc.complete_tutor_session', { data: null, error: null });
    await repo.completeSession('sess-1', { summary: { ok: 1 }, durationSeconds: 120, turnCount: 4 });
    const rpc = fake.getCalls().find((c) => c.operation === 'rpc');
    expect(rpc?.table).toBe('rpc:complete_tutor_session');
    const params = rpc?.args[0] as Record<string, unknown>;
    expect(params.p_session_id).toBe('sess-1');
    expect(params.p_turn_count).toBe(4);
    // duration_seconds는 RPC에 전달하지 않는다 — 서버가 started_at 기준 산정(위조 차단)
    expect(params).not.toHaveProperty('p_duration_seconds');
    expect(params).not.toHaveProperty('duration_seconds');
  });

  it('completeSession은 RPC 에러 시 throw한다', async () => {
    fake.setPreset('rpc.complete_tutor_session', { data: null, error: { message: 'x' } });
    await expect(
      repo.completeSession('sess-1', { summary: {}, durationSeconds: 10, turnCount: 1 }),
    ).rejects.toThrow(/세션 완료/);
  });

  it('getTodaySessionSeconds는 완료 duration + 진행 중 경과시간을 합산한다', async () => {
    // now = 2026-06-13T10:00:00+09:00 = 2026-06-13T01:00:00Z
    fake.setPreset('tutor_sessions.select', {
      data: [
        { duration_seconds: 90, status: 'completed', started_at: '2026-06-13T00:30:00Z' },
        // 진행 중: now보다 60초 전 시작 → 경과 60초가 캡에 반영(미완료 우회 차단)
        { duration_seconds: 0, status: 'in_progress', started_at: '2026-06-13T00:59:00Z' },
        { duration_seconds: 30, status: 'completed', started_at: '2026-06-13T00:45:00Z' },
      ],
      error: null,
    });
    expect(await repo.getTodaySessionSeconds()).toBe(180);
  });

  it('getTodaySessionSeconds는 진행 중 경과시간을 SESSION_MAX로 클램프한다', async () => {
    fake.setPreset('tutor_sessions.select', {
      data: [{ duration_seconds: 0, status: 'in_progress', started_at: '2026-06-12T00:00:00Z' }],
      error: null,
    });
    // 하루 넘게 진행 중이어도 한 세션은 최대 SESSION_MAX_SECONDS(300)만 반영
    expect(await repo.getTodaySessionSeconds()).toBe(300);
  });

  it('getTodaySessionSeconds는 에러 시 throw한다', async () => {
    fake.setPreset('tutor_sessions.select', { data: null, error: { message: 'x' } });
    await expect(repo.getTodaySessionSeconds()).rejects.toThrow(/세션 시간 조회/);
  });
});
