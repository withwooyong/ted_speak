/**
 * ai.ts — 앱의 AI 설정 주입점 + RN 어댑터 (U2/U4/U5/U6/U7 연결용).
 *
 * 보안: API 키는 dev 환경변수(EXPO_PUBLIC_OPENAI_API_KEY)에서만 주입한다.
 * prod(!__DEV__)에서는 무조건 null을 반환해 음성 기능을 비활성화한다 —
 * 키를 prod 번들에 내장하지 않으며, 출시 전 Supabase Edge Function 프록시로
 * 전환할 때까지 prod 음성은 잠가 둔다 (CLAUDE.md / packages/ai/config.ts 주석).
 */
import {
  transcribe,
  type AiClientConfig,
  type AudioInput,
  type RequestOptions,
} from '@ted-speak/ai';

/**
 * 앱에서 사용할 AI 클라이언트 설정을 반환한다.
 * - dev: EXPO_PUBLIC_OPENAI_API_KEY가 있으면 설정 반환, 없으면 null.
 * - prod(!__DEV__): 프록시 전환 전까지 무조건 null (위 보안 주석 참조).
 * null이면 화면은 안내 UI("AI 기능을 사용하려면 개발 환경에서 키를 설정하세요")를 노출한다.
 */
export function getAiConfig(): AiClientConfig | null {
  // 프록시 전환 전까지 prod 음성 비활성 — 키가 번들에 들어가도 사용하지 않는다.
  if (!__DEV__) return null;

  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  return { apiKey };
}

/**
 * RN 녹음 파일(file:// uri) → AudioInput 으로 변환해 전사한다.
 *
 * 어댑터 방식 결정 (expo SDK 56 기준):
 *  fetch(uri).blob() 방식을 택했다. expo-audio HIGH_QUALITY 녹음은 file:// 로컬
 *  파일이고, RN의 fetch는 file:// 스킴 읽기를 지원한다(Hermes/RN 0.85). 이렇게 얻은
 *  Blob을 packages/ai의 transcribe(AudioInput.data: Blob)에 그대로 넘기면, 거기서
 *  FormData를 매 재시도마다 새로 만들어 multipart 업로드한다(stt.ts 주석 참조).
 *  대안인 FormData({uri,name,type}) 직접 구성은 RN 전용 비표준 확장이라
 *  packages/ai의 표준 FormData 경로와 충돌하고 노드 테스트와도 어긋나므로 피했다.
 *  파일명은 mime 타입을 Whisper가 인식하도록 확장자를 맞춘다(m4a 지원 확인됨 — audio-poc.tsx).
 */
export async function transcribeUri(
  uri: string,
  cfg: AiClientConfig,
  opts: RequestOptions = {},
): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  // HIGH_QUALITY 프리셋 산출물은 m4a(audio/mp4). blob.type이 비면 보수적으로 지정한다.
  const mimeType = blob.type || 'audio/m4a';
  const audio: AudioInput = { data: blob, filename: 'utterance.m4a', mimeType };
  return transcribe(audio, cfg, opts);
}

/**
 * Ted 발화(reply/openingLine)를 문장 단위로 분할한다 — 문장별 순차 합성·재생용.
 * 마침표·물음표·느낌표 뒤에서 끊되, 약어로 인한 과분할을 막기 위해 길이가 너무
 * 짧은 조각은 앞 문장에 흡수한다. 분할 실패 시 원문 전체를 단일 문장으로 반환.
 */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // 문장 종결부호 + 뒤따르는 공백을 기준으로 분할(종결부호는 유지)
  const parts = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!parts) return [trimmed];

  const out: string[] = [];
  for (const raw of parts) {
    const s = raw.trim();
    if (!s) continue;
    // 너무 짧은 조각(예: "Hi.")은 앞 문장에 붙여 과분할·짧은 합성 호출을 줄인다.
    if (out.length > 0 && s.length < 6) {
      out[out.length - 1] = `${out[out.length - 1]} ${s}`;
    } else {
      out.push(s);
    }
  }
  return out.length > 0 ? out : [trimmed];
}
