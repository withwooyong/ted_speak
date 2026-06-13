import { describe, expect, it } from 'vitest';

import { LessonSchema, type Lesson } from '@ted-speak/shared';
import { TurnFeedbackSchema, type TurnFeedback } from '@ted-speak/shared';

import {
  applyConversationTurn,
  applyDrillResult,
  completeLearn,
  createLessonState,
  fromSnapshot,
  skipDrill,
  summarize,
  toSnapshot,
  type DrillOutcome,
  type LessonState,
  type LessonSummary,
} from '../src/lib/lesson-core';

// ── 테스트 픽스처 ─────────────────────────────────────────────────────────────

/** drills 2개, targetTurns 3인 미니 레슨 — LessonSchema.parse로 스키마 정합 보장 */
const MINI_LESSON: Lesson = LessonSchema.parse({
  id: 'test-lesson-001',
  order: 1,
  title: '테스트 레슨',
  titleEn: 'Test Lesson',
  estimatedMinutes: 5,
  keyPhrases: [
    { en: 'I like hiking.', ko: '나는 등산을 좋아해요.' },
  ],
  drills: [
    { text: 'I like hiking.', ko: '나는 등산을 좋아해요.', keyWords: ['like', 'hiking'] },
    { text: 'How about you?', ko: '당신은요?', keyWords: ['how', 'about', 'you'] },
  ],
  conversation: {
    topic: 'Talk about hobbies.',
    openingLine: 'Hi! What are you into?',
    targetTurns: 3,
  },
});

/** 기본 TurnFeedback 픽스처 */
function makeFeedback(overrides: Partial<TurnFeedback> = {}): TurnFeedback {
  return TurnFeedbackSchema.parse({
    corrections: [],
    reply: 'Great job!',
    encouragement: 'Keep it up!',
    ...overrides,
  });
}

// ── describe ─────────────────────────────────────────────────────────────────

