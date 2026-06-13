import { describe, expect, it } from 'vitest';

import type { RoleplayScenario } from '@ted-speak/shared';

import {
  createMockTutorTransport,
  createRealtimeTutorTransport,
  createRoleplayMockTransport,
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

// ── 롤플레이 목 전송 (P2 W3) ──────────────────────────────────────────────────

const SCENARIO: RoleplayScenario = {
  id: 'restaurant',
  title: '레스토랑 주문',
  titleEn: 'At the Restaurant',
  level: 'A2',
  order: 1,
  setting: '식당에서 음식을 주문해요.',
  learnerRole: '손님',
  tedRole: '웨이터',
  tedPersona: 'You are a friendly waiter. Keep replies short.',
  openingLine: 'Hi, welcome! Are you ready to order?',
  objectives: [
    { id: 'greet', label: '인사하기', labelEn: 'Greet' },
    { id: 'order', label: '주문하기', labelEn: 'Order' },
  ],
};

describe('createRoleplayMockTransport', () => {
  it('connect 시 onConnected를 호출한다', async () => {
    const cb = collector();
    const t = createRoleplayMockTransport(SCENARIO, cb);
    await t.connect();
    expect(cb.connected).toBe(true);
  });

  it('턴마다 objective를 순서대로 1개씩 달성 신호한다', async () => {
    const cb = collector();
    const t = createRoleplayMockTransport(SCENARIO, cb);
    await t.connect();
    await t.sendUserText('Hello there');
    await t.sendUserText('A burger please');
    expect(cb.replies[0].metObjectiveIds).toEqual(['greet']);
    expect(cb.replies[1].metObjectiveIds).toEqual(['order']);
  });

  it('모든 목표 달성 후에는 추가 목표를 신호하지 않는다', async () => {
    const cb = collector();
    const t = createRoleplayMockTransport(SCENARIO, cb);
    await t.connect();
    await t.sendUserText('one');
    await t.sendUserText('two');
    await t.sendUserText('three'); // 목표보다 많은 턴
    expect(cb.replies[2].metObjectiveIds ?? []).toEqual([]);
    // 누적 신호는 시나리오 objective 집합을 벗어나지 않는다
    const signaled = cb.replies.flatMap((r) => r.metObjectiveIds ?? []);
    expect(new Set(signaled)).toEqual(new Set(['greet', 'order']));
  });

  it('opts.replies로 응답 텍스트를 오버라이드해도 목표 신호는 시나리오를 따른다', async () => {
    const cb = collector();
    const t = createRoleplayMockTransport(SCENARIO, cb, { replies: ['오버라이드!'] });
    await t.connect();
    await t.sendUserText('hi');
    expect(cb.replies[0].reply).toBe('오버라이드!');
    expect(cb.replies[0].metObjectiveIds).toEqual(['greet']);
  });

  it('각 응답은 비어 있지 않은 텍스트를 가진다', async () => {
    const cb = collector();
    const t = createRoleplayMockTransport(SCENARIO, cb);
    await t.connect();
    await t.sendUserText('hi');
    expect(typeof cb.replies[0].reply).toBe('string');
    expect(cb.replies[0].reply.length).toBeGreaterThan(0);
  });

  it('close 후에는 onTedReply가 호출되지 않는다', async () => {
    const cb = collector();
    const t = createRoleplayMockTransport(SCENARIO, cb);
    await t.connect();
    t.close();
    await t.sendUserText('hello');
    expect(cb.replies.length).toBe(0);
  });

  it('connect 전 sendUserText는 응답을 내지 않는다(가드)', async () => {
    const cb = collector();
    const t = createRoleplayMockTransport(SCENARIO, cb);
    await t.sendUserText('hello');
    expect(cb.replies.length).toBe(0);
  });

  it('bargeIn/close는 throw하지 않는다(멱등)', async () => {
    const cb = collector();
    const t = createRoleplayMockTransport(SCENARIO, cb);
    await t.connect();
    expect(() => {
      t.bargeIn();
      t.close();
      t.close();
    }).not.toThrow();
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
