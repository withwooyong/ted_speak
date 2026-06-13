import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRecorderCore,
  type RecorderDeps,
  type RecorderStatus,
} from '../src/lib/recorder-core';

// ── 헬퍼: 기본 deps 팩토리 ────────────────────────────────────────────────

function makeDeps(overrides: Partial<RecorderDeps> = {}): RecorderDeps {
  return {
    requestPermission: vi.fn().mockResolvedValue(true),
    startNative: vi.fn().mockResolvedValue(undefined),
    stopNative: vi.fn().mockResolvedValue('file:///tmp/rec.m4a'),
    setTimer: vi.fn().mockReturnValue(42),
    clearTimer: vi.fn(),
    ...overrides,
  };
}

// ── 테스트 ────────────────────────────────────────────────────────────────

describe('createRecorderCore', () => {
  let deps: RecorderDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  // 1. start: 권한 허용 → requesting→recording 전이, startNative 호출
  it('start: 권한 허용 시 status가 recording이 되고 startNative를 호출한다', async () => {
    const core = createRecorderCore(deps);

    await core.start();

    expect(deps.requestPermission).toHaveBeenCalledOnce();
    expect(deps.startNative).toHaveBeenCalledOnce();
    expect(core.getState().status).toBe('recording' satisfies RecorderStatus);
  });

  // 2. 권한 거부 → status 'denied', startNative 미호출
  it('start: 권한 거부 시 status가 denied이고 startNative를 호출하지 않는다', async () => {
    deps = makeDeps({ requestPermission: vi.fn().mockResolvedValue(false) });
    const core = createRecorderCore(deps);

    await core.start();

    expect(deps.startNative).not.toHaveBeenCalled();
    expect(core.getState().status).toBe('denied' satisfies RecorderStatus);
  });

  // 3. 권한 거부 후 reset → idle
  it('reset: denied 상태에서 reset 호출 시 idle로 복귀한다', async () => {
    deps = makeDeps({ requestPermission: vi.fn().mockResolvedValue(false) });
    const core = createRecorderCore(deps);

    await core.start();
    expect(core.getState().status).toBe('denied');

    core.reset();
    expect(core.getState().status).toBe('idle' satisfies RecorderStatus);
  });

  // 4. stop → uri 반환, status 'done', uri 상태 저장
  it('stop: stopNative의 uri를 반환하고 status가 done이 된다', async () => {
    const core = createRecorderCore(deps);
    await core.start();

    const uri = await core.stop();

    expect(uri).toBe('file:///tmp/rec.m4a');
    expect(core.getState().status).toBe('done' satisfies RecorderStatus);
    expect(core.getState().uri).toBe('file:///tmp/rec.m4a');
  });

  // 5. 30초 cap: setTimer가 maxDurationMs로 등록되고 타이머 발화 시 자동 stop + durationCapped=true
  it('start: setTimer를 maxDurationMs(30000)로 등록한다', async () => {
    const core = createRecorderCore(deps);
    await core.start();

    expect(deps.setTimer).toHaveBeenCalledOnce();
    const [, ms] = (deps.setTimer as ReturnType<typeof vi.fn>).mock.calls[0] as [() => void, number];
    expect(ms).toBe(30_000);
  });

  it('30초 cap: 타이머 콜백 발화 시 자동 stop되고 durationCapped가 true가 된다', async () => {
    const core = createRecorderCore(deps);
    await core.start();

    // setTimer 에 넘긴 콜백을 직접 발화
    const [timerCb] = (deps.setTimer as ReturnType<typeof vi.fn>).mock.calls[0] as [() => void, number];
    await timerCb();

    expect(core.getState().durationCapped).toBe(true);
    expect(core.getState().status).toBe('done' satisfies RecorderStatus);
    expect(deps.stopNative).toHaveBeenCalled();
  });

  it('30초 cap: maxDurationMs 옵션을 커스텀 값으로 전달할 수 있다', async () => {
    const core = createRecorderCore(deps, { maxDurationMs: 10_000 });
    await core.start();

    const [, ms] = (deps.setTimer as ReturnType<typeof vi.fn>).mock.calls[0] as [() => void, number];
    expect(ms).toBe(10_000);
  });

  // 6. 수동 stop 시 clearTimer 호출
  it('stop: 수동 stop 시 clearTimer를 호출해 이중 stop을 방지한다', async () => {
    const core = createRecorderCore(deps);
    await core.start();

    await core.stop();

    expect(deps.clearTimer).toHaveBeenCalledWith(42);
  });

  // 7. recording 중 start 재호출 → 무시 (상태 불변)
  it('start: recording 중 재호출 시 무시된다 (상태 불변)', async () => {
    const core = createRecorderCore(deps);
    await core.start();

    expect(core.getState().status).toBe('recording');

    await core.start(); // 재호출

    // startNative는 처음 한 번만 호출됨
    expect(deps.startNative).toHaveBeenCalledOnce();
    expect(core.getState().status).toBe('recording');
  });

  // 8. startNative throw → status 'error' + error 메시지, reset으로 복구
  it('start: startNative 예외 → status error + error 메시지 저장, reset으로 복구', async () => {
    deps = makeDeps({ startNative: vi.fn().mockRejectedValue(new Error('device busy')) });
    const core = createRecorderCore(deps);

    await core.start();

    expect(core.getState().status).toBe('error' satisfies RecorderStatus);
    expect(core.getState().error).toContain('device busy');

    core.reset();
    expect(core.getState().status).toBe('idle');
    expect(core.getState().error).toBeNull();
  });

  // 9. stopNative null 반환 → status 'error'
  it('stop: stopNative가 null 반환 시 status error가 된다', async () => {
    deps = makeDeps({ stopNative: vi.fn().mockResolvedValue(null) });
    const core = createRecorderCore(deps);
    await core.start();

    await core.stop();

    expect(core.getState().status).toBe('error' satisfies RecorderStatus);
  });

  // 10. subscribe 리스너가 상태 전이마다 호출
  it('subscribe: 상태 전이마다 리스너가 호출된다', async () => {
    const core = createRecorderCore(deps);
    const listener = vi.fn();
    const unsubscribe = core.subscribe(listener);

    await core.start();
    await core.stop();

    // requesting, recording, processing(or done 직행) 등 최소 2번 이상 호출
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);

    // unsubscribe 후에는 더 이상 호출되지 않음
    unsubscribe();
    const callCountBefore = listener.mock.calls.length;
    core.reset();
    expect(listener.mock.calls.length).toBe(callCountBefore);
  });

  // 초기 상태 검증
  it('초기 상태는 idle, uri/error null, durationCapped false', () => {
    const core = createRecorderCore(deps);
    const state = core.getState();

    expect(state.status).toBe('idle' satisfies RecorderStatus);
    expect(state.uri).toBeNull();
    expect(state.error).toBeNull();
    expect(state.durationCapped).toBe(false);
  });
});
