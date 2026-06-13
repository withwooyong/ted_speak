/**
 * saved-repo.test.ts — TDD red 단계 (P2 W5)
 * 대상(미구현): apps/mobile/src/lib/saved-repo.ts
 *   createMockSavedRepo / createSupabaseSavedRepo — 저장된 표현(복습 노트) 데이터 계층.
 *
 * 보안: supabase 모드는 화이트리스트 컬럼만 insert, 본인 RLS로만 select/delete.
 *   created_at·id는 서버 default(클라가 보내지 않는다). 중복 저장은 무시(unique 제약).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockSavedRepo,
  createSupabaseSavedRepo,
  type KeyValueStorage,
} from '../src/lib/saved-repo';

// ── 인메모리 KeyValueStorage ──────────────────────────────────────────────────

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

const GRAMMAR = { original: 'I go yesterday', suggested: 'I went yesterday', type: 'grammar' as const };
const VOCAB = { original: 'kid', suggested: 'child', type: 'vocab' as const };

// ── Mock Repo ─────────────────────────────────────────────────────────────────

describe('createMockSavedRepo', () => {
  let storage: ReturnType<typeof memStorage>;
  beforeEach(() => {
    storage = memStorage();
  });

  it('저장한 표현을 목록으로 돌려준다', async () => {
    const repo = createMockSavedRepo(storage);
    await repo.save({ ...GRAMMAR, context: 'I go yesterday to the park' });
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ original: 'I go yesterday', suggested: 'I went yesterday', type: 'grammar' });
    expect(list[0].id).toBeTruthy();
    expect(list[0].createdAt).toBeTruthy();
    expect(list[0].context).toBe('I go yesterday to the park');
  });

  it('목록은 최신순(createdAt desc)이다', async () => {
    let clock = new Date('2026-06-13T10:00:00+09:00');
    const repo = createMockSavedRepo(storage, { now: () => clock });
    await repo.save(GRAMMAR);
    clock = new Date('2026-06-13T10:05:00+09:00');
    await repo.save(VOCAB);
    const list = await repo.list();
    expect(list.map((e) => e.original)).toEqual(['kid', 'I go yesterday']);
  });

  it('같은 (original, suggested)는 중복 저장하지 않는다', async () => {
    const repo = createMockSavedRepo(storage);
    await repo.save(GRAMMAR);
    await repo.save(GRAMMAR);
    await repo.save({ ...GRAMMAR, context: '다른 맥락' });
    expect(await repo.list()).toHaveLength(1);
  });

  it('id로 삭제한다', async () => {
    const repo = createMockSavedRepo(storage);
    await repo.save(GRAMMAR);
    await repo.save(VOCAB);
    const before = await repo.list();
    const target = before.find((e) => e.original === 'kid')!;
    await repo.remove(target.id);
    const after = await repo.list();
    expect(after.map((e) => e.original)).toEqual(['I go yesterday']);
  });

  it('존재하지 않는 id 삭제는 throw하지 않는다', async () => {
    const repo = createMockSavedRepo(storage);
    await expect(repo.remove('nope')).resolves.toBeUndefined();
  });

  it('namespace로 사용자별 저장소를 격리한다(PII 분리)', async () => {
    const repoA = createMockSavedRepo(storage, { namespace: 'userA' });
    const repoB = createMockSavedRepo(storage, { namespace: 'userB' });
    await repoA.save(GRAMMAR);
    expect(await repoA.list()).toHaveLength(1);
    expect(await repoB.list()).toHaveLength(0);
  });

  it('손상된 저장소는 빈 목록으로 복구한다(PII 노출 없이)', async () => {
    await storage.setItem('talkted.saved.v1', '{broken json');
    const repo = createMockSavedRepo(storage);
    expect(await repo.list()).toEqual([]);
  });
});

// ── Supabase Repo (fake 클라이언트) ───────────────────────────────────────────

interface FakeResponse {
  data: unknown;
  error: unknown;
}

/** insert/select/delete + eq/order 체이닝 fake (tutor-repo 테스트 패턴 + delete) */
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
  ['select', 'eq', 'order'].forEach((m) => {
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
        delete: (...a: unknown[]) => verb('delete', a),
      };
    },
    getCalls: () => calls,
    setPreset: (k: string, r: FakeResponse) => presets.set(k, r),
  };
}

