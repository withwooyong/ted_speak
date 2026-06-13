import { type AiClientConfig, resolveConfig } from './config';
import { AiError, throwIfNotOk } from './error';
import { reliableFetch, type RequestOptions } from './reliability';

const TTS_MODEL = 'tts-1';
const TTS_VOICE = 'alloy';

function buildRequest(text: string, apiKey: string): RequestInit {
  return {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: text }),
  };
}

/** 텍스트 → 음성 (전체 버퍼). 레슨 고정 문장 사전 캐시 등 비스트리밍 용도 */
export async function synthesize(
  text: string,
  cfg: AiClientConfig,
  opts: RequestOptions = {},
): Promise<ArrayBuffer> {
  const { apiKey, baseUrl, fetchImpl } = resolveConfig(cfg);
  const res = await reliableFetch(
    fetchImpl,
    `${baseUrl}/v1/audio/speech`,
    buildRequest(text, apiKey),
    opts,
  );
  await throwIfNotOk(res, 'TTS');
  return res.arrayBuffer();
}

export interface StreamHandlers {
  /** 첫 오디오 청크 도달 시 1회 — 재생 시작 시점 (체감 지연의 끝) */
  onFirstByte?: () => void;
  onChunk?: (chunk: Uint8Array) => void;
}

/**
 * 텍스트 → 음성 스트리밍 (T2 지연 최적화).
 * 전체 합성을 기다리지 않고 첫 청크부터 소비자에게 전달한다.
 */
export async function synthesizeStream(
  text: string,
  cfg: AiClientConfig,
  handlers: StreamHandlers,
  opts: RequestOptions = {},
): Promise<void> {
  const { apiKey, baseUrl, fetchImpl } = resolveConfig(cfg);
  // reliableFetch는 헤더 응답까지만 재시도한다 — 첫 바이트(스트림 읽기) 이후 에러는
  // 재생 중 중단이라 재시도 대상이 아니다(아래 try에서 AiError로 래핑).
  const res = await reliableFetch(
    fetchImpl,
    `${baseUrl}/v1/audio/speech`,
    buildRequest(text, apiKey),
    opts,
  );
  await throwIfNotOk(res, 'TTS');
  if (!res.body) throw new AiError('TTS 응답에 body 스트림 없음');

  const reader = res.body.getReader();
  try {
    let first = true;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (first) {
        first = false;
        handlers.onFirstByte?.();
      }
      if (value) handlers.onChunk?.(value);
    }
  } catch (err) {
    // 첫 바이트 후 스트림 중단 — 재시도 없이 AiError로 래핑
    throw new AiError(`TTS 스트림 중단: ${(err as Error).message}`);
  } finally {
    reader.releaseLock();
  }
}
