/**
 * progress-repo.test.ts — TDD red 단계
 * 대상(미존재): apps/mobile/src/lib/progress-repo.ts
 *
 * ProgressRepo 인터페이스: 진행 저장 데이터 계층 (U7)
 * - supabase / mock 두 모드
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockProgressRepo,
  createSupabaseProgressRepo,
  type KeyValueStorage,
  type LessonSessionSummary,
  type LessonTurnRow,
  type ProgressRepo,
  type SessionRow,
} from '../src/lib/progress-repo';

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼: 인메모리 KV 스토리지 팩토리
// ─────────────────────────────────────────────────────────────────────────────

function makeStorage(): KeyValueStorage {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼: Supabase fake client
// ─────────────────────────────────────────────────────────────────────────────

interface FakeResponse { data: unknown; error: unknown }

/**
 * 최소한의 체이닝 fake — 각 체인 메서드 호출을 기록하고
 * 마지막 awaitable에서 preset된 응답을 반환한다.
 */
function makeFakeSupabase() {
  const calls: Array<{ table: string; operation: string; args: unknown[] }> = [];
  let _table = '';
  let _preset: FakeResponse = { data: [], error: null };

  const presets = new Map<string, FakeResponse>();

  /**
   * tableName.operation 키로 응답을 preset한다.
   * e.g. setPreset('lesson_sessions.select', { data: [...], error: null })
   */
  function setPreset(key: string, res: FakeResponse) {
    presets.set(key, res);
  }

  // 응답 preset은 동사(select/insert/update...)가 결정한다 — 체인 메서드는 기록만.
  // (.insert(...).select(...) 체이닝 시 insert preset이 유지되어야 supabase-js v2 의미와 일치)
  function record(operation: string, args: unknown[], setsPreset = false) {
    calls.push({ table: _table, operation, args });
    if (setsPreset) {
      const key = `${_table}.${operation}`;
      _preset = presets.get(key) ?? { data: null, error: null };
    }
  }

  // thenable 종단 — 체인 끝에서 await 가능
  const thenable = {
    then(resolve: (v: FakeResponse) => unknown) {
      return Promise.resolve(_preset).then(resolve);
    },
  };

  // 필터/조건 체이닝 — 모두 자기 자신을 반환하며 호출만 기록
  const chain: Record<string, (...args: unknown[]) => unknown> = {};

  ['select', 'eq', 'is', 'in', 'order', 'limit', 'single', 'maybeSingle'].forEach((method) => {
    chain[method] = (...args: unknown[]) => {
      record(method, args);
      return { ...chain, ...thenable };
    };
  });

  const client = {
    from: (table: string) => {
      _table = table;
      return {
        select: (...args: unknown[]) => {
          record('select', args, true);
          return { ...chain, ...thenable };
        },
        insert: (...args: unknown[]) => {
          record('insert', args, true);
          return { ...chain, ...thenable };
        },
        update: (...args: unknown[]) => {
          record('update', args, true);
          return { ...chain, ...thenable };
        },
        delete: (...args: unknown[]) => {
          record('delete', args, true);
          return { ...chain, ...thenable };
        },
        upsert: (...args: unknown[]) => {
          record('upsert', args, true);
          return { ...chain, ...thenable };
        },
      };
    },
    getCalls: () => calls,
    setPreset,
    reset: () => { calls.length = 0; presets.clear(); },
  };

  return client;
}

type FakeClient = ReturnType<typeof makeFakeSupabase>;

// ─────────────────────────────────────────────────────────────────────────────
// Mock Repo 테스트
// ─────────────────────────────────────────────────────────────────────────────

