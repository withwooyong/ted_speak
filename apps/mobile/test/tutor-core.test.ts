import { describe, expect, it } from 'vitest';

import type { Correction } from '@ted-speak/shared';

import {
  applyTedTurn,
  applyUserTurn,
  createTutorState,
  endSession,
  findTopic,
  HISTORY_WINDOW,
  markActive,
  SESSION_MAX_SECONDS,
  startConnecting,
  summarizeTutor,
  tick,
  toSummary,
  TURN_MAX_SECONDS,
  TUTOR_TOPICS,
  type TutorState,
} from '../src/lib/tutor-core';

// ── 픽스처 ────────────────────────────────────────────────────────────────────

const TOPIC = TUTOR_TOPICS[0];

const grammar = (i = 0): Correction => ({
  original: `me go ${i}`,
  suggested: `I went ${i}`,
  type: 'grammar',
});
const vocab = (): Correction => ({ original: 'big', suggested: 'huge', type: 'vocab' });

function active(): TutorState {
  return markActive(startConnecting(createTutorState(TOPIC.id)));
}

// ── 시드 주제 ─────────────────────────────────────────────────────────────────

describe('TUTOR_TOPICS', () => {
  it('주제는 3개 이상이고 각 항목이 필수 필드를 갖는다', () => {
    expect(TUTOR_TOPICS.length).toBeGreaterThanOrEqual(3);
    for (const t of TUTOR_TOPICS) {
      expect(t.id).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.prompt).toBeTruthy();
    }
  });

  it('주제 id는 고유하다', () => {
    const ids = TUTOR_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('findTopic은 id로 주제를 찾고 없으면 undefined', () => {
    expect(findTopic(TOPIC.id)?.id).toBe(TOPIC.id);
    expect(findTopic('nope')).toBeUndefined();
  });
});

// ── 초기 상태·전이 ────────────────────────────────────────────────────────────

describe('createTutorState / 전이', () => {
  it('초기 상태는 topic phase, 카운터 0', () => {
    const s = createTutorState(TOPIC.id);
    expect(s.phase).toBe('topic');
    expect(s.topicId).toBe(TOPIC.id);
    expect(s.turnCount).toBe(0);
    expect(s.speakingSeconds).toBe(0);
    expect(s.elapsedSeconds).toBe(0);
    expect(s.corrections).toEqual([]);
    expect(s.history).toEqual([]);
    expect(s.endedReason).toBeNull();
  });

  it('topic → connecting → active 순서로 전이한다', () => {
    expect(startConnecting(createTutorState(TOPIC.id)).phase).toBe('connecting');
    expect(active().phase).toBe('active');
  });

  it('전이는 불변 — 원본 상태를 변경하지 않는다', () => {
    const s = createTutorState(TOPIC.id);
    startConnecting(s);
    expect(s.phase).toBe('topic');
  });
});

// ── 사용자 턴 ─────────────────────────────────────────────────────────────────

describe('applyUserTurn', () => {
  it('발화 시간을 누적하고 history에 user 항목을 추가한다', () => {
    const s = applyUserTurn(active(), { transcript: 'Hello Ted', seconds: 5 });
    expect(s.speakingSeconds).toBe(5);
    expect(s.history.at(-1)).toEqual({ role: 'user', text: 'Hello Ted' });
  });

  it('턴당 발화 시간을 TURN_MAX_SECONDS로 클램프한다', () => {
    const s = applyUserTurn(active(), { transcript: 'long', seconds: TURN_MAX_SECONDS + 100 });
    expect(s.speakingSeconds).toBe(TURN_MAX_SECONDS);
  });

  it('active가 아니면 무시한다(no-op)', () => {
    const idle = createTutorState(TOPIC.id);
    expect(applyUserTurn(idle, { transcript: 'x', seconds: 3 })).toBe(idle);
  });

  it('turnCount는 사용자 발화만으로는 늘지 않는다(교환 완료 시 증가)', () => {
    const s = applyUserTurn(active(), { transcript: 'hi', seconds: 2 });
    expect(s.turnCount).toBe(0);
  });
});

// ── Ted 턴 ────────────────────────────────────────────────────────────────────

describe('applyTedTurn', () => {
  it('교정을 누적하고 turnCount를 증가시키며 assistant history를 추가한다', () => {
    let s = active();
    s = applyUserTurn(s, { transcript: 'me go school', seconds: 4 });
    s = applyTedTurn(s, { reply: 'You went to school?', corrections: [grammar()] });
    expect(s.turnCount).toBe(1);
    expect(s.corrections).toHaveLength(1);
    expect(s.history.at(-1)).toEqual({ role: 'assistant', text: 'You went to school?' });
  });

  it('history는 HISTORY_WINDOW 개로 슬라이딩한다', () => {
    let s = active();
    for (let i = 0; i < HISTORY_WINDOW + 3; i++) {
      s = applyUserTurn(s, { transcript: `u${i}`, seconds: 1 });
      s = applyTedTurn(s, { reply: `t${i}`, corrections: [] });
    }
    expect(s.history.length).toBe(HISTORY_WINDOW);
    // 가장 오래된 항목은 잘려 나갔다
    expect(s.history.every((h) => h.text !== 'u0')).toBe(true);
  });

  it('active가 아니면 무시한다(no-op)', () => {
    const idle = createTutorState(TOPIC.id);
    expect(applyTedTurn(idle, { reply: 'x', corrections: [] })).toBe(idle);
  });
});

// ── 타이머·종료 ───────────────────────────────────────────────────────────────

describe('tick / endSession / toSummary', () => {
  it('tick은 elapsedSeconds를 설정한다', () => {
    expect(tick(active(), 30).elapsedSeconds).toBe(30);
  });

  it('SESSION_MAX_SECONDS에 도달하면 ending(time_up)으로 전이한다', () => {
    const s = tick(active(), SESSION_MAX_SECONDS);
    expect(s.phase).toBe('ending');
    expect(s.endedReason).toBe('time_up');
  });

  it('상한 미만이면 active를 유지한다', () => {
    const s = tick(active(), SESSION_MAX_SECONDS - 1);
    expect(s.phase).toBe('active');
    expect(s.endedReason).toBeNull();
  });

  it('endSession(user_ended)은 ending으로 전이하고 사유를 남긴다', () => {
    const s = endSession(active(), 'user_ended');
    expect(s.phase).toBe('ending');
    expect(s.endedReason).toBe('user_ended');
  });

  it('toSummary는 ending → summary로 전이한다', () => {
    const s = toSummary(endSession(active(), 'user_ended'));
    expect(s.phase).toBe('summary');
  });

  it('잘못된 단계의 전이는 no-op (가드)', () => {
    const idle = createTutorState(TOPIC.id);
    expect(markActive(idle)).toBe(idle); // connecting 아님
    expect(tick(idle, 10)).toBe(idle); // active 아님
    expect(endSession(idle, 'error')).toBe(idle); // active/ending 아님
    expect(toSummary(idle)).toBe(idle); // ending 아님
    const running = active();
    expect(startConnecting(running)).toBe(running); // 이미 active → topic 아님 → no-op
  });

  it('tick의 time_up 사유는 이후 endSession이 덮어쓰지 않는다', () => {
    const timedOut = tick(active(), SESSION_MAX_SECONDS);
    const ended = endSession(timedOut, 'user_ended');
    expect(ended.endedReason).toBe('time_up');
  });
});

// ── 요약 ──────────────────────────────────────────────────────────────────────

describe('summarizeTutor', () => {
  it('발화 시간·턴 수를 그대로 반영하고 교정 0건이면 격려만 남긴다', () => {
    let s = active();
    s = applyUserTurn(s, { transcript: 'hi', seconds: 7 });
    s = applyTedTurn(s, { reply: 'hello!', corrections: [] });
    const sum = summarizeTutor(s);
    expect(sum.speakingSeconds).toBe(7);
    expect(sum.turnCount).toBe(1);
    expect(sum.improvements).toEqual([]);
    expect(sum.strengths.length).toBeGreaterThan(0);
  });

  it('턴 0건(즉시 종료)이면 활동을 과장하지 않는다', () => {
    const s = endSession(active(), 'user_ended');
    const sum = summarizeTutor(s);
    expect(sum.turnCount).toBe(0);
    expect(sum.strengths.length).toBe(1);
    expect(sum.strengths[0]).not.toContain('끝까지');
  });

  it('교정을 type별로 집계해 improvements를 만든다(최대 2, 빈도순)', () => {
    let s = active();
    s = applyUserTurn(s, { transcript: 'a', seconds: 1 });
    s = applyTedTurn(s, { reply: 'r', corrections: [grammar(1), grammar(2), vocab()] });
    const sum = summarizeTutor(s);
    expect(sum.improvements.length).toBeLessThanOrEqual(2);
    expect(sum.improvements.length).toBeGreaterThanOrEqual(1);
  });
});