type FakeClient = ReturnType<typeof makeFakeSupabase>;
const USER_ID = 'user-123';

describe('createSupabaseSavedRepo', () => {
  let fake: FakeClient;
  let repo: ReturnType<typeof createSupabaseSavedRepo>;

  beforeEach(() => {
    fake = makeFakeSupabase();
    repo = createSupabaseSavedRepo(
      fake as unknown as Parameters<typeof createSupabaseSavedRepo>[0],
      USER_ID,
    );
  });

  it('save는 화이트리스트 컬럼만 insert한다(created_at·id 미전송)', async () => {
    fake.setPreset('saved_expressions.insert', { data: null, error: null });
    await repo.save({ ...GRAMMAR, context: 'ctx' });
    const insert = fake.getCalls().find((c) => c.operation === 'insert');
    const payload = insert?.args[0] as Record<string, unknown>;
    expect(payload).toEqual({
      user_id: USER_ID,
      original: 'I go yesterday',
      suggested: 'I went yesterday',
      type: 'grammar',
      context: 'ctx',
    });
    // 서버 권위 컬럼은 보내지 않는다
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('created_at');
  });

  it('save는 unique 위반(23505)을 중복으로 보고 삼킨다', async () => {
    fake.setPreset('saved_expressions.insert', { data: null, error: { code: '23505', message: 'dup' } });
    await expect(repo.save(GRAMMAR)).resolves.toBeUndefined();
  });

  it('save는 그 외 에러는 PII 없는 도메인 에러로 throw한다', async () => {
    fake.setPreset('saved_expressions.insert', { data: null, error: { code: '500', message: 'boom' } });
    await expect(repo.save(GRAMMAR)).rejects.toThrow(/saved-repo/);
  });

  it('list는 created_at 내림차순으로 조회하고 행을 매핑한다', async () => {
    fake.setPreset('saved_expressions.select', {
      data: [
        { id: 'se-2', original: 'kid', suggested: 'child', type: 'vocab', context: null, created_at: '2026-06-13T02:00:00Z' },
        { id: 'se-1', original: 'a', suggested: 'b', type: 'grammar', context: 'x', created_at: '2026-06-13T01:00:00Z' },
      ],
      error: null,
    });
    const list = await repo.list();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'se-2', original: 'kid', type: 'vocab' });
    expect(list[0].context).toBeUndefined(); // null → undefined
    expect(list[1].context).toBe('x');
    const order = fake.getCalls().find((c) => c.operation === 'order');
    expect(order?.args[0]).toBe('created_at');
    expect(order?.args[1]).toMatchObject({ ascending: false });
  });

  it('remove는 id로 delete한다', async () => {
    fake.setPreset('saved_expressions.delete', { data: null, error: null });
    await repo.remove('se-1');
    const del = fake.getCalls().find((c) => c.operation === 'delete');
    expect(del?.table).toBe('saved_expressions');
    const eq = fake.getCalls().find((c) => c.operation === 'eq');
    expect(eq?.args).toEqual(['id', 'se-1']);
  });

  it('list는 에러 시 throw한다', async () => {
    fake.setPreset('saved_expressions.select', { data: null, error: { message: 'x' } });
    await expect(repo.list()).rejects.toThrow(/saved-repo/);
  });

  it('remove는 에러 시 throw한다', async () => {
    fake.setPreset('saved_expressions.delete', { data: null, error: { message: 'x' } });
    await expect(repo.remove('se-1')).rejects.toThrow(/saved-repo/);
  });
});