describe('lesson-core — 레슨 3단계 상태 머신', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. 초기 상태
  // ──────────────────────────────────────────────────────────────────────────
  describe('createLessonState — 초기 상태', () => {
    it('step이 learn이고 숫자 필드들이 모두 0이다', () => {
      const s = createLessonState(MINI_LESSON);
      expect(s.step).toBe('learn');
      expect(s.drillIndex).toBe(0);
      expect(s.drillFails).toBe(0);
      expect(s.canSkipDrill).toBe(false);
      expect(s.turnCount).toBe(0);
      expect(s.corrections).toEqual([]);
      expect(s.sentencesSpoken).toBe(0);
      expect(s.speakingSeconds).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. completeLearn
  // ──────────────────────────────────────────────────────────────────────────
  describe('completeLearn', () => {
    it('learn → drill로 step이 전이된다', () => {
      const s = createLessonState(MINI_LESSON);
      const next = completeLearn(s);
      expect(next.step).toBe('drill');
    });

    it('다른 필드는 변경되지 않는다', () => {
      const s = createLessonState(MINI_LESSON);
      const next = completeLearn(s);
      expect(next.drillIndex).toBe(0);
      expect(next.drillFails).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. applyDrillResult — pass
  // ──────────────────────────────────────────────────────────────────────────
  describe('applyDrillResult — pass (score ≥ 80)', () => {
    it('score 80 이상 → outcome pass, drillIndex+1, fails 리셋, sentencesSpoken+1, speakingSeconds 누적', () => {
      const s = completeLearn(createLessonState(MINI_LESSON));
      const { state, outcome } = applyDrillResult(s, MINI_LESSON, {
        score: 100,
        missing: [],
        speakingSeconds: 3,
      });
      expect(outcome.kind).toBe('pass');
      expect(state.drillIndex).toBe(1);
      expect(state.drillFails).toBe(0);
      expect(state.canSkipDrill).toBe(false);
      expect(state.sentencesSpoken).toBe(1);
      expect(state.speakingSeconds).toBe(3);
    });

    it('마지막 드릴 통과 시 step이 conversation으로 전이된다', () => {
      // drillIndex 1 (마지막) 상태로 세팅
      const s: LessonState = {
        ...completeLearn(createLessonState(MINI_LESSON)),
        drillIndex: 1,
      };
      const { state, outcome } = applyDrillResult(s, MINI_LESSON, {
        score: 100,
        missing: [],
        speakingSeconds: 2,
      });
      expect(outcome.kind).toBe('pass');
      expect(state.step).toBe('conversation');
    });

    it('passThreshold 옵션을 지정하면 해당 값으로 pass 판정한다', () => {
      const s = completeLearn(createLessonState(MINI_LESSON));
      const { outcome } = applyDrillResult(s, MINI_LESSON, {
        score: 60,
        missing: [],
        passThreshold: 50,
        speakingSeconds: 1,
      });
      expect(outcome.kind).toBe('pass');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. applyDrillResult — 1회 실패
  // ──────────────────────────────────────────────────────────────────────────
  describe('applyDrillResult — 1회 실패 (score < 80)', () => {
    it('outcome retry, fails 1, drillIndex 불변, missing 전달', () => {
      const s = completeLearn(createLessonState(MINI_LESSON));
      const { state, outcome } = applyDrillResult(s, MINI_LESSON, {
        score: 50,
        missing: ['hiking'],
        speakingSeconds: 2,
      });
      expect(outcome.kind).toBe('retry');
      expect(outcome.missing).toEqual(['hiking']);
      expect(state.drillIndex).toBe(0);
      expect(state.drillFails).toBe(1);
      expect(state.canSkipDrill).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. applyDrillResult — 2회 연속 실패
  // ──────────────────────────────────────────────────────────────────────────
  describe('applyDrillResult — 2회 연속 실패', () => {
    it('outcome skip_available, canSkipDrill true', () => {
      let s = completeLearn(createLessonState(MINI_LESSON));
      // 1회 실패
      ({ state: s } = applyDrillResult(s, MINI_LESSON, {
        score: 0,
        missing: ['like', 'hiking'],
        speakingSeconds: 1,
      }));
      // 2회 실패
      const { state, outcome } = applyDrillResult(s, MINI_LESSON, {
        score: 0,
        missing: ['like', 'hiking'],
        speakingSeconds: 1,
      });
      expect(outcome.kind).toBe('skip_available');
      expect(state.canSkipDrill).toBe(true);
    });

    it('canSkipDrill true 상태에서도 재시도해서 pass할 수 있다', () => {
      let s = completeLearn(createLessonState(MINI_LESSON));
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 0, missing: [], speakingSeconds: 1 }));
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 0, missing: [], speakingSeconds: 1 }));
      expect(s.canSkipDrill).toBe(true);

      const { outcome } = applyDrillResult(s, MINI_LESSON, { score: 100, missing: [], speakingSeconds: 2 });
      expect(outcome.kind).toBe('pass');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. skipDrill
  // ──────────────────────────────────────────────────────────────────────────
  describe('skipDrill', () => {
    it('canSkipDrill false면 상태 불변(no-op)이다', () => {
      const s = completeLearn(createLessonState(MINI_LESSON));
      expect(s.canSkipDrill).toBe(false);
      const next = skipDrill(s, MINI_LESSON);
      expect(next).toEqual(s);
    });

    it('canSkipDrill true면 drillIndex+1, fails/canSkip 리셋, sentencesSpoken 증가 없음', () => {
      let s = completeLearn(createLessonState(MINI_LESSON));
      // 2회 실패로 canSkipDrill 세팅
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 0, missing: [], speakingSeconds: 1 }));
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 0, missing: [], speakingSeconds: 1 }));
      expect(s.canSkipDrill).toBe(true);
      const prevSentences = s.sentencesSpoken;

      const next = skipDrill(s, MINI_LESSON);
      expect(next.drillIndex).toBe(1);
      expect(next.drillFails).toBe(0);
      expect(next.canSkipDrill).toBe(false);
      expect(next.sentencesSpoken).toBe(prevSentences); // 발화 카운트 증가 없음
    });

    it('마지막 드릴 skip 시 step이 conversation으로 전이된다', () => {
      // drillIndex 1(마지막)에서 canSkipDrill true 상태 수동 구성
      const s: LessonState = {
        ...completeLearn(createLessonState(MINI_LESSON)),
        drillIndex: 1,
        drillFails: 2,
        canSkipDrill: true,
      };
      const next = skipDrill(s, MINI_LESSON);
      expect(next.step).toBe('conversation');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. applyConversationTurn
  // ──────────────────────────────────────────────────────────────────────────
  describe('applyConversationTurn', () => {
    /** conversation 단계 진입 헬퍼 */
    function makeConversationState(): LessonState {
      let s = completeLearn(createLessonState(MINI_LESSON));
      // 두 드릴 모두 통과
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 100, missing: [], speakingSeconds: 2 }));
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 100, missing: [], speakingSeconds: 2 }));
      return s;
    }

    it('턴마다 turnCount+1, sentencesSpoken+1, speakingSeconds 누적, corrections 추가', () => {
      const s = makeConversationState();
      expect(s.step).toBe('conversation');
      const feedback = makeFeedback({
        corrections: [{ original: 'me like', suggested: 'I like', type: 'grammar' }],
      });
      const next = applyConversationTurn(s, MINI_LESSON, { feedback, speakingSeconds: 5 });
      expect(next.turnCount).toBe(1);
      expect(next.sentencesSpoken).toBe(s.sentencesSpoken + 1);
      expect(next.speakingSeconds).toBe(s.speakingSeconds + 5);
      expect(next.corrections).toHaveLength(1);
      expect(next.corrections[0].original).toBe('me like');
    });

    it('turnCount가 targetTurns에 도달하면 step이 complete가 된다', () => {
      let s = makeConversationState();
      const feedback = makeFeedback();
      // targetTurns = 3
      s = applyConversationTurn(s, MINI_LESSON, { feedback, speakingSeconds: 2 });
      s = applyConversationTurn(s, MINI_LESSON, { feedback, speakingSeconds: 2 });
      s = applyConversationTurn(s, MINI_LESSON, { feedback, speakingSeconds: 2 });
      expect(s.turnCount).toBe(3);
      expect(s.step).toBe('complete');
    });

    it('여러 턴의 corrections가 누적된다', () => {
      let s = makeConversationState();
      const fb1 = makeFeedback({ corrections: [{ original: 'me like', suggested: 'I like', type: 'grammar' }] });
      const fb2 = makeFeedback({ corrections: [{ original: 'musics', suggested: 'music', type: 'vocab' }] });
      s = applyConversationTurn(s, MINI_LESSON, { feedback: fb1, speakingSeconds: 2 });
      s = applyConversationTurn(s, MINI_LESSON, { feedback: fb2, speakingSeconds: 2 });
      expect(s.corrections).toHaveLength(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. 방어: drill 단계에서 applyConversationTurn 호출 → no-op
  // ──────────────────────────────────────────────────────────────────────────
  describe('applyConversationTurn — drill 단계 방어', () => {
    it('drill step에서 호출하면 상태가 불변이다', () => {
      const s = completeLearn(createLessonState(MINI_LESSON));
      expect(s.step).toBe('drill');
      const next = applyConversationTurn(s, MINI_LESSON, {
        feedback: makeFeedback(),
        speakingSeconds: 3,
      });
      expect(next).toEqual(s);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. 불변성 — 모든 전이가 새 객체 반환
  // ──────────────────────────────────────────────────────────────────────────
  describe('불변성', () => {
    it('completeLearn은 원본 객체와 다른 참조를 반환한다', () => {
      const s = createLessonState(MINI_LESSON);
      const next = completeLearn(s);
      expect(next).not.toBe(s);
      expect(s.step).toBe('learn'); // 원본 불변
    });

    it('applyDrillResult는 원본 객체와 다른 참조를 반환한다', () => {
      const s = completeLearn(createLessonState(MINI_LESSON));
      const { state: next } = applyDrillResult(s, MINI_LESSON, { score: 100, missing: [], speakingSeconds: 1 });
      expect(next).not.toBe(s);
      expect(s.drillIndex).toBe(0); // 원본 불변
    });

    it('skipDrill(canSkipDrill=true)은 원본과 다른 참조를 반환한다', () => {
      let s = completeLearn(createLessonState(MINI_LESSON));
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 0, missing: [], speakingSeconds: 1 }));
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 0, missing: [], speakingSeconds: 1 }));
      const next = skipDrill(s, MINI_LESSON);
      expect(next).not.toBe(s);
      expect(s.drillIndex).toBe(0); // 원본 불변
    });

    it('applyConversationTurn은 원본과 다른 참조를 반환한다', () => {
      let s = completeLearn(createLessonState(MINI_LESSON));
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 100, missing: [], speakingSeconds: 1 }));
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 100, missing: [], speakingSeconds: 1 }));
      const next = applyConversationTurn(s, MINI_LESSON, { feedback: makeFeedback(), speakingSeconds: 2 });
      expect(next).not.toBe(s);
      expect(s.turnCount).toBe(0); // 원본 불변
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. 스냅샷 직렬화
  // ──────────────────────────────────────────────────────────────────────────
  describe('toSnapshot / fromSnapshot', () => {
    it('toSnapshot→fromSnapshot 왕복 후 동일 상태가 복원된다', () => {
      let s = completeLearn(createLessonState(MINI_LESSON));
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 100, missing: [], speakingSeconds: 3 }));
      const json = toSnapshot(s);
      const restored = fromSnapshot(json, MINI_LESSON);
      expect(restored).toEqual(s);
    });

    it('깨진 JSON → createLessonState와 동일한 초기 상태로 폴백한다', () => {
      const restored = fromSnapshot('{ invalid json !!', MINI_LESSON);
      expect(restored).toEqual(createLessonState(MINI_LESSON));
    });

    it('필드 누락 JSON → 초기 상태로 폴백한다', () => {
      const partial = JSON.stringify({ step: 'drill' }); // 필수 필드 누락
      const restored = fromSnapshot(partial, MINI_LESSON);
      expect(restored).toEqual(createLessonState(MINI_LESSON));
    });

    it('drillIndex가 레슨 드릴 수 이상인 경우 → 초기 상태로 폴백한다', () => {
      const s = createLessonState(MINI_LESSON);
      // drillIndex = 99 (레슨 drills 길이 2 이상)
      const broken = JSON.stringify({ ...s, drillIndex: 99 });
      const restored = fromSnapshot(broken, MINI_LESSON);
      expect(restored).toEqual(createLessonState(MINI_LESSON));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 11. summarize
  // ──────────────────────────────────────────────────────────────────────────
  describe('summarize', () => {
    /** complete 단계까지 진행한 상태 생성 헬퍼 */
    function makeCompleteState(corrections: TurnFeedback['corrections'] = []): LessonState {
      let s = completeLearn(createLessonState(MINI_LESSON));
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 100, missing: [], speakingSeconds: 3 }));
      ({ state: s } = applyDrillResult(s, MINI_LESSON, { score: 100, missing: [], speakingSeconds: 3 }));
      const fb = makeFeedback({ corrections });
      s = applyConversationTurn(s, MINI_LESSON, { feedback: fb, speakingSeconds: 4 });
      s = applyConversationTurn(s, MINI_LESSON, { feedback: makeFeedback(), speakingSeconds: 4 });
      s = applyConversationTurn(s, MINI_LESSON, { feedback: makeFeedback(), speakingSeconds: 4 });
      return s;
    }

    it('xp는 30 고정이다', () => {
      const s = makeCompleteState();
      const summary: LessonSummary = summarize(s, MINI_LESSON);
      expect(summary.xp).toBe(30);
    });

    it('sentencesSpoken과 speakingSeconds가 누적 값과 일치한다', () => {
      const s = makeCompleteState();
      const summary = summarize(s, MINI_LESSON);
      expect(summary.sentencesSpoken).toBe(s.sentencesSpoken);
      expect(summary.speakingSeconds).toBe(s.speakingSeconds);
    });

    it('corrections 0건이면 strengths에 기본 격려 문구가 포함된다 (길이>0, 최대 2개)', () => {
      const s = makeCompleteState([]);
      const summary = summarize(s, MINI_LESSON);
      expect(summary.strengths.length).toBeGreaterThan(0);
      expect(summary.strengths.length).toBeLessThanOrEqual(2);
      expect(summary.strengths[0].length).toBeGreaterThan(0);
      expect(summary.improvements).toHaveLength(0);
    });

    it('corrections 있으면 improvements가 type별 집계 기반으로 생성된다 (최대 2개)', () => {
      const corrections: TurnFeedback['corrections'] = [
        { original: 'me go', suggested: 'I go', type: 'grammar' },
        { original: 'me walk', suggested: 'I walk', type: 'grammar' },
        { original: 'musics', suggested: 'music', type: 'vocab' },
      ];
      const s = makeCompleteState(corrections);
      const summary = summarize(s, MINI_LESSON);
      expect(summary.improvements.length).toBeGreaterThan(0);
      expect(summary.improvements.length).toBeLessThanOrEqual(2);
      summary.improvements.forEach((imp) => expect(imp.length).toBeGreaterThan(0));
    });

    it('strengths는 최대 2개이고 모두 빈 문자열이 아니다', () => {
      const s = makeCompleteState([]);
      const summary = summarize(s, MINI_LESSON);
      expect(summary.strengths.length).toBeLessThanOrEqual(2);
      summary.strengths.forEach((str) => expect(str.length).toBeGreaterThan(0));
    });
  });
});
