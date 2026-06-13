import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cacheKey,
  createTtsCache,
  type CacheFs,
} from '../src/lib/tts-cache';

// ── 헬퍼: 기본 deps 팩토리 ────────────────────────────────────────────────

function makeFakeBuf(label = 'audio'): ArrayBuffer {
  const enc = new TextEncoder();
  return enc.encode(label).buffer as ArrayBuffer;
}

function makeDeps(overrides: {
  existsMap?: Map<string, boolean>;
  synthesizeFn?: (text: string) => Promise<ArrayBuffer>;
  dir?: string;
  voice?: string;
} = {}) {
  const existsMap = overrides.existsMap ?? new Map<string, boolean>();

  const fs: CacheFs = {
    exists: vi.fn((path: string) => Promise.resolve(existsMap.get(path) ?? false)),
    write: vi.fn(async (path: string, _data: ArrayBuffer) => {
      existsMap.set(path, true);
    }),
  };

  const synthesizeFn = overrides.synthesizeFn ?? vi.fn().mockResolvedValue(makeFakeBuf());

  return {
    fs,
    synthesizeFn,
    dir: overrides.dir ?? '/cache/tts',
    voice: overrides.voice ?? 'alloy',
  };
}

// ── 테스트 ────────────────────────────────────────────────────────────────

describe('cacheKey', () => {
  // 1. 결정성: 같은 (text, voice) → 같은 키, 다른 text → 다른 키, 다른 voice → 다른 키
  it('같은 text + voice 입력은 항상 같은 키를 반환한다', () => {
    const k1 = cacheKey('Hello world', 'alloy');
    const k2 = cacheKey('Hello world', 'alloy');
    expect(k1).toBe(k2);
  });

  it('다른 text는 다른 키를 반환한다', () => {
    const k1 = cacheKey('Hello world', 'alloy');
    const k2 = cacheKey('Goodbye world', 'alloy');
    expect(k1).not.toBe(k2);
  });

  it('다른 voice는 다른 키를 반환한다', () => {
    const k1 = cacheKey('Hello world', 'alloy');
    const k2 = cacheKey('Hello world', 'nova');
    expect(k1).not.toBe(k2);
  });

  it('키는 비어있지 않은 문자열이다', () => {
    const k = cacheKey('test', 'alloy');
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(0);
  });
});

describe('createTtsCache', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  // 2. 캐시 미스 → synthesizeFn 호출 + fs.write + 경로 반환 (.mp3 파일명)
  it('캐시 미스: synthesizeFn 호출 + fs.write + dir 기반 .mp3 경로 반환', async () => {
    const cache = createTtsCache(deps);

    const uri = await cache.getOrSynthesize('Hello');

    expect(deps.synthesizeFn).toHaveBeenCalledOnce();
    expect(deps.synthesizeFn).toHaveBeenCalledWith('Hello');
    expect(deps.fs.write).toHaveBeenCalledOnce();

    // 반환 경로는 dir로 시작하고 .mp3로 끝남
    expect(uri).toMatch(/^\/cache\/tts\//);
    expect(uri).toMatch(/\.mp3$/);
  });

  // 3. 캐시 히트 → synthesizeFn 미호출, 경로 즉시 반환
  it('캐시 히트: synthesizeFn을 호출하지 않고 경로를 즉시 반환한다', async () => {
    // 첫 호출로 캐시 생성
    const cache = createTtsCache(deps);
    const uri1 = await cache.getOrSynthesize('Hello');

    // synthesizeFn 호출 수 리셋
    (deps.synthesizeFn as ReturnType<typeof vi.fn>).mockClear();

    // 두 번째 호출 — 캐시 히트
    const uri2 = await cache.getOrSynthesize('Hello');

    expect(deps.synthesizeFn).not.toHaveBeenCalled();
    expect(uri2).toBe(uri1);
  });

  it('캐시 히트: fs.exists가 true이면 synthesizeFn을 호출하지 않는다', async () => {
    // 미리 존재하는 것처럼 existsMap 세팅
    const text = 'Pre-cached sentence';
    const voice = 'alloy';
    const key = cacheKey(text, voice);
    const path = `/cache/tts/${key}.mp3`;

    const existsMap = new Map([[path, true]]);
    deps = makeDeps({ existsMap });
    const cache = createTtsCache(deps);

    const uri = await cache.getOrSynthesize(text);

    expect(deps.synthesizeFn).not.toHaveBeenCalled();
    expect(uri).toBe(path);
  });

  // 4. 동시 중복 요청: synthesizeFn 1회만 (in-flight dedupe)
  it('동시 중복 요청: 같은 text로 2회 동시 호출해도 synthesizeFn은 1회만 호출된다', async () => {
    const cache = createTtsCache(deps);

    const [uri1, uri2] = await Promise.all([
      cache.getOrSynthesize('Duplicate text'),
      cache.getOrSynthesize('Duplicate text'),
    ]);

    expect(deps.synthesizeFn).toHaveBeenCalledOnce();
    expect(uri1).toBe(uri2);
  });

  // 5. synthesizeFn 실패 → 에러 전파 + in-flight 정리 → 다음 호출은 재시도
  it('synthesizeFn 실패: 에러를 전파하고 in-flight가 정리돼 다음 호출은 재시도한다', async () => {
    let callCount = 0;
    const synthesizeFn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('network error');
      return makeFakeBuf();
    });
    deps = makeDeps({ synthesizeFn });
    const cache = createTtsCache(deps);

    // 첫 번째 호출 — 실패
    await expect(cache.getOrSynthesize('Retry text')).rejects.toThrow('network error');

    // 두 번째 호출 — 재시도 성공
    const uri = await cache.getOrSynthesize('Retry text');
    expect(uri).toMatch(/\.mp3$/);
    expect(synthesizeFn).toHaveBeenCalledTimes(2);
  });

  // 6. prefetch: 3개 중 1개 실패 → { ok: 2, failed: 1 }, throw 안 함
  it('prefetch: 개별 실패를 삼키고 { ok, failed } 카운트를 반환한다', async () => {
    let callCount = 0;
    const synthesizeFn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error('tts error');
      return makeFakeBuf();
    });
    deps = makeDeps({ synthesizeFn });
    const cache = createTtsCache(deps);

    const result = await cache.prefetch(['text A', 'text B', 'text C']);

    expect(result.ok).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('prefetch: throw하지 않는다', async () => {
    const synthesizeFn = vi.fn().mockRejectedValue(new Error('all fail'));
    deps = makeDeps({ synthesizeFn });
    const cache = createTtsCache(deps);

    await expect(cache.prefetch(['a', 'b'])).resolves.toEqual({ ok: 0, failed: 2 });
  });

  // 7. prefetch는 이미 캐시된 항목 재합성 안 함
  it('prefetch: 이미 캐시된 항목은 synthesizeFn을 호출하지 않는다', async () => {
    const cache = createTtsCache(deps);

    // 먼저 'text A'를 캐시
    await cache.getOrSynthesize('text A');
    (deps.synthesizeFn as ReturnType<typeof vi.fn>).mockClear();

    // prefetch에 'text A' 포함
    const result = await cache.prefetch(['text A', 'text B']);

    // 'text A'는 이미 캐시되어 synthesizeFn 미호출 → ok 2 (캐시 히트도 ok), failed 0
    // 또는 ok 1(신규 B만), failed 0 — 구현에 따라 다를 수 있으나 'text A'는 재합성 안 함
    expect(deps.synthesizeFn).not.toHaveBeenCalledWith('text A');
    expect(result.failed).toBe(0);
  });
});
