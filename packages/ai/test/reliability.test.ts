/**
 * reliability.test.ts — TDD Red 단계
 *
 * 대상 모듈: packages/ai/src/reliability.ts (아직 미존재)
 * 동작 규칙 9가지 + STT/TTS/Tutor 함수 RequestOptions 확장 케이스 검증
 *
 * 실행: npx vitest run packages/ai/test/reliability.test.ts
 * 기대 결과: 전부 실패 (모듈 미존재 import 에러 포함)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiError } from '../src/error';
import { reliableFetch, type RequestOptions } from '../src/reliability';
import { transcribe } from '../src/stt';
import { synthesize, synthesizeStream } from '../src/tts';
import { getTurnFeedback } from '../src/tutor';

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF"

const FEEDBACK = {
  corrections: [{ original: 'like listen', suggested: 'like listening', type: 'grammar' }],
  reply: 'Good job!',
  encouragement: '잘 하고 있어요!',
};

const okResponse = (body: unknown = {}) =>
  new Response(JSON.stringify(body), { status: 200 });

const ok500 = () => new Response('Server Error', { status: 500 });
const ok429 = () => new Response('Rate Limited', { status: 429 });
const ok400 = () => new Response('Bad Request', { status: 400 });

/** fetch를 AbortSignal에 반응하는 fake로 만든다: signal abort 시 reject */
function makeAbortableFetch(
  resolveWith: Response | Error,
): ReturnType<typeof vi.fn> {
  return vi.fn(
    (_input: unknown, init?: RequestInit): Promise<Response> =>
      new Promise((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        const onAbort = () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        signal?.addEventListener('abort', onAbort);

        if (resolveWith instanceof Error) {
          // microtask에서 reject — fake timer로 진행 불필요
          Promise.resolve().then(() => {
            signal?.removeEventListener('abort', onAbort);
            reject(resolveWith);
          });
        } else {
          Promise.resolve().then(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve(resolveWith);
          });
        }
      }),
  );
}

// ---------------------------------------------------------------------------
// reliableFetch 단위 테스트
// ---------------------------------------------------------------------------

