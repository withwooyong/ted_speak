/**
 * tts.ts (U4) — TTS 캐시 인프라: tts-cache(순수 로직)를 expo-file-system + packages/ai에 연결.
 *
 * 레슨 고정 문장 TTS는 사전 생성·캐시한다(비용 관리 제약). 캐시 파일은
 * FileSystem.cacheDirectory + 'tts/' 아래에 (text,voice) 결정적 해시로 저장된다.
 *
 * expo SDK 56 비고: 새 File/Paths API 대신 classic API(expo-file-system/legacy)를 쓴다.
 * tts-cache의 CacheFs 계약이 (경로 존재 확인 / ArrayBuffer 기록)이라 getInfoAsync·
 * writeAsStringAsync(Base64)에 그대로 대응하기 때문 — 마이그레이션 비용 없이 직결된다.
 */
import { synthesize, type AiClientConfig } from '@ted-speak/ai';
// classic(legacy) API — getInfoAsync/writeAsStringAsync/EncodingType/cacheDirectory 사용 (위 주석)
import {
  cacheDirectory,
  EncodingType,
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

import { createTtsCache, type CacheFs, type TtsCache } from '@/lib/tts-cache';

/** packages/ai의 TTS 보이스(tts.ts)와 일치시켜 캐시 키 일관성 유지 */
const TTS_VOICE = 'alloy';

const TTS_DIR = `${cacheDirectory ?? ''}tts/`;
let dirEnsured = false;

/** 캐시 디렉터리 1회 보장 (idempotent=true라 중복 호출 안전) */
async function ensureDir(): Promise<void> {
  if (dirEnsured) return;
  await makeDirectoryAsync(TTS_DIR, { intermediates: true });
  dirEnsured = true;
}

/** ArrayBuffer → base64 문자열 (RN/Hermes에 Buffer 없음 — 수동 인코딩) */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + chars[n & 63];
  }
  // 나머지 1~2바이트 패딩 처리
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + '=';
  }
  return out;
}

function makeFs(): CacheFs {
  return {
    exists: async (path) => {
      const info = await getInfoAsync(path);
      return info.exists;
    },
    write: async (path, data) => {
      await ensureDir();
      await writeAsStringAsync(path, arrayBufferToBase64(data), {
        encoding: EncodingType.Base64,
      });
    },
  };
}

/**
 * 주어진 AI 설정으로 TtsCache를 생성한다. 캐시는 디스크 영속이므로
 * 화면 단위로 만들어도 파일 히트가 공유된다(중복 합성 없음).
 */
export function createAppTtsCache(cfg: AiClientConfig): TtsCache {
  return createTtsCache({
    fs: makeFs(),
    synthesizeFn: (text) => synthesize(text, cfg),
    dir: TTS_DIR.replace(/\/$/, ''), // tts-cache가 `${dir}/${key}.mp3`로 결합 — 끝 슬래시 제거
    voice: TTS_VOICE,
  });
}
