/**
 * use-tts.ts (U4) — TTS 재생 훅.
 *
 * - playPhrase(text): 단일 고정 문장(레슨 표현·드릴 모범 발음) 캐시 경유 재생.
 * - playReply(text): Ted 발화를 문장 단위로 분할해 순차 재생. 첫 문장 재생을 최대한
 *   빨리 시작하고, 뒤 문장은 재생 중 백그라운드 합성해 체감 지연을 줄인다.
 *
 * synthesizeStream 직접 스트리밍 재생은 RN에 MediaSource가 없어 보류한다
 * (ADR-0003 폴백 경로 — 파일 캐시 후 재생). 합성 결과는 항상 디스크 캐시를 경유하므로
 * 오프라인 재진입 시에도 재생이 보장된다.
 */
import type { AiClientConfig } from '@ted-speak/ai';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { splitSentences } from '@/lib/ai';
import { createAppTtsCache } from '@/lib/tts';
import type { TtsCache } from '@/lib/tts-cache';

export interface UseTts {
  /** 현재 재생(또는 합성 대기) 중 여부 */
  speaking: boolean;
  /** 단일 고정 문장 재생 (캐시 경유). 진입 시 prefetch한 문장이면 즉시 재생 */
  playPhrase: (text: string) => Promise<void>;
  /** Ted 발화 — 문장 분할 순차 재생 */
  playReply: (text: string) => Promise<void>;
  /** 여러 문장 선합성 (실패 삼킴) */
  prefetch: (texts: string[]) => Promise<void>;
  /** 재생 중단 (단계 이탈 시) */
  stop: () => void;
}

/** 파일 uri를 재생하고 끝날 때까지 resolve (didJustFinish 감지) */
function playFile(uri: string, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const player: AudioPlayer = createAudioPlayer(uri);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sub.remove();
      player.remove();
      resolve();
    };
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finish();
    });
    const onAbort = () => finish();
    signal?.addEventListener('abort', onAbort, { once: true });
    player.play();
  });
}

export function useTts(cfg: AiClientConfig | null): UseTts {
  const [speaking, setSpeaking] = useState(false);
  const cacheRef = useRef<TtsCache | null>(null);
  // 진행 중 재생을 끊기 위한 컨트롤러 (단계 이탈·언마운트 시 abort)
  const playbackAbortRef = useRef<AbortController | null>(null);

  // 캐시는 cfg가 바뀔 때만 재생성하고 ref에 보관한다(렌더 중 ref 쓰기 금지 → 이펙트로 격리).
  useEffect(() => {
    cacheRef.current = cfg ? createAppTtsCache(cfg) : null;
  }, [cfg]);

  const stop = useCallback(() => {
    playbackAbortRef.current?.abort();
    playbackAbortRef.current = null;
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]);

  const playPhrase = useCallback(async (text: string) => {
    const c = cacheRef.current;
    if (!c) return;
    await setAudioModeAsync({ playsInSilentMode: true });
    stop();
    const ctrl = new AbortController();
    playbackAbortRef.current = ctrl;
    setSpeaking(true);
    try {
      const uri = await c.getOrSynthesize(text);
      if (ctrl.signal.aborted) return;
      await playFile(uri, ctrl.signal);
    } finally {
      if (playbackAbortRef.current === ctrl) {
        playbackAbortRef.current = null;
        setSpeaking(false);
      }
    }
  }, [stop]);

  const playReply = useCallback(async (text: string) => {
    const c = cacheRef.current;
    if (!c) return;
    await setAudioModeAsync({ playsInSilentMode: true });
    stop();
    const ctrl = new AbortController();
    playbackAbortRef.current = ctrl;
    setSpeaking(true);

    const sentences = splitSentences(text);
    try {
      // 첫 문장만 먼저 합성→재생, 나머지는 재생 중 백그라운드로 미리 합성한다.
      let nextUriPromise = c.getOrSynthesize(sentences[0]);
      for (let i = 0; i < sentences.length; i++) {
        const uri = await nextUriPromise;
        if (ctrl.signal.aborted) return;
        // 현재 문장 재생 시작 직전에 다음 문장 합성을 킥오프 (지연 최소화)
        if (i + 1 < sentences.length) {
          nextUriPromise = c.getOrSynthesize(sentences[i + 1]);
        }
        await playFile(uri, ctrl.signal);
        if (ctrl.signal.aborted) return;
      }
    } finally {
      if (playbackAbortRef.current === ctrl) {
        playbackAbortRef.current = null;
        setSpeaking(false);
      }
    }
  }, [stop]);

  const prefetch = useCallback(async (texts: string[]) => {
    const c = cacheRef.current;
    if (!c) return;
    await c.prefetch(texts);
  }, []);

  return { speaking, playPhrase, playReply, prefetch, stop };
}