describe('reliableFetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // 규칙 1
  it('성공 시 1회 호출하고 Response를 그대로 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ ok: true }));
    const res = await reliableFetch(fetchMock as unknown as typeof fetch, 'https://api.example.com', {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  // 규칙 2
  it('네트워크 에러 1회 후 성공 시 재시도해 성공 Response를 반환한다', async () => {
    const networkErr = new TypeError('Network request failed');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValue(okResponse({ ok: true }));

    const opts: RequestOptions = { retries: 2, backoffMs: 500 };
    const promise = reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      opts,
    );

    // 1차 재시도 전 backoffMs 500ms 대기
    await vi.advanceTimersByTimeAsync(500);
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  // 규칙 2: 재시도 전엔 호출 안 됨
  it('backoffMs 경과 전에는 재호출하지 않는다', async () => {
    const networkErr = new TypeError('Network request failed');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValue(okResponse());

    const opts: RequestOptions = { retries: 2, backoffMs: 500 };
    const promise = reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      opts,
    );

    // 499ms만 진행 — 아직 재호출 없어야 함
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // 규칙 3: 5xx 재시도
  it('5xx 응답은 재시도한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok500())
      .mockResolvedValue(okResponse());

    const opts: RequestOptions = { retries: 2, backoffMs: 500 };
    const promise = reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      opts,
    );

    await vi.advanceTimersByTimeAsync(500);
    const res = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  // 규칙 3: 429도 재시도
  it('429 응답도 재시도한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok429())
      .mockResolvedValue(okResponse());

    const opts: RequestOptions = { retries: 2, backoffMs: 500 };
    const promise = reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      opts,
    );

    await vi.advanceTimersByTimeAsync(500);
    const res = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  // 규칙 4: 4xx(429 제외) → 즉시 반환, 재시도 없음
  it('4xx(429 제외)는 재시도 없이 Response를 즉시 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok400());

    const res = await reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      { retries: 2, backoffMs: 500 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(400);
  });

  // 규칙 5a: 네트워크 에러 소진 → AiError throw
  it('네트워크 에러로 재시도 소진 시 마지막 에러를 AiError로 래핑해 throw한다', async () => {
    const networkErr = new TypeError('Network request failed');
    const fetchMock = vi.fn().mockRejectedValue(networkErr);

    const opts: RequestOptions = { retries: 2, backoffMs: 100 };
    const promise = reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      opts,
    );

    // 1차 100ms, 2차 200ms
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).rejects.toBeInstanceOf(AiError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 총 시도 = 1 + 2
  });

  // 규칙 5b: 5xx 소진 → 마지막 Response 반환 (상위 throwIfNotOk 처리)
  it('5xx로 재시도 소진 시 마지막 Response를 반환한다 (throw 하지 않음)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok500());

    const opts: RequestOptions = { retries: 2, backoffMs: 100 };
    const promise = reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      opts,
    );

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    const res = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.status).toBe(500);
  });

  // 규칙 6: 시도당 timeoutMs 초과 → abort 후 재시도
  it('timeoutMs 초과 시 해당 시도를 abort하고 재시도한다', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(
      (_input: unknown, init?: RequestInit): Promise<Response> =>
        new Promise((resolve, reject) => {
          callCount++;
          const signal = init?.signal;
          const onAbort = () =>
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          signal?.addEventListener('abort', onAbort);
          // 첫 번째 시도는 타임아웃으로 abort됨; 두 번째는 바로 resolve
          if (callCount > 1) {
            Promise.resolve().then(() => resolve(okResponse()));
          }
        }),
    );

    const opts: RequestOptions = { retries: 2, timeoutMs: 1000, backoffMs: 100 };
    const promise = reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      opts,
    );

    // 타임아웃 발생 (1000ms)
    await vi.advanceTimersByTimeAsync(1000);
    // 백오프 대기 (100ms)
    await vi.advanceTimersByTimeAsync(100);

    const res = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  // 규칙 6: fetchImpl이 init.signal을 받음을 확인
  it('fetchImpl에 abort signal이 포함된 init을 전달한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());

    await reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      { timeoutMs: 5000 },
    );

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  // 규칙 7: 지수 백오프 검증
  it('지수 백오프: 1차 재시도 전 500ms, 2차 재시도 전 1000ms 대기한다', async () => {
    const networkErr = new TypeError('Network error');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkErr)
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValue(okResponse());

    const opts: RequestOptions = { retries: 2, backoffMs: 500 };
    const promise = reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      opts,
    );

    // 첫 번째 실패 직후, 500ms 대기 전 — 아직 2번째 호출 없어야 함
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 500ms 진행 — 2번째 호출 발생
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 2번째 실패 직후, 1000ms 대기 전 — 아직 3번째 호출 없어야 함
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 1000ms 진행 (누적 500+1000=1500ms) — 3번째 호출
    await vi.advanceTimersByTimeAsync(1);
    const res = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.status).toBe(200);
  });

  // 규칙 8: 호출자 signal abort → 즉시 중단, 재시도 없음
  it('호출자 signal abort 시 즉시 AbortError를 throw하고 재시도하지 않는다', async () => {
    const controller = new AbortController();
    const networkErr = new TypeError('Network request failed');
    const fetchMock = vi.fn().mockRejectedValue(networkErr);

    const opts: RequestOptions = { retries: 2, backoffMs: 500, signal: controller.signal };
    const promise = reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      opts,
    );

    // 첫 번째 실패 후 abort
    controller.abort();
    await vi.advanceTimersByTimeAsync(1000);

    const err = await promise.catch((e: unknown) => e);
    expect((err as Error).name).toBe('AbortError');
    // 재시도 없이 1번만 호출
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // 규칙 8: 백오프 대기 중 abort → 즉시 중단
  it('백오프 대기 중 abort 시 즉시 AbortError를 throw한다', async () => {
    const controller = new AbortController();
    const networkErr = new TypeError('Network error');
    const fetchMock = vi.fn().mockRejectedValue(networkErr);

    const opts: RequestOptions = {
      retries: 2,
      backoffMs: 1000,
      signal: controller.signal,
    };
    const promise = reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      opts,
    );

    // 첫 실패 후 백오프 대기 중 abort
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(500); // 아직 1000ms 미경과

    const err = await promise.catch((e: unknown) => e);
    expect((err as Error).name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // 규칙 9: retries: 0 → 재시도 없음
  it('retries: 0 이면 실패 시 재시도 없이 바로 throw한다', async () => {
    const networkErr = new TypeError('Network error');
    const fetchMock = vi.fn().mockRejectedValue(networkErr);

    await expect(
      reliableFetch(
        fetchMock as unknown as typeof fetch,
        'https://api.example.com',
        {},
        { retries: 0 },
      ),
    ).rejects.toBeInstanceOf(AiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // 호출자 signal이 처음부터 aborted 상태이면 즉시 AbortError
  it('이미 abort된 signal이면 fetch 호출 없이 즉시 AbortError를 throw한다', async () => {
    const controller = new AbortController();
    controller.abort();

    const fetchMock = vi.fn().mockResolvedValue(okResponse());

    const err = await reliableFetch(
      fetchMock as unknown as typeof fetch,
      'https://api.example.com',
      {},
      { signal: controller.signal },
    ).catch((e: unknown) => e);

    expect((err as Error).name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});

// ---------------------------------------------------------------------------
// STT — transcribe RequestOptions 확장 케이스
// ---------------------------------------------------------------------------

describe('transcribe — RequestOptions 확장', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('네트워크 에러 1회 후 성공 시 재시도 경유해 전사 텍스트를 반환한다', async () => {
    const networkErr = new TypeError('Network request failed');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValue(
        new Response(JSON.stringify({ text: 'I like music.' }), { status: 200 }),
      );

    const cfg = { apiKey: 'sk-test', fetchImpl: fetchMock as unknown as typeof fetch };
    const opts = { retries: 1, backoffMs: 200 };

    const promise = transcribe({ data: wavBytes }, cfg, opts);
    await vi.advanceTimersByTimeAsync(200);
    const text = await promise;

    expect(text).toBe('I like music.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('호출자 signal abort 시 AbortError로 즉시 reject한다', async () => {
    const controller = new AbortController();
    const fetchMock = makeAbortableFetch(new Response(JSON.stringify({ text: 'ok' }), { status: 200 }));
    const cfg = { apiKey: 'sk-test', fetchImpl: fetchMock as unknown as typeof fetch };

    controller.abort();
    await expect(
      transcribe({ data: wavBytes }, cfg, { signal: controller.signal, retries: 2 }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

// ---------------------------------------------------------------------------
// TTS — synthesize / synthesizeStream RequestOptions 확장 케이스
// ---------------------------------------------------------------------------

describe('synthesize — RequestOptions 확장', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('네트워크 에러 1회 후 성공 시 재시도 경유해 ArrayBuffer를 반환한다', async () => {
    const audio = new Uint8Array([1, 2, 3]);
    const networkErr = new TypeError('Network request failed');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValue(new Response(audio, { status: 200 }));

    const cfg = { apiKey: 'sk-test', fetchImpl: fetchMock as unknown as typeof fetch };
    const promise = synthesize('Hello!', cfg, { retries: 1, backoffMs: 300 });

    await vi.advanceTimersByTimeAsync(300);
    const buf = await promise;

    expect(new Uint8Array(buf)).toEqual(audio);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('호출자 signal abort 시 AbortError로 즉시 reject한다', async () => {
    const controller = new AbortController();
    const fetchMock = makeAbortableFetch(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const cfg = { apiKey: 'sk-test', fetchImpl: fetchMock as unknown as typeof fetch };

    controller.abort();
    await expect(
      synthesize('x', cfg, { signal: controller.signal, retries: 2 }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('synthesizeStream — RequestOptions 확장', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('첫 바이트 수신 전 네트워크 에러는 재시도한다', async () => {
    const audio = new Uint8Array([9, 8, 7]);
    const networkErr = new TypeError('Network request failed');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValue(new Response(audio, { status: 200 }));

    const cfg = { apiKey: 'sk-test', fetchImpl: fetchMock as unknown as typeof fetch };
    const onFirstByte = vi.fn();
    const promise = synthesizeStream('Hello!', cfg, { onFirstByte }, { retries: 1, backoffMs: 200 });

    await vi.advanceTimersByTimeAsync(200);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onFirstByte).toHaveBeenCalledTimes(1);
  });

  it('첫 바이트 수신 후 스트림 중단 에러는 재시도 없이 AiError를 throw한다', async () => {
    // 스트림 읽기 중간에 에러가 발생하는 시뮬레이션
    // synthesizeStream이 onFirstByte 호출 후 스트림 에러를 AiError로 감싸야 함
    const streamError = new TypeError('Stream interrupted');
    let firstChunk = true;

    const mockReader = {
      read: vi.fn().mockImplementation(async () => {
        if (firstChunk) {
          firstChunk = false;
          return { done: false, value: new Uint8Array([1]) };
        }
        throw streamError;
      }),
      releaseLock: vi.fn(),
    };

    const mockBody = {
      getReader: () => mockReader,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: mockBody,
      text: () => Promise.resolve(''),
    } as unknown as Response);

    const cfg = { apiKey: 'sk-test', fetchImpl: fetchMock as unknown as typeof fetch };
    const onFirstByte = vi.fn();

    await expect(
      synthesizeStream('Hello!', cfg, { onFirstByte }, { retries: 2, backoffMs: 100 }),
    ).rejects.toBeInstanceOf(AiError);

    // 재시도 없이 1번만 fetch 호출
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onFirstByte).toHaveBeenCalledTimes(1);
  });

  it('호출자 signal abort 시 AbortError로 즉시 reject한다', async () => {
    const controller = new AbortController();
    const fetchMock = makeAbortableFetch(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const cfg = { apiKey: 'sk-test', fetchImpl: fetchMock as unknown as typeof fetch };

    controller.abort();
    await expect(
      synthesizeStream('x', cfg, {}, { signal: controller.signal, retries: 2 }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

// ---------------------------------------------------------------------------
// Tutor — getTurnFeedback RequestOptions 확장 케이스
// ---------------------------------------------------------------------------

describe('getTurnFeedback — RequestOptions 확장', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const tutorOkResponse = () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(FEEDBACK) } }],
      }),
      { status: 200 },
    );

  it('네트워크 에러 1회 후 성공 시 재시도 경유해 TurnFeedback을 반환한다', async () => {
    const networkErr = new TypeError('Network request failed');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValue(tutorOkResponse());

    const cfg = { apiKey: 'sk-test', fetchImpl: fetchMock as unknown as typeof fetch };
    const promise = getTurnFeedback('I like listen to music', {}, cfg, { retries: 1, backoffMs: 400 });

    await vi.advanceTimersByTimeAsync(400);
    const fb = await promise;

    expect(fb.reply).toBe(FEEDBACK.reply);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('호출자 signal abort 시 AbortError로 즉시 reject한다', async () => {
    const controller = new AbortController();
    const fetchMock = makeAbortableFetch(tutorOkResponse());
    const cfg = { apiKey: 'sk-test', fetchImpl: fetchMock as unknown as typeof fetch };

    controller.abort();
    await expect(
      getTurnFeedback('hello', {}, cfg, { signal: controller.signal, retries: 2 }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
