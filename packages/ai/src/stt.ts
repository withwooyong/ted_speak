import { type AiClientConfig, resolveConfig } from './config';
import { AiError, throwIfNotOk } from './error';
import { reliableFetch, type RequestOptions } from './reliability';

export { AiError };

export interface AudioInput {
  data: Uint8Array | ArrayBuffer | Blob;
  filename?: string;
  mimeType?: string;
}

export interface TranscribeOptions {
  /** 기본 whisper-1. 지연 민감 경로는 gpt-4o-mini-transcribe 검토 (ADR-0003) */
  model?: string;
}

/**
 * BlobPart는 ArrayBuffer 기반 뷰만 허용한다 — SharedArrayBuffer 기반일 수 있는
 * Uint8Array<ArrayBufferLike>를 ArrayBuffer 기반으로 정규화한다 (RN tsconfig에서 필수).
 */
function toArrayBufferView(data: Uint8Array | ArrayBuffer): Uint8Array<ArrayBuffer> {
  return data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
}

/** 사용자 발화 오디오 → 영어 전사. 교정 없이 들리는 대로 전사한다. */
export async function transcribe(
  audio: AudioInput,
  cfg: AiClientConfig,
  opts: TranscribeOptions & RequestOptions = {},
): Promise<string> {
  const { apiKey, baseUrl, fetchImpl } = resolveConfig(cfg);

  const blob =
    audio.data instanceof Blob
      ? audio.data
      : new Blob([toArrayBufferView(audio.data)], {
          type: audio.mimeType ?? 'audio/wav',
        });

  // FormData는 1회 소비되므로 재시도 시 시도마다 새로 만든다 (body 재사용 방지)
  const makeInit = (): RequestInit => {
    const form = new FormData();
    form.append('file', blob, audio.filename ?? 'utterance.wav');
    form.append('model', opts.model ?? 'whisper-1');
    form.append('language', 'en');
    return {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    };
  };

  const res = await reliableFetch(fetchImpl, `${baseUrl}/v1/audio/transcriptions`, makeInit, opts);
  await throwIfNotOk(res, 'STT');

  const json = (await res.json()) as { text?: unknown };
  if (typeof json.text !== 'string') {
    throw new AiError('STT 응답에 text 필드가 없음', undefined, JSON.stringify(json).slice(0, 200));
  }
  return json.text;
}