describe('createMockProgressRepo', () => {
  let storage: KeyValueStorage;
  let repo: ProgressRepo;

  const LESSON_A = 'lesson-a';
  const LESSON_B = 'lesson-b';

  beforeEach(() => {
    storage = makeStorage();
    repo = createMockProgressRepo(storage);
  });

  // 1. getOrCreateSession 최초 → in_progress 세션 생성(step 1),
  //    같은 lessonId 재호출 → 같은 세션 반환 (이어하기)
  it('최초 getOrCreateSession은 in_progress 세션을 step 1로 생성한다', async () => {
    const session = await repo.getOrCreateSession(LESSON_A);

    expect(session.lessonId).toBe(LESSON_A);
    expect(session.status).toBe('in_progress');
    expect(session.currentStep).toBe(1);
    expect(typeof session.id).toBe('string');
    expect(session.id.length).toBeGreaterThan(0);
  });

  it('같은 lessonId로 재호출하면 같은 세션을 반환한다 (이어하기)', async () => {
    const first = await repo.getOrCreateSession(LESSON_A);
    const second = await repo.getOrCreateSession(LESSON_A);

    expect(second.id).toBe(first.id);
  });

  it('다른 lessonId는 각각 별도의 세션을 만든다', async () => {
    const a = await repo.getOrCreateSession(LESSON_A);
    const b = await repo.getOrCreateSession(LESSON_B);

    expect(a.id).not.toBe(b.id);
    expect(a.lessonId).toBe(LESSON_A);
    expect(b.lessonId).toBe(LESSON_B);
  });

  // 2. saveStep → 세션 currentStep·snapshot 갱신
  //    앱 재시작 시뮬레이션: 같은 storage로 repo 재생성해도 유지
  it('saveStep 후 getOrCreateSession이 갱신된 step과 snapshot을 반환한다', async () => {
    const s = await repo.getOrCreateSession(LESSON_A);
    await repo.saveStep(s.id, 2, 'snap-json');

    const updated = await repo.getOrCreateSession(LESSON_A);
    expect(updated.currentStep).toBe(2);
    expect(updated.snapshot).toBe('snap-json');
  });

  it('앱 재시작 시뮬레이션: 같은 storage로 repo 재생성해도 세션이 유지된다', async () => {
    const s = await repo.getOrCreateSession(LESSON_A);
    await repo.saveStep(s.id, 3, 'saved-snap');

    // repo 재생성 (앱 재시작)
    const repo2 = createMockProgressRepo(storage);
    const resumed = await repo2.getOrCreateSession(LESSON_A);

    expect(resumed.id).toBe(s.id);
    expect(resumed.currentStep).toBe(3);
    expect(resumed.snapshot).toBe('saved-snap');
  });

  // 3. completeSession → status completed, 이후 getOrCreateSession은 새 세션 생성
  it('completeSession 후 getOrCreateSession은 새 세션을 생성한다', async () => {
    const s = await repo.getOrCreateSession(LESSON_A);
    await repo.completeSession(s.id, { feedbackSummary: { strengths: [], improvements: [] } });

    const next = await repo.getOrCreateSession(LESSON_A);
    expect(next.id).not.toBe(s.id);
    expect(next.status).toBe('in_progress');
    expect(next.currentStep).toBe(1);
  });

  it('completeSession은 세션의 status를 completed로 변경한다', async () => {
    const s = await repo.getOrCreateSession(LESSON_A);
    await repo.completeSession(s.id, { feedbackSummary: null });

    // completed 세션은 새 세션을 만들어야 하므로 id가 다름으로 간접 검증
    const next = await repo.getOrCreateSession(LESSON_A);
    expect(next.id).not.toBe(s.id);
  });

  // 4. recordProgress → getCompletedLessonIds에 lessonId 포함
  it('recordProgress 후 getCompletedLessonIds에 lessonId가 포함된다', async () => {
    await repo.recordProgress({ lessonId: LESSON_A, speakingSeconds: 60, score: 80 });

    const ids = await repo.getCompletedLessonIds();
    expect(ids).toContain(LESSON_A);
  });

  it('getCompletedLessonIds는 기록 없으면 빈 배열이다', async () => {
    const ids = await repo.getCompletedLessonIds();
    expect(ids).toEqual([]);
  });

  it('recordProgress 중복 호출해도 lessonId는 1번만 포함된다', async () => {
    await repo.recordProgress({ lessonId: LESSON_A, speakingSeconds: 60, score: 80 });
    await repo.recordProgress({ lessonId: LESSON_A, speakingSeconds: 30, score: 90 });

    const ids = await repo.getCompletedLessonIds();
    expect(ids.filter((id) => id === LESSON_A).length).toBe(1);
  });

  // 5. isLessonCompletedToday: now 주입 — 오늘 recordProgress 후 true, 다음날(now 변경) false
  it('오늘 recordProgress 후 isLessonCompletedToday는 true이다', async () => {
    const today = '2026-06-12';
    const repoWithNow = createMockProgressRepo(storage, { now: () => new Date(today) });

    await repoWithNow.recordProgress({ lessonId: LESSON_A, speakingSeconds: 60, score: 80 });

    const result = await repoWithNow.isLessonCompletedToday();
    expect(result).toBe(true);
  });

  it('다음날(now 변경) isLessonCompletedToday는 false이다', async () => {
    const today = '2026-06-12';
    const tomorrow = '2026-06-13';

    // 오늘 기준 repo에서 recordProgress
    const storage2 = makeStorage();
    const repoToday = createMockProgressRepo(storage2, { now: () => new Date(today) });
    await repoToday.recordProgress({ lessonId: LESSON_A, speakingSeconds: 60, score: 80 });

    // 다음날 기준으로 새 repo 생성
    const repoTomorrow = createMockProgressRepo(storage2, { now: () => new Date(tomorrow) });
    const result = await repoTomorrow.isLessonCompletedToday();
    expect(result).toBe(false);
  });

  it('recordProgress 전에는 isLessonCompletedToday가 false이다', async () => {
    const result = await repo.isLessonCompletedToday();
    expect(result).toBe(false);
  });

  // 6. recordTurn 누적 저장 (storage에 영속)
  it('recordTurn은 turns를 누적해 storage에 저장한다', async () => {
    const s = await repo.getOrCreateSession(LESSON_A);
    await repo.recordTurn(s.id, { order: 1, role: 'user', transcript: 'hello' });
    await repo.recordTurn(s.id, { order: 2, role: 'assistant', transcript: 'hi there' });

    // 같은 storage로 repo 재생성 — 영속 확인
    const repo2 = createMockProgressRepo(storage);
    const s2 = await repo2.getOrCreateSession(LESSON_A);
    // 세션이 유지되므로 turn도 유지되어야 함 (구현에서 session key와 연결)
    expect(s2.id).toBe(s.id);
    // storage에 turn 데이터가 있는지 setItem 호출로 검증
    expect(storage.setItem).toHaveBeenCalled();
  });

  it('recordTurn은 corrections 없이도 저장된다', async () => {
    const s = await repo.getOrCreateSession(LESSON_A);
    await expect(
      repo.recordTurn(s.id, { order: 1, role: 'user', transcript: 'test utterance' }),
    ).resolves.not.toThrow();
  });

  it('recordTurn은 corrections와 함께 저장된다', async () => {
    const s = await repo.getOrCreateSession(LESSON_A);
    await expect(
      repo.recordTurn(s.id, {
        order: 1,
        role: 'user',
        transcript: 'test',
        corrections: [{ original: 'tset', corrected: 'test' }],
      }),
    ).resolves.not.toThrow();
  });

  // M2. getTurns — recordTurn 후 왕복, order 정렬 보장
  it('getTurns는 recordTurn으로 저장한 턴을 order 오름차순으로 반환한다', async () => {
    const s = await repo.getOrCreateSession(LESSON_A);
    // 일부러 역순으로 저장
    await repo.recordTurn(s.id, { order: 2, role: 'assistant', transcript: 'hi there' });
    await repo.recordTurn(s.id, { order: 0, role: 'assistant', transcript: 'opening' });
    await repo.recordTurn(s.id, { order: 1, role: 'user', transcript: 'hello' });

    const turns = await repo.getTurns(s.id);
    expect(turns.map((t) => t.order)).toEqual([0, 1, 2]);
    expect(turns.map((t) => t.transcript)).toEqual(['opening', 'hello', 'hi there']);
  });

  it('getTurns는 턴이 없으면 빈 배열을 반환한다', async () => {
    const s = await repo.getOrCreateSession(LESSON_A);
    const turns = await repo.getTurns(s.id);
    expect(turns).toEqual([]);
  });

  // M4. 네임스페이스 격리 — 같은 storage라도 namespace가 다르면 데이터가 섞이지 않는다
  it('namespace가 다르면 진행/세션 데이터가 격리된다 (공유 단말 PII)', async () => {
    const repoA = createMockProgressRepo(storage, { namespace: 'user-a' });
    const repoB = createMockProgressRepo(storage, { namespace: 'user-b' });

    await repoA.recordProgress({ lessonId: LESSON_A, speakingSeconds: 60, score: 80 });
    const sA = await repoA.getOrCreateSession(LESSON_B);
    await repoA.recordTurn(sA.id, { order: 0, role: 'user', transcript: 'a-secret' });

    // user-b는 user-a의 어떤 데이터도 보지 못한다
    expect(await repoB.getCompletedLessonIds()).toEqual([]);
    expect(await repoB.getTurns(sA.id)).toEqual([]);

    // user-a는 자신의 데이터를 그대로 본다
    expect(await repoA.getCompletedLessonIds()).toContain(LESSON_A);
    expect((await repoA.getTurns(sA.id)).map((t) => t.transcript)).toEqual(['a-secret']);
  });

  it('namespace 미지정 시 기존 키를 사용한다 (하위 호환)', async () => {
    const legacy = createMockProgressRepo(storage);
    await legacy.recordProgress({ lessonId: LESSON_A, speakingSeconds: 60, score: 80 });

    // 같은 storage·namespace 미지정으로 재생성 시 동일 데이터를 본다
    const legacy2 = createMockProgressRepo(storage);
    expect(await legacy2.getCompletedLessonIds()).toContain(LESSON_A);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Repo 테스트
// ─────────────────────────────────────────────────────────────────────────────

describe('createSupabaseProgressRepo', () => {
  const USER_ID = 'user-uuid-0001';
  const LESSON_ID = 'lesson-001';
  const SESSION_ID = 'session-uuid-0001';

  let fakeClient: FakeClient;
  let repo: ProgressRepo;

  beforeEach(() => {
    fakeClient = makeFakeSupabase();
    repo = createSupabaseProgressRepo(fakeClient as unknown as Parameters<typeof createSupabaseProgressRepo>[0], USER_ID);
  });

  afterEach(() => {
    fakeClient.reset();
  });

  // 7. getOrCreateSession: in_progress 조회 결과 있으면 insert 안 함 / 없으면 insert에 user_id 포함
  it('in_progress 세션이 존재하면 insert를 호출하지 않는다', async () => {
    const existingSession: SessionRow = {
      id: SESSION_ID,
      lessonId: LESSON_ID,
      currentStep: 2,
      status: 'in_progress',
      snapshot: null,
    };
    fakeClient.setPreset('lesson_sessions.select', { data: [existingSession], error: null });

    const session = await repo.getOrCreateSession(LESSON_ID);

    const calls = fakeClient.getCalls();
    const insertCalls = calls.filter((c) => c.table === 'lesson_sessions' && c.operation === 'insert');
    expect(insertCalls).toHaveLength(0);
    expect(session.id).toBe(SESSION_ID);
    expect(session.currentStep).toBe(2);
  });

  it('in_progress 세션이 없으면 insert에 user_id가 포함된다', async () => {
    fakeClient.setPreset('lesson_sessions.select', { data: [], error: null });
    fakeClient.setPreset('lesson_sessions.insert', {
      data: [{
        id: 'new-session-id',
        lesson_id: LESSON_ID,
        current_step: 1,
        status: 'in_progress',
        snapshot: null,
      }],
      error: null,
    });

    await repo.getOrCreateSession(LESSON_ID);

    const calls = fakeClient.getCalls();
    const insertCall = calls.find((c) => c.table === 'lesson_sessions' && c.operation === 'insert');
    expect(insertCall).toBeDefined();

    const insertData = insertCall!.args[0] as Record<string, unknown>;
    const rowData = Array.isArray(insertData) ? insertData[0] : insertData;
    expect(rowData).toMatchObject({ user_id: USER_ID });
  });

  it('insert payload에 lesson_id와 status in_progress가 포함된다', async () => {
    fakeClient.setPreset('lesson_sessions.select', { data: [], error: null });
    fakeClient.setPreset('lesson_sessions.insert', {
      data: [{ id: 'new-id', lesson_id: LESSON_ID, current_step: 1, status: 'in_progress', snapshot: null }],
      error: null,
    });

    await repo.getOrCreateSession(LESSON_ID);

    const calls = fakeClient.getCalls();
    const insertCall = calls.find((c) => c.table === 'lesson_sessions' && c.operation === 'insert');
    const insertData = insertCall!.args[0] as Record<string, unknown>;
    const rowData = Array.isArray(insertData) ? insertData[0] : insertData;
    expect(rowData).toMatchObject({ lesson_id: LESSON_ID, status: 'in_progress' });
  });

  // 8. saveStep → update({ current_step, snapshot... }) + eq('id', sessionId)
  it('saveStep은 current_step과 snapshot을 update하고 eq로 session_id를 지정한다', async () => {
    fakeClient.setPreset('lesson_sessions.update', { data: [], error: null });

    await repo.saveStep(SESSION_ID, 2, 'snap-data');

    const calls = fakeClient.getCalls();
    const updateCall = calls.find((c) => c.table === 'lesson_sessions' && c.operation === 'update');
    expect(updateCall).toBeDefined();

    const updateData = updateCall!.args[0] as Record<string, unknown>;
    expect(updateData).toMatchObject({ current_step: 2, snapshot: 'snap-data' });

    // eq('id', sessionId) 호출 확인
    const eqCall = calls.find((c) => c.operation === 'eq' && (c.args[0] === 'id' || c.args[1] === SESSION_ID));
    expect(eqCall).toBeDefined();
  });

  // 9. recordTurn → conversation_turns insert (session_id, order, role, transcript, corrections)
  it('recordTurn은 conversation_turns에 insert하고 필수 컬럼을 포함한다', async () => {
    fakeClient.setPreset('conversation_turns.insert', { data: [], error: null });

    await repo.recordTurn(SESSION_ID, {
      order: 1,
      role: 'user',
      transcript: 'I love English',
      corrections: [{ error: 'love', fix: 'enjoy' }],
    });

    const calls = fakeClient.getCalls();
    const insertCall = calls.find(
      (c) => c.table === 'conversation_turns' && c.operation === 'insert',
    );
    expect(insertCall).toBeDefined();

    const insertData = insertCall!.args[0] as Record<string, unknown>;
    const rowData = Array.isArray(insertData) ? insertData[0] : insertData;
    expect(rowData).toMatchObject({
      session_id: SESSION_ID,
      order: 1,
      role: 'user',
    });
    // transcript는 insert에 포함되어야 함
    expect(rowData).toHaveProperty('transcript');
  });

  // 10. completeSession → status 'completed' + completed_at 설정
  it('completeSession은 status completed와 completed_at을 update한다', async () => {
    fakeClient.setPreset('lesson_sessions.update', { data: [], error: null });

    await repo.completeSession(SESSION_ID, { feedbackSummary: { strengths: ['good'], improvements: [] } });

    const calls = fakeClient.getCalls();
    const updateCall = calls.find((c) => c.table === 'lesson_sessions' && c.operation === 'update');
    expect(updateCall).toBeDefined();

    const updateData = updateCall!.args[0] as Record<string, unknown>;
    expect(updateData).toMatchObject({ status: 'completed' });
    expect(updateData).toHaveProperty('completed_at');
    expect(updateData.completed_at).not.toBeNull();
  });

  it('completeSession은 feedback_summary를 update payload에 포함한다', async () => {
    fakeClient.setPreset('lesson_sessions.update', { data: [], error: null });

    const feedbackSummary = { strengths: ['pronunciation'], improvements: ['grammar'] };
    await repo.completeSession(SESSION_ID, { feedbackSummary });

    const calls = fakeClient.getCalls();
    const updateCall = calls.find((c) => c.table === 'lesson_sessions' && c.operation === 'update');
    const updateData = updateCall!.args[0] as Record<string, unknown>;
    expect(updateData).toHaveProperty('feedback_summary');
  });

  // 11. recordProgress → user_progress insert, error 응답({ error: {...} }) 시 throw
  it('recordProgress는 user_progress에 insert한다', async () => {
    fakeClient.setPreset('user_progress.insert', { data: [], error: null });

    await repo.recordProgress({ lessonId: LESSON_ID, speakingSeconds: 120, score: 90 });

    const calls = fakeClient.getCalls();
    const insertCall = calls.find(
      (c) => c.table === 'user_progress' && c.operation === 'insert',
    );
    expect(insertCall).toBeDefined();

    const insertData = insertCall!.args[0] as Record<string, unknown>;
    const rowData = Array.isArray(insertData) ? insertData[0] : insertData;
    expect(rowData).toMatchObject({
      user_id: USER_ID,
      lesson_id: LESSON_ID,
      speaking_seconds: 120,
      score: 90,
    });
  });

  it('recordProgress: error 응답 시 throw한다', async () => {
    // 23505(중복)는 멱등 무시 대상이므로, 일반 오류 코드로 throw 동작을 검증한다.
    fakeClient.setPreset('user_progress.insert', {
      data: null,
      error: { message: 'permission denied', code: '42501' },
    });

    await expect(
      repo.recordProgress({ lessonId: LESSON_ID, speakingSeconds: 60, score: 80 }),
    ).rejects.toThrow();
  });

  it('recordProgress: error null이면 throw하지 않는다', async () => {
    fakeClient.setPreset('user_progress.insert', { data: [], error: null });

    await expect(
      repo.recordProgress({ lessonId: LESSON_ID, speakingSeconds: 60, score: 80 }),
    ).resolves.not.toThrow();
  });

  // M3. PK/유니크 충돌(23505)은 멱등 무시 — 같은 레슨 재완료 시 이중 기록 방지
  it('recordProgress: 23505(중복) 충돌은 throw하지 않고 멱등 무시한다', async () => {
    fakeClient.setPreset('user_progress.insert', {
      data: null,
      error: { message: 'duplicate key value violates unique constraint', code: '23505' },
    });

    await expect(
      repo.recordProgress({ lessonId: LESSON_ID, speakingSeconds: 60, score: 80 }),
    ).resolves.not.toThrow();
  });

  // M2. getTurns — conversation_turns select + order 정렬, session_id 필터
  it('getTurns는 conversation_turns를 session_id로 select하고 order로 정렬한다', async () => {
    fakeClient.setPreset('conversation_turns.select', {
      data: [
        { order: 0, role: 'assistant', transcript: 'opening', corrections: [] },
        { order: 1, role: 'user', transcript: 'hello', corrections: [] },
      ],
      error: null,
    });

    const turns = await repo.getTurns(SESSION_ID);

    const calls = fakeClient.getCalls();
    const selectCall = calls.find(
      (c) => c.table === 'conversation_turns' && c.operation === 'select',
    );
    expect(selectCall).toBeDefined();

    // session_id eq 필터
    const eqCall = calls.find(
      (c) => c.operation === 'eq' && c.args[0] === 'session_id' && c.args[1] === SESSION_ID,
    );
    expect(eqCall).toBeDefined();

    // order 정렬 호출
    const orderCall = calls.find((c) => c.operation === 'order' && c.args[0] === 'order');
    expect(orderCall).toBeDefined();

    // 매핑 결과
    expect(turns.map((t) => t.order)).toEqual([0, 1]);
    expect(turns.map((t) => t.role)).toEqual(['assistant', 'user']);
  });

  it('getTurns: error 응답 시 throw한다', async () => {
    fakeClient.setPreset('conversation_turns.select', {
      data: null,
      error: { message: 'rls denied' },
    });

    await expect(repo.getTurns(SESSION_ID)).rejects.toThrow();
  });

  // 12. PII 가드: 어떤 메서드도 transcript를 console에 남기지 않음
  it('PII 가드: recordTurn이 transcript를 console.log에 출력하지 않는다', async () => {
    fakeClient.setPreset('conversation_turns.insert', { data: [], error: null });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const sensitiveTranscript = 'PII-SENSITIVE-VOICE-TRANSCRIPT-12345';

    await repo.recordTurn(SESSION_ID, {
      order: 1,
      role: 'user',
      transcript: sensitiveTranscript,
    });

    // console.log/info/debug에 transcript 원문이 포함되지 않아야 함
    const allArgs = [
      ...consoleSpy.mock.calls.flat(),
      ...consoleInfoSpy.mock.calls.flat(),
      ...consoleDebugSpy.mock.calls.flat(),
    ];
    const joined = allArgs.map(String).join(' ');
    expect(joined).not.toContain(sensitiveTranscript);

    consoleSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  it('PII 가드: 다른 메서드들도 transcript를 console.log에 출력하지 않는다', async () => {
    fakeClient.setPreset('lesson_sessions.select', { data: [], error: null });
    fakeClient.setPreset('lesson_sessions.insert', {
      data: [{ id: 'sid', lesson_id: LESSON_ID, current_step: 1, status: 'in_progress', snapshot: null }],
      error: null,
    });
    fakeClient.setPreset('lesson_sessions.update', { data: [], error: null });
    fakeClient.setPreset('user_progress.insert', { data: [], error: null });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const sensitiveTranscript = 'SECRET-TRANSCRIPT-DATA-ABCDE';

    await repo.getOrCreateSession(LESSON_ID);
    await repo.saveStep(SESSION_ID, 2, sensitiveTranscript); // snapshot이 transcript와 유사할 경우
    await repo.completeSession(SESSION_ID, { feedbackSummary: { transcript: sensitiveTranscript } });
    await repo.recordProgress({ lessonId: LESSON_ID, speakingSeconds: 60, score: 80 });

    const allArgs = [
      ...consoleSpy.mock.calls.flat(),
      ...consoleInfoSpy.mock.calls.flat(),
      ...consoleDebugSpy.mock.calls.flat(),
    ];
    const joined = allArgs.map(String).join(' ');
    expect(joined).not.toContain(sensitiveTranscript);

    consoleSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 히스토리 읽기 (W5b) — 레슨 세션을 대화 기록에 노출하기 위한 읽기 경로
// ─────────────────────────────────────────────────────────────────────────────

describe('createMockProgressRepo — 히스토리 읽기 (W5b)', () => {
  let storage: KeyValueStorage;
  const LESSON_A = 'lesson-a';
  const LESSON_B = 'lesson-b';

  beforeEach(() => {
    storage = makeStorage();
  });

  it('listSessions는 활성(in_progress) 세션을 startedAt과 함께 반환한다', async () => {
    const repo = createMockProgressRepo(storage, { now: () => new Date('2026-06-13T01:00:00Z') });
    const s = await repo.getOrCreateSession(LESSON_A);

    const list = await repo.listSessions();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(s.id);
    expect(list[0].lessonId).toBe(LESSON_A);
    expect(list[0].status).toBe('in_progress');
    expect(list[0].completedAt).toBeNull();
    // startedAt은 파싱 가능한 ISO 문자열이어야 한다
    expect(Number.isNaN(new Date(list[0].startedAt).getTime())).toBe(false);
  });

  it('completeSession 후에도 listSessions에 완료 세션이 남는다 (히스토리 보존)', async () => {
    const repo = createMockProgressRepo(storage, { now: () => new Date('2026-06-13T01:00:00Z') });
    const s = await repo.getOrCreateSession(LESSON_A);
    await repo.completeSession(s.id, { feedbackSummary: { strengths: ['good'] } });

    const list = await repo.listSessions();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(s.id);
    expect(list[0].status).toBe('completed');
    expect(list[0].completedAt).not.toBeNull();
    expect(list[0].summary).toMatchObject({ strengths: ['good'] });
  });

  it('listSessions는 startedAt 내림차순(최신 먼저)으로 정렬한다', async () => {
    // LESSON_A를 먼저(과거), LESSON_B를 나중(미래)에 시작·완료
    const repoEarly = createMockProgressRepo(storage, { now: () => new Date('2026-06-13T01:00:00Z') });
    const a = await repoEarly.getOrCreateSession(LESSON_A);
    await repoEarly.completeSession(a.id, { feedbackSummary: null });

    const repoLate = createMockProgressRepo(storage, { now: () => new Date('2026-06-13T05:00:00Z') });
    const b = await repoLate.getOrCreateSession(LESSON_B);

    const list = await repoLate.listSessions();
    expect(list.map((x) => x.id)).toEqual([b.id, a.id]); // 최신(b) 먼저
  });

  it('getSession은 완료 세션 메타를 반환하고, 없는 id는 null이다', async () => {
    const repo = createMockProgressRepo(storage, { now: () => new Date('2026-06-13T01:00:00Z') });
    const s = await repo.getOrCreateSession(LESSON_A);
    await repo.completeSession(s.id, { feedbackSummary: { strengths: [] } });

    const found = await repo.getSession(s.id);
    expect(found?.id).toBe(s.id);
    expect(found?.status).toBe('completed');

    expect(await repo.getSession('no-such-id')).toBeNull();
  });

  it('getSessionTurns는 완료 후에도 턴을 order 오름차순·Correction[] 형태로 반환한다', async () => {
    const repo = createMockProgressRepo(storage);
    const s = await repo.getOrCreateSession(LESSON_A);
    await repo.recordTurn(s.id, { order: 1, role: 'user', transcript: 'I goed' });
    await repo.recordTurn(s.id, {
      order: 2,
      role: 'assistant',
      transcript: 'I went',
      corrections: [
        { original: 'goed', suggested: 'went', type: 'grammar' },
        { bogus: true }, // 형태가 다른 항목은 버린다(신뢰 경계)
      ],
    });
    await repo.completeSession(s.id, { feedbackSummary: null });

    const turns: LessonTurnRow[] = await repo.getSessionTurns(s.id);
    expect(turns.map((t) => t.order)).toEqual([1, 2]);
    expect(turns[1].corrections).toEqual([
      { original: 'goed', suggested: 'went', type: 'grammar' },
    ]);
  });

  it('getSessionTurns는 없는 세션이면 빈 배열이다', async () => {
    const repo = createMockProgressRepo(storage);
    expect(await repo.getSessionTurns('no-such-id')).toEqual([]);
  });

  it('히스토리 읽기는 namespace로 격리된다 (공유 단말 PII)', async () => {
    const repoA = createMockProgressRepo(storage, { namespace: 'user-a' });
    const repoB = createMockProgressRepo(storage, { namespace: 'user-b' });
    const sA = await repoA.getOrCreateSession(LESSON_A);
    await repoA.recordTurn(sA.id, { order: 0, role: 'user', transcript: 'a-secret' });

    expect(await repoB.listSessions()).toEqual([]);
    expect(await repoB.getSession(sA.id)).toBeNull();
    expect(await repoB.getSessionTurns(sA.id)).toEqual([]);
    expect(await repoA.listSessions()).toHaveLength(1);
  });
});

describe('createSupabaseProgressRepo — 히스토리 읽기 (W5b)', () => {
  const USER_ID = 'user-uuid-0001';
  const SESSION_ID = 'session-uuid-0001';

  let fakeClient: FakeClient;
  let repo: ProgressRepo;

  beforeEach(() => {
    fakeClient = makeFakeSupabase();
    repo = createSupabaseProgressRepo(
      fakeClient as unknown as Parameters<typeof createSupabaseProgressRepo>[0],
      USER_ID,
    );
  });

  afterEach(() => {
    fakeClient.reset();
  });

  it('listSessions는 lesson_sessions를 started_at 내림차순으로 select하고 매핑한다', async () => {
    fakeClient.setPreset('lesson_sessions.select', {
      data: [
        {
          id: SESSION_ID,
          lesson_id: 'lesson-001',
          status: 'completed',
          started_at: '2026-06-13T01:00:00Z',
          completed_at: '2026-06-13T01:05:00Z',
          feedback_summary: { strengths: ['x'] },
        },
      ],
      error: null,
    });

    const list: LessonSessionSummary[] = await repo.listSessions();

    const calls = fakeClient.getCalls();
    const selectCall = calls.find((c) => c.table === 'lesson_sessions' && c.operation === 'select');
    expect(selectCall).toBeDefined();
    const orderCall = calls.find(
      (c) => c.operation === 'order' && c.args[0] === 'started_at' && (c.args[1] as { ascending?: boolean })?.ascending === false,
    );
    expect(orderCall).toBeDefined();

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: SESSION_ID,
      lessonId: 'lesson-001',
      status: 'completed',
      startedAt: '2026-06-13T01:00:00Z',
      completedAt: '2026-06-13T01:05:00Z',
    });
  });

  it('listSessions: error 응답 시 throw한다', async () => {
    fakeClient.setPreset('lesson_sessions.select', { data: null, error: { message: 'rls' } });
    await expect(repo.listSessions()).rejects.toThrow();
  });

  it('getSession은 id로 eq 조회하고, 0행이면 null이다', async () => {
    fakeClient.setPreset('lesson_sessions.select', { data: [], error: null });
    const found = await repo.getSession(SESSION_ID);
    expect(found).toBeNull();

    const calls = fakeClient.getCalls();
    const eqCall = calls.find((c) => c.operation === 'eq' && c.args[0] === 'id' && c.args[1] === SESSION_ID);
    expect(eqCall).toBeDefined();
  });

  it('getSession은 행이 있으면 요약으로 매핑한다', async () => {
    fakeClient.setPreset('lesson_sessions.select', {
      data: [
        {
          id: SESSION_ID,
          lesson_id: 'lesson-002',
          status: 'in_progress',
          started_at: '2026-06-13T02:00:00Z',
          completed_at: null,
          feedback_summary: null,
        },
      ],
      error: null,
    });
    const found = await repo.getSession(SESSION_ID);
    expect(found).toMatchObject({ id: SESSION_ID, lessonId: 'lesson-002', status: 'in_progress', completedAt: null });
  });

  it('getSessionTurns는 conversation_turns를 session_id로 select·order 정렬하고 corrections를 방어 변환한다', async () => {
    fakeClient.setPreset('conversation_turns.select', {
      data: [
        { order: 0, role: 'assistant', transcript: 'opening', corrections: [] },
        {
          order: 1,
          role: 'user',
          transcript: 'I goed',
          corrections: [
            { original: 'goed', suggested: 'went', type: 'grammar' },
            'not-an-object',
          ],
        },
      ],
      error: null,
    });

    const turns = await repo.getSessionTurns(SESSION_ID);

    const calls = fakeClient.getCalls();
    const eqCall = calls.find(
      (c) => c.operation === 'eq' && c.args[0] === 'session_id' && c.args[1] === SESSION_ID,
    );
    expect(eqCall).toBeDefined();
    const orderCall = calls.find((c) => c.operation === 'order' && c.args[0] === 'order');
    expect(orderCall).toBeDefined();

    expect(turns.map((t) => t.order)).toEqual([0, 1]);
    expect(turns[1].corrections).toEqual([
      { original: 'goed', suggested: 'went', type: 'grammar' },
    ]);
  });

  it('getSessionTurns: error 응답 시 throw한다', async () => {
    fakeClient.setPreset('conversation_turns.select', { data: null, error: { message: 'rls' } });
    await expect(repo.getSessionTurns(SESSION_ID)).rejects.toThrow();
  });
});
