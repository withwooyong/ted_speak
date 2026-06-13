import { AiError } from './error';

/**
 * fetch 신뢰성 옵션 (U1).
 *
 * 모든 AI 호출(STT/TTS/Tutor)이 공유한다 — 네트워크 불안정·일시 장애에
 * 대비한 타임아웃·재시도·취소 정책. 전부 optional이라 기존 시그니처와 하위 호환.
 */
export interface RequestOptions {
  /** 호출자 취소 신호. abort 시 재시도·백오프 중에도 즉시 중단 */
  signal?: AbortSignal;
  /** 시도당 타임아웃 (ms). 초과 시 해당 시도만 abort 후 재시도 */
  timeoutMs?: number;
  /** 재시도 횟수 (최초 시도 제외). 0이면 재시도 없음 */
  retries?: number;
  /** 지수 백오프 기준 (ms). n번째 재시도 전 backoffMs * 2^n 대기 */
  backoffMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 500;

/** AbortError(DOMException) 생성 — 환경에 DOMException 없을 때 대비 */
function abortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

/** 5xx·429는 일시 장애로 보고 재시도 대상 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** 백오프 대기 — 호출자 abort 시 즉시 중단 (clearTimeout으로 타이머 누수 방지) */
function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(abortError());
    };
    function cleanup() {
      signal?.removeEventListener('abort', onAbort);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 한 번의 fetch 시도 — 타임아웃 abort와 호출자 signal을 결합한다.
 * 둘 중 하나라도 abort되면 해당 시도가 중단된다.
 */
async function attempt(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 호출자 signal이 abort되면 이 시도의 controller도 abort
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * 타임아웃·지수 백오프 재시도·취소를 갖춘 fetch 래퍼 (U1).
 *
 * - 시도당 timeoutMs로 abort, 4xx(429 제외)는 즉시 반환, 5xx·429·네트워크 에러는 재시도
 * - 호출자 signal abort 시 재시도·백오프 중에도 즉시 AbortError throw
 * - 5xx·429 소진 시 마지막 Response 반환(상위 throwIfNotOk가 stage 포함 처리),
 *   네트워크 에러 소진 시 AiError로 래핑 throw
 *
 * @param init RequestInit 또는 시도마다 새 init을 만드는 팩토리 (FormData 재사용 방지)
 */
export function reliableFetch(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit | (() => RequestInit),
  opts: RequestOptions = {},
): Promise<Response> {
  const promise = runReliableFetch(fetchImpl, input, init, opts);
  // 호출자가 await/catch를 붙이기 전에 reject가 먼저 일어나도(특히 fake timer 환경)
  // "unhandled rejection"으로 새지 않게 한다 — 원본 promise는 그대로 반환해
  // 호출자가 정상적으로 에러를 받는다.
  promise.catch(() => {});
  return promise;
}

async function runReliableFetch(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit | (() => RequestInit),
  opts: RequestOptions,
): Promise<Response> {
  const {
    signal: callerSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    backoffMs = DEFAULT_BACKOFF_MS,
  } = opts;

  // 이미 abort된 signal이면 fetch 없이 즉시 중단
  if (callerSignal?.aborted) throw abortError();

  let lastError: unknown;

  for (let i = 0; i <= retries; i++) {
    if (callerSignal?.aborted) throw abortError();

    const requestInit = typeof init === 'function' ? init() : init;

    // attempt()가 호출자 signal을 시도 AbortController에 연결하므로,
    // fetch 도중 호출자 abort 시 fetch가 AbortError로 reject된다.
    let res: Response;
    try {
      res = await attempt(fetchImpl, input, requestInit, timeoutMs, callerSignal);
    } catch (err) {
      // 호출자 abort는 재시도하지 않고 즉시 전파.
      // (타임아웃 abort도 AbortError지만 callerSignal은 미abort → 일시 장애로 재시도)
      if (callerSignal?.aborted) throw abortError();
      lastError = err;
      if (i === retries) {
        throw new AiError(`AI 요청 실패 (재시도 ${retries}회 소진): ${(err as Error).message}`);
      }
      await delay(backoffMs * 2 ** i, callerSignal);
      continue;
    }

    // 4xx(429 제외)는 재시도 의미 없음 — 즉시 반환 (상위 throwIfNotOk 처리)
    if (!isRetryableStatus(res.status)) return res;

    // 5xx·429: 재시도 소진 시 마지막 Response 반환
    if (i === retries) return res;
    await delay(backoffMs * 2 ** i, callerSignal);
  }

  // 도달 불가 — 루프가 반드시 return/throw 한다
  throw new AiError(`AI 요청 실패: ${(lastError as Error)?.message ?? 'unknown'}`);
}
