import { describe, expect, it } from 'vitest';

import {
  createMockTutorTransport,
  createRealtimeTutorTransport,
  type TutorReply,
  type TutorTransportCallbacks,
} from '../src/lib/tutor-transport';

function collector(): TutorTransportCallbacks & { replies: TutorReply[]; connected: boolean; errors: Error[] } {
  const c = {
    replies: [] as TutorReply[],
    errors: [] as Error[],
    connected: false,
    onConnected() {
      c.connected = true;
    },
    onTedReply(r: TutorReply) {
      c.replies.push(r);
    },
    onError(e: Error) {
      c.errors.push(e);
    },
  };
  return c;
}

describe('createMockTutorTransport', () => {
  it('connect 시 onConnected를 호출한다', async () => {
    const cb = collector();
    const t = createMockTutorTransport('hobbies', cb);
    await t.connect();
    expect(cb.connected).toBe(true);
  });

  it('sendUserText마다 onTedReply가 호출된다(결정적)', async () => {
    const cb = collector();
    const t = createMockTutorTransport('hobbies', cb);
    await t.connect();
    await t.sendUserText('I like hiking');
    await t.sendUserText('on weekends');
    expect(cb.replies.length).toBe(2);
    for (const r of cb.replies) {
      expect(typeof r.reply).toBe('string');
      expect(r.reply.length).toBeGreaterThan(0);
      expect(Array.isArray(r.corrections)).toBe(true);
    }
  });

  it('opts.replies로 응답 스크립트를 오버라이드할 수 있다', async () => {
    const cb = collector();
    const scripted: TutorReply[] = [
      { reply: 'Nice!', corrections: [{ original: 'me', suggested: 'I', type: 'grammar' }] },
    ];
    const t = createMockTutorTransport('hobbies', cb, { replies: scripted });
    await t.connect();
    await t.sendUserText('me happy');
    expect(cb.replies[0].reply).toBe('Nice!');
    expect(cb.replies[0].corrections).toHaveLength(1);
  });

  it('close 후에는 onTedReply가 호출되지 않는다', async () => {
    const cb = collector();
    const t = createMockTutorTransport('hobbies', cb);
    await t.connect();
    t.close();
    await t.sendUserText('hello');
    expect(cb.replies.length).toBe(0);
  });

  it('close는 멱등하다(중복 호출 안전)', async () => {
    const cb = collector();
    const t = createMockTutorTransport('hobbies', cb);
    await t.connect();
    expect(() => {
      t.close();
      t.close();
    }).not.toThrow();
  });

  it('bargeIn은 throw하지 않는다', async () => {
    const cb = collector();
    const t = createMockTutorTransport('hobbies', cb);
    await t.connect();
    expect(() => t.bargeIn()).not.toThrow();
  });

  it('connect 전 sendUserText는 응답을 내지 않는다(가드)', async () => {
    const cb = collector();
    const t = createMockTutorTransport('hobbies', cb);
    await t.sendUserText('hello');
    expect(cb.replies.length).toBe(0);
  });

  it('빈 replies 오버라이드는 기본 스크립트로 폴백한다', async () => {
    const cb = collector();
    const t = createMockTutorTransport('hobbies', cb, { replies: [] });
    await t.connect();
    await t.sendUserText('hi');
    expect(cb.replies.length).toBe(1);
  });
});

describe('createRealtimeTutorTransport (이월 스텁)', () => {
  it('connect는 dev build 필요 에러로 거부한다', async () => {
    const cb = collector();
    const t = createRealtimeTutorTransport({ apiKey: 'x', topicId: 'hobbies' }, cb);
    await expect(t.connect()).rejects.toThrow(/dev build/i);
  });

  it('close/bargeIn은 연결 전에도 throw하지 않는다', () => {
    const cb = collector();
    const t = createRealtimeTutorTransport({ apiKey: 'x', topicId: 'hobbies' }, cb);
    expect(() => {
      t.bargeIn();
      t.close();
    }).not.toThrow();
  });

  it('sendUserText는 연결 전 호출돼도 throw하지 않는다(no-op 계약)', async () => {
    const cb = collector();
    const t = createRealtimeTutorTransport({ apiKey: 'x', topicId: 'hobbies' }, cb);
    await expect(t.sendUserText('hi')).resolves.toBeUndefined();
    expect(cb.replies.length).toBe(0);
  });
});
