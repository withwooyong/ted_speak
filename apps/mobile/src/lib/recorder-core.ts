/**
 * 녹음 상태 컨트롤러 (U2) — 프레임워크 무관 순수 로직 (단위 테스트 대상).
 *
 * expo-audio 등 RN 모듈은 직접 import 하지 않는다. 권한 요청·네이티브 녹음
 * 시작/정지·타이머는 모두 deps로 주입받아, 노드 환경에서 테스트 가능하다.
 * 30초 cap, 이중 stop 방지(타이머 발화 vs 수동 stop 레이스), start 멱등성을
 * 상태 머신으로 다룬다.
 */

/** 녹음 상태 머신. */
export type RecorderStatus =
  | 'idle'
  | 'requesting' // 권한 요청 중
  | 'recording'
  | 'processing' // stop → 네이티브 정지 대기
  | 'done'
  | 'denied' // 마이크 권한 거부 → Fallback(텍스트 입력) 유도
  | 'error';

export interface RecorderState {
  status: RecorderStatus;
  /** 녹음 완료 시 파일 URI (실패·미완료 시 null) */
  uri: string | null;
  error: string | null;
  /** 30초 cap에 걸려 자동 종료됐는지 여부 */
  durationCapped: boolean;
}

/** 호출자가 주입하는 부수효과들 (RN·플랫폼 의존성 격리). */
export interface RecorderDeps {
  /** 마이크 권한 요청 → 허용 여부 */
  requestPermission: () => Promise<boolean>;
  /** 네이티브 녹음 시작 */
  startNative: () => Promise<void>;
  /** 네이티브 녹음 정지 → 파일 URI (실패 시 null) */
  stopNative: () => Promise<string | null>;
  /** 타이머 등록 → 핸들 반환 */
  setTimer: (cb: () => void, ms: number) => unknown;
  /** 타이머 해제 */
  clearTimer: (handle: unknown) => void;
}

export interface RecorderOptions {
  /** 녹음 최대 길이(ms). 기본 30초 (비용 관리 제약) */
  maxDurationMs?: number;
}

export interface RecorderCore {
  getState: () => RecorderState;
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
  reset: () => void;
  subscribe: (listener: (state: RecorderState) => void) => () => void;
}

const DEFAULT_MAX_DURATION_MS = 30_000;

function initialState(): RecorderState {
  return { status: 'idle', uri: null, error: null, durationCapped: false };
}

export function createRecorderCore(
  deps: RecorderDeps,
  options: RecorderOptions = {},
): RecorderCore {
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;

  let state: RecorderState = initialState();
  let timerHandle: unknown = null;
  const listeners = new Set<(state: RecorderState) => void>();

  function setState(partial: Partial<RecorderState>): void {
    state = { ...state, ...partial };
    for (const listener of listeners) listener(state);
  }

  /** 타이머 해제 + 핸들 초기화 (이중 stop 방지의 핵심) */
  function clearCapTimer(): void {
    if (timerHandle !== null) {
      deps.clearTimer(timerHandle);
      timerHandle = null;
    }
  }

  /** 네이티브 정지 공통 경로. capped=true면 durationCapped 표시. */
  async function finishRecording(capped: boolean): Promise<string | null> {
    setState({ status: 'processing' });
    const uri = await deps.stopNative();
    if (uri === null) {
      setState({ status: 'error', error: '녹음 파일을 가져오지 못했습니다.' });
      return null;
    }
    setState({ status: 'done', uri, durationCapped: capped });
    return uri;
  }

  async function start(): Promise<void> {
    // 멱등성: 이미 진행 중이면 무시
    if (
      state.status === 'requesting' ||
      state.status === 'recording' ||
      state.status === 'processing'
    ) {
      return;
    }

    setState({ status: 'requesting', uri: null, error: null, durationCapped: false });

    const granted = await deps.requestPermission();
    if (!granted) {
      setState({ status: 'denied' });
      return;
    }

    try {
      await deps.startNative();
    } catch (err) {
      setState({ status: 'error', error: errorMessage(err) });
      return;
    }

    setState({ status: 'recording' });

    // 30초 cap: 타이머 발화 시 자동 stop
    timerHandle = deps.setTimer(() => {
      void onCapReached();
    }, maxDurationMs);
  }

  /** 타이머 발화 경로 — recording 상태일 때만 자동 종료 */
  async function onCapReached(): Promise<void> {
    if (state.status !== 'recording') return;
    timerHandle = null; // 타이머는 이미 발화했으므로 clearTimer 불필요
    await finishRecording(true);
  }

  async function stop(): Promise<string | null> {
    // recording 상태가 아니면 무시 (이중 stop·레이스 방지)
    if (state.status !== 'recording') return state.uri;
    clearCapTimer();
    return finishRecording(false);
  }

  function reset(): void {
    clearCapTimer();
    setState(initialState());
  }

  function subscribe(listener: (state: RecorderState) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getState: () => state,
    start,
    stop,
    reset,
    subscribe,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
