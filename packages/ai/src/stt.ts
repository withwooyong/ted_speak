import { type AiClientConfig, resolveConfig } from './config';
import { AiError, throwIfNotOk } from './error';

export { AiError };

export interface AudioInput {
  data: Uint8Array | ArrayBuffer | Blob;
  filename?: string;
  mimeType?: string;
}

/** 사용자 발화 오디오 → 영어 전사 (Whisper). 교정 없이 들리는 대로 전사한다. */
export async function transcribe(audio: AudioInput, cfg: AiClientConfig): Promise<string> {
  const { apiKey, baseUrl, fetchImpl } = resolveConfig(cfg);

  const blob =
    audio.data instanceof Blob
      ? audio.data
      : new Blob([audio.data instanceof ArrayBuffer ? new Uint8Array(audio.data) : audio.data], {
          type: audio.mimeType ?? 'audio/wav',
        });

  const form = new FormData();
  form.append('file', blob, audio.filename ?? 'utterance.wav');
  form.append('model', 'whisper-1');
  form.append('language', 'en');

  const res = await fetchImpl(`${baseUrl}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  await throwIfNotOk(res, 'STT');

  const json = (await res.json()) as { text?: unknown };
  if (typeof json.text !== 'string') {
    throw new AiError('STT 응답에 text 필드가 없음', undefined, JSON.stringify(json).slice(0, 200));
  }
  return json.text;
}
