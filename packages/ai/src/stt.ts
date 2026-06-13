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

function toBlob(audio: AudioInput): Blob {
  return audio.data instanceof Blob
    ? audio.data
    : new Blob([toArrayBufferView(audio.data)], { type: audio.mimeType ?? 'audio/wav' });
}

/**
 * 전사 요청 init 팩토리. FormData는 1회 소비되므로 재시도 시 시도마다 새로 만든다
 * (body 재사용 방지). extraFields로 verbose_json 등 추가 폼 필드를 주입한다.
 */
function makeTranscribeInit(
  audio: AudioInput,
  apiKey: string,
  model: string,
  extraFields: [string, string][] = [],
): () => RequestInit {
  const blob = toBlob(audio);
  return () => {
    const form = new FormData();
    form.append('file', blob, audio.filename ?? 'utterance.wav');
    form.append('model', model);
    form.append('language', 'en');
    for (const [k, v] of extraFields) form.append(k, v);
    return { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form };
  };
}

/** 사용자 발화 오디오 → 영어 전사. 교정 없이 들리는 대로 전사한다. */
export async function transcribe(
  audio: AudioInput,
  cfg: AiClientConfig,
  opts: TranscribeOptions & RequestOptions = {},
): Promise<string> {
  const { apiKey, baseUrl, fetchImpl } = resolveConfig(cfg);
  const makeInit = makeTranscribeInit(audio, apiKey, opts.model ?? 'whisper-1');

  const res = await reliableFetch(fetchImpl, `${baseUrl}/v1/audio/transcriptions`, makeInit, opts);
  await throwIfNotOk(res, 'STT');

  const json = (await res.json()) as { text?: unknown };
  if (typeof json.text !== 'string') {
    throw new AiError('STT 응답에 text 필드가 없음', undefined, JSON.stringify(json).slice(0, 200));
  }
  return json.text;
}

export interface DetailedTranscript {
  text: string;
  /** verbose_json segment avg_logprob 평균. segments가 없으면 null (W4 또렷함 신호). */
  avgLogprob: number | null;
}

/**
 * 전사 + segment 평균 logprob (verbose_json). W4 발음 또렷함(clarity) 신호용.
 * avg_logprob는 발음 정확도가 아니라 전사 신뢰도 proxy다(ADR-0010). text-only가 필요한
 * 경로는 기존 transcribe()를 그대로 쓴다(여기서 무변경).
 */
export async function transcribeDetailed(
  audio: AudioInput,
  cfg: AiClientConfig,
  opts: TranscribeOptions & RequestOptions = {},
): Promise<DetailedTranscript> {
  const { apiKey, baseUrl, fetchImpl } = resolveConfig(cfg);
  const makeInit = makeTranscribeInit(audio, apiKey, opts.model ?? 'whisper-1', [
    ['response_format', 'verbose_json'],
    ['timestamp_granularities[]', 'segment'],
  ]);

  const res = await reliableFetch(fetchImpl, `${baseUrl}/v1/audio/transcriptions`, makeInit, opts);
  await throwIfNotOk(res, 'STT');

  const json = (await res.json()) as { text?: unknown; segments?: { avg_logprob?: unknown }[] };
  if (typeof json.text !== 'string') {
    throw new AiError('STT 응답에 text 필드가 없음', undefined, JSON.stringify(json).slice(0, 200));
  }
  const logprobs = (json.segments ?? [])
    .map((s) => s.avg_logprob)
    .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  const avgLogprob =
    logprobs.length > 0 ? logprobs.reduce((a, b) => a + b, 0) / logprobs.length : null;
  return { text: json.text, avgLogprob };
}
