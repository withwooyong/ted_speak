/**
 * use-recorder.ts (U2) — recorder-core(순수 상태 머신)를 expo-audio에 연결한다.
 *
 * 권한 요청·네이티브 녹음 start/stop·타이머를 deps로 주입해 recorder-core를 구동하고,
 * useSyncExternalStore로 상태를 구독한다. 30초 cap은 recorder-core가 관리한다.
 * recordedMs는 start~stop 실측(발화 시간 집계용)으로, RN 측에서 따로 잰다.
 */
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { createRecorderCore, type RecorderCore, type RecorderState } from '@/lib/recorder-core';

export interface UseRecorder {
  status: RecorderState['status'];
  uri: string | null;
  durationCapped: boolean;
  error: string | null;
  /** 직전 녹음의 start~stop 실측 시간(ms) */
  recordedMs: number;
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
  reset: () => void;
}

export function useRecorder(maxDurationMs = 30_000): UseRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // recorder 핸들은 ref로 최신값을 참조 — 콜백/이펙트 안에서만 접근한다.
  const recorderRef = useRef(recorder);
  // start 시각은 ref(렌더 무관), 실측 시간은 state로 노출한다.
  const startedAtRef = useRef<number | null>(null);
  const [recordedMs, setRecordedMs] = useState(0);

  const coreRef = useRef<RecorderCore | null>(null);

  // 마운트 시 recorder 핸들 동기화 (렌더 중 ref 쓰기 금지 — 이펙트로 격리)
  useEffect(() => {
    recorderRef.current = recorder;
  }, [recorder]);

  // core는 마운트당 1회 lazy 생성. deps 클로저는 콜백/이펙트 실행 시점에만 ref에 접근한다.
  const getCore = useCallback((): RecorderCore => {
    if (coreRef.current) return coreRef.current;
    const core = createRecorderCore(
      {
        requestPermission: async () => {
          const status = await AudioModule.requestRecordingPermissionsAsync();
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
          return status.granted;
        },
        startNative: async () => {
          await recorderRef.current.prepareToRecordAsync();
          recorderRef.current.record();
          startedAtRef.current = Date.now();
        },
        stopNative: async () => {
          await recorderRef.current.stop();
          setRecordedMs(startedAtRef.current !== null ? Date.now() - startedAtRef.current : 0);
          startedAtRef.current = null;
          return recorderRef.current.uri ?? null;
        },
        setTimer: (cb, ms) => setTimeout(cb, ms),
        clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
      { maxDurationMs },
    );
    coreRef.current = core;
    return core;
  }, [maxDurationMs]);

  const subscribe = useCallback((cb: () => void) => getCore().subscribe(cb), [getCore]);
  const getSnapshot = useCallback(() => getCore().getState(), [getCore]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const start = useCallback(() => getCore().start(), [getCore]);
  const stop = useCallback(() => getCore().stop(), [getCore]);
  const reset = useCallback(() => {
    startedAtRef.current = null;
    setRecordedMs(0);
    getCore().reset();
  }, [getCore]);

  return {
    status: state.status,
    uri: state.uri,
    durationCapped: state.durationCapped,
    error: state.error,
    recordedMs,
    start,
    stop,
    reset,
  };
}
