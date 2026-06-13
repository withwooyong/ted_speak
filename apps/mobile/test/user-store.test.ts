/**
 * user-store.test.ts — TDD red 단계
 * 대상(미존재): apps/mobile/src/stores/user-core.ts
 *
 * 온보딩 선택값 검증·기본값 순수 로직 (U3)
 */

import { describe, expect, it } from 'vitest';

import {
  applyLessonReward,
  buildProfileUpdate,
  type OnboardingSelections,
} from '../src/stores/user-core';

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

function makeSelections(overrides: Partial<OnboardingSelections> = {}): OnboardingSelections {
  return {
    goal: 'daily',
    level: 'A2',
    dailyGoalMinutes: 10,
    micGranted: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildProfileUpdate 테스트
// ─────────────────────────────────────────────────────────────────────────────

describe('buildProfileUpdate', () => {
  // 1. 정확히 3개 키만 반환 (grant 화이트리스트: goal, level, daily_goal_minutes)
  it('정확히 3개 키만 반환한다 (grant 화이트리스트 컬럼만)', () => {
    const result = buildProfileUpdate(makeSelections());
    const keys = Object.keys(result);
    expect(keys).toHaveLength(3);
  });

  it('반환 키는 goal, level, daily_goal_minutes만 포함한다', () => {
    const result = buildProfileUpdate(makeSelections());
    expect(result).toHaveProperty('goal');
    expect(result).toHaveProperty('level');
    expect(result).toHaveProperty('daily_goal_minutes');
  });

  it('is_premium 컬럼을 포함하지 않는다 (보안 화이트리스트)', () => {
    const result = buildProfileUpdate(makeSelections());
    expect(result).not.toHaveProperty('is_premium');
  });

  it('streak 컬럼을 포함하지 않는다 (보안 화이트리스트)', () => {
    const result = buildProfileUpdate(makeSelections());
    expect(result).not.toHaveProperty('streak');
  });

  it('total_speaking_seconds 컬럼을 포함하지 않는다', () => {
    const result = buildProfileUpdate(makeSelections());
    expect(result).not.toHaveProperty('total_speaking_seconds');
  });

  it('last_study_date 컬럼을 포함하지 않는다', () => {
    const result = buildProfileUpdate(makeSelections());
    expect(result).not.toHaveProperty('last_study_date');
  });

  it('premium_expires_at 컬럼을 포함하지 않는다', () => {
    const result = buildProfileUpdate(makeSelections());
    expect(result).not.toHaveProperty('premium_expires_at');
  });

  it('micGranted는 DB 컬럼이 아니므로 payload에 포함하지 않는다', () => {
    const result = buildProfileUpdate(makeSelections({ micGranted: true }));
    expect(result).not.toHaveProperty('micGranted');
    expect(result).not.toHaveProperty('mic_granted');
  });

  it('goal 값이 정확히 전달된다', () => {
    const result = buildProfileUpdate(makeSelections({ goal: 'business' }));
    expect(result.goal).toBe('business');
  });

  it('level 값이 정확히 전달된다', () => {
    const result = buildProfileUpdate(makeSelections({ level: 'B1' }));
    expect(result.level).toBe('B1');
  });

  it('dailyGoalMinutes가 daily_goal_minutes(snake_case)로 변환된다', () => {
    const result = buildProfileUpdate(makeSelections({ dailyGoalMinutes: 15 }));
    expect(result.daily_goal_minutes).toBe(15);
  });

  it('모든 valid goal 값 (daily, business, travel) 처리된다', () => {
    for (const goal of ['daily', 'business', 'travel'] as const) {
      const result = buildProfileUpdate(makeSelections({ goal }));
      expect(result.goal).toBe(goal);
    }
  });

  it('모든 valid level 값 (A1, A2, B1, B2) 처리된다', () => {
    for (const level of ['A1', 'A2', 'B1', 'B2'] as const) {
      const result = buildProfileUpdate(makeSelections({ level }));
      expect(result.level).toBe(level);
    }
  });

  it('모든 valid dailyGoalMinutes 값 (5, 10, 15) 처리된다', () => {
    for (const minutes of [5, 10, 15] as const) {
      const result = buildProfileUpdate(makeSelections({ dailyGoalMinutes: minutes }));
      expect(result.daily_goal_minutes).toBe(minutes);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyLessonReward 테스트
// ─────────────────────────────────────────────────────────────────────────────

describe('applyLessonReward', () => {
  const baseState = {
    xp: 100,
    streak: 3,
    todaySpeakingSeconds: 0,
    lastStudyDate: null,
  };

  // 2-a. 첫 완료(lastStudyDate null) → streak 1
  it('첫 완료(lastStudyDate null) → streak 1이 된다', () => {
    const result = applyLessonReward(
      { ...baseState, streak: 0, lastStudyDate: null },
      { xp: 50, speakingSeconds: 120, today: '2026-06-12' },
    );
    expect(result.streak).toBe(1);
  });

  // 2-b. 어제 학습 → streak+1
  it('어제 학습했으면 streak이 1 증가한다', () => {
    const result = applyLessonReward(
      { ...baseState, streak: 5, lastStudyDate: '2026-06-11' },
      { xp: 50, speakingSeconds: 120, today: '2026-06-12' },
    );
    expect(result.streak).toBe(6);
  });

  // 2-c. 오늘 이미 학습(lastStudyDate === today) → streak 불변·xp는 누적
  it('오늘 이미 학습했으면 streak은 그대로이고 xp는 누적된다', () => {
    const result = applyLessonReward(
      { ...baseState, streak: 7, xp: 200, lastStudyDate: '2026-06-12' },
      { xp: 50, speakingSeconds: 120, today: '2026-06-12' },
    );
    expect(result.streak).toBe(7);
    expect(result.xp).toBe(250);
  });

  // 2-d. 이틀 전 학습(공백) → streak 1로 리셋
  it('이틀 전 학습(공백)이면 streak이 1로 리셋된다', () => {
    const result = applyLessonReward(
      { ...baseState, streak: 10, lastStudyDate: '2026-06-10' },
      { xp: 50, speakingSeconds: 120, today: '2026-06-12' },
    );
    expect(result.streak).toBe(1);
  });

  it('3일 전 학습(긴 공백)도 streak이 1로 리셋된다', () => {
    const result = applyLessonReward(
      { ...baseState, streak: 15, lastStudyDate: '2026-06-01' },
      { xp: 50, speakingSeconds: 120, today: '2026-06-12' },
    );
    expect(result.streak).toBe(1);
  });

  // xp 항상 누적
  it('xp는 항상 누적된다', () => {
    const result = applyLessonReward(
      { ...baseState, xp: 100 },
      { xp: 30, speakingSeconds: 60, today: '2026-06-12' },
    );
    expect(result.xp).toBe(130);
  });

  // lastStudyDate는 today로 갱신
  it('lastStudyDate는 today로 갱신된다', () => {
    const result = applyLessonReward(
      { ...baseState, lastStudyDate: '2026-06-11' },
      { xp: 50, speakingSeconds: 60, today: '2026-06-12' },
    );
    expect(result.lastStudyDate).toBe('2026-06-12');
  });

  // 3. todaySpeakingSeconds: lastStudyDate가 today와 다르면 0에서 다시 시작
  it('todaySpeakingSeconds: lastStudyDate != today이면 speakingSeconds만큼 새로 시작한다', () => {
    const result = applyLessonReward(
      { ...baseState, todaySpeakingSeconds: 500, lastStudyDate: '2026-06-11' },
      { xp: 50, speakingSeconds: 120, today: '2026-06-12' },
    );
    expect(result.todaySpeakingSeconds).toBe(120);
  });

  it('todaySpeakingSeconds: lastStudyDate가 null(첫 학습)이면 speakingSeconds만큼 새로 시작한다', () => {
    const result = applyLessonReward(
      { ...baseState, todaySpeakingSeconds: 0, lastStudyDate: null },
      { xp: 50, speakingSeconds: 90, today: '2026-06-12' },
    );
    expect(result.todaySpeakingSeconds).toBe(90);
  });

  it('todaySpeakingSeconds: lastStudyDate === today이면 누적된다', () => {
    const result = applyLessonReward(
      { ...baseState, todaySpeakingSeconds: 300, lastStudyDate: '2026-06-12' },
      { xp: 50, speakingSeconds: 120, today: '2026-06-12' },
    );
    expect(result.todaySpeakingSeconds).toBe(420);
  });

  // 반환 타입 검증
  it('반환 객체에 xp, streak, todaySpeakingSeconds, lastStudyDate가 모두 포함된다', () => {
    const result = applyLessonReward(
      baseState,
      { xp: 50, speakingSeconds: 60, today: '2026-06-12' },
    );
    expect(result).toHaveProperty('xp');
    expect(result).toHaveProperty('streak');
    expect(result).toHaveProperty('todaySpeakingSeconds');
    expect(result).toHaveProperty('lastStudyDate');
  });
});
