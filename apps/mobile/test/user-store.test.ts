/**
 * user-store.test.ts — TDD red 단계
 * 대상(미존재): apps/mobile/src/stores/user-core.ts
 *
 * 온보딩 선택값 검증·기본값 순수 로직 (U3)
 * + profileToHydration — 서버 profiles → 로컬 스토어 하이드레이션 (HANDOFF 2b)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyLessonReward,
  buildProfileUpdate,
  profileToHydration,
  type OnboardingSelections,
  type ProfileRow,
} from '../src/stores/user-core';
import { useUserStore } from '../src/stores/user';

// 스토어 레이어 테스트용 RN 모킹 — Platform.OS='web'이면 user.ts가 메모리 폴백 저장소를 쓰므로
// AsyncStorage 없이 node에서 동작한다.
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

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

// 새 시그니처: buildProfileUpdate(selections, onboardedAt) — onboarded_at 포함 4개 키
const TEST_ONBOARDED_AT = '2026-06-13T10:00:00.000Z';

describe('buildProfileUpdate', () => {
  // 1. 정확히 4개 키 반환 (기존 3개 + onboarded_at)
  it('정확히 4개 키만 반환한다 (grant 화이트리스트 컬럼 + onboarded_at)', () => {
    const result = buildProfileUpdate(makeSelections(), TEST_ONBOARDED_AT);
    const keys = Object.keys(result);
    expect(keys).toHaveLength(4);
  });

  it('반환 키는 goal, level, daily_goal_minutes, onboarded_at을 포함한다', () => {
    const result = buildProfileUpdate(makeSelections(), TEST_ONBOARDED_AT);
    expect(result).toHaveProperty('goal');
    expect(result).toHaveProperty('level');
    expect(result).toHaveProperty('daily_goal_minutes');
    expect(result).toHaveProperty('onboarded_at');
  });

  it('onboarded_at이 두 번째 인자로 전달한 ISO 문자열로 설정된다', () => {
    const result = buildProfileUpdate(makeSelections(), TEST_ONBOARDED_AT);
    expect(result.onboarded_at).toBe(TEST_ONBOARDED_AT);
  });

  it('is_premium 컬럼을 포함하지 않는다 (보안 화이트리스트)', () => {
    const result = buildProfileUpdate(makeSelections(), TEST_ONBOARDED_AT);
    expect(result).not.toHaveProperty('is_premium');
  });

  it('streak 컬럼을 포함하지 않는다 (보안 화이트리스트)', () => {
    const result = buildProfileUpdate(makeSelections(), TEST_ONBOARDED_AT);
    expect(result).not.toHaveProperty('streak');
  });

  it('total_speaking_seconds 컬럼을 포함하지 않는다', () => {
    const result = buildProfileUpdate(makeSelections(), TEST_ONBOARDED_AT);
    expect(result).not.toHaveProperty('total_speaking_seconds');
  });

  it('last_study_date 컬럼을 포함하지 않는다', () => {
    const result = buildProfileUpdate(makeSelections(), TEST_ONBOARDED_AT);
    expect(result).not.toHaveProperty('last_study_date');
  });

  it('premium_expires_at 컬럼을 포함하지 않는다', () => {
    const result = buildProfileUpdate(makeSelections(), TEST_ONBOARDED_AT);
    expect(result).not.toHaveProperty('premium_expires_at');
  });

  it('micGranted는 DB 컬럼이 아니므로 payload에 포함하지 않는다', () => {
    const result = buildProfileUpdate(makeSelections({ micGranted: true }), TEST_ONBOARDED_AT);
    expect(result).not.toHaveProperty('micGranted');
    expect(result).not.toHaveProperty('mic_granted');
  });

  it('goal 값이 정확히 전달된다', () => {
    const result = buildProfileUpdate(makeSelections({ goal: 'business' }), TEST_ONBOARDED_AT);
    expect(result.goal).toBe('business');
  });

  it('level 값이 정확히 전달된다', () => {
    const result = buildProfileUpdate(makeSelections({ level: 'B1' }), TEST_ONBOARDED_AT);
    expect(result.level).toBe('B1');
  });

  it('dailyGoalMinutes가 daily_goal_minutes(snake_case)로 변환된다', () => {
    const result = buildProfileUpdate(makeSelections({ dailyGoalMinutes: 15 }), TEST_ONBOARDED_AT);
    expect(result.daily_goal_minutes).toBe(15);
  });

  it('모든 valid goal 값 (daily, business, travel) 처리된다', () => {
    for (const goal of ['daily', 'business', 'travel'] as const) {
      const result = buildProfileUpdate(makeSelections({ goal }), TEST_ONBOARDED_AT);
      expect(result.goal).toBe(goal);
    }
  });

  it('모든 valid level 값 (A1, A2, B1, B2) 처리된다', () => {
    for (const level of ['A1', 'A2', 'B1', 'B2'] as const) {
      const result = buildProfileUpdate(makeSelections({ level }), TEST_ONBOARDED_AT);
      expect(result.level).toBe(level);
    }
  });

  it('모든 valid dailyGoalMinutes 값 (5, 10, 15) 처리된다', () => {
    for (const minutes of [5, 10, 15] as const) {
      const result = buildProfileUpdate(makeSelections({ dailyGoalMinutes: minutes }), TEST_ONBOARDED_AT);
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

// ─────────────────────────────────────────────────────────────────────────────
// profileToHydration — 서버 profiles row → 로컬 스토어 HydrationPatch 변환
// 서버 streak·last_study_date가 권위 출처 (HANDOFF 2b)
// ─────────────────────────────────────────────────────────────────────────────

/** 유효한 ProfileRow 베이스 — 개별 테스트에서 오버라이드 */
function makeProfileRow(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    goal: 'daily',
    level: 'A2',
    daily_goal_minutes: 10,
    streak: 3,
    last_study_date: '2026-06-12',
    onboarded_at: '2026-06-13T10:00:00.000Z',
    ...overrides,
  };
}

describe('profileToHydration', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // onboarded_at null → null 반환 (온보딩 미완료)
  // ─────────────────────────────────────────────────────────────────────────────

  it('onboarded_at이 null이면 null을 반환한다 (온보딩 미완료, 로컬 폴백)', () => {
    const result = profileToHydration(makeProfileRow({ onboarded_at: null }));
    expect(result).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 오염된 enum 값 → null 반환 (온보딩 재진입 유도)
  // ─────────────────────────────────────────────────────────────────────────────

  it('goal이 허용 범위 밖이면 null을 반환한다 (서버 값 오염 방어)', () => {
    const result = profileToHydration(makeProfileRow({ goal: 'unknown_goal' as never }));
    expect(result).toBeNull();
  });

  it('level이 허용 범위 밖이면 null을 반환한다 (서버 값 오염 방어)', () => {
    const result = profileToHydration(makeProfileRow({ level: 'C1' as never }));
    expect(result).toBeNull();
  });

  it('빈 문자열 goal도 null을 반환한다', () => {
    const result = profileToHydration(makeProfileRow({ goal: '' as never }));
    expect(result).toBeNull();
  });

  it('빈 문자열 level도 null을 반환한다', () => {
    const result = profileToHydration(makeProfileRow({ level: '' as never }));
    expect(result).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // daily_goal_minutes 폴백 (1..120 밖 → 10)
  // ─────────────────────────────────────────────────────────────────────────────

  it('daily_goal_minutes가 0이면 10으로 폴백된다', () => {
    const result = profileToHydration(makeProfileRow({ daily_goal_minutes: 0 }));
    expect(result).not.toBeNull();
    expect(result!.dailyGoalMinutes).toBe(10);
  });

  it('daily_goal_minutes가 121이면 10으로 폴백된다', () => {
    const result = profileToHydration(makeProfileRow({ daily_goal_minutes: 121 }));
    expect(result).not.toBeNull();
    expect(result!.dailyGoalMinutes).toBe(10);
  });

  it('daily_goal_minutes가 NaN이면 10으로 폴백된다', () => {
    const result = profileToHydration(makeProfileRow({ daily_goal_minutes: NaN }));
    expect(result).not.toBeNull();
    expect(result!.dailyGoalMinutes).toBe(10);
  });

  it('daily_goal_minutes가 소수(1.5)이면 10으로 폴백된다', () => {
    const result = profileToHydration(makeProfileRow({ daily_goal_minutes: 1.5 }));
    expect(result).not.toBeNull();
    expect(result!.dailyGoalMinutes).toBe(10);
  });

  it('daily_goal_minutes가 1이면 유효 — 그대로 반영된다', () => {
    const result = profileToHydration(makeProfileRow({ daily_goal_minutes: 1 }));
    expect(result).not.toBeNull();
    expect(result!.dailyGoalMinutes).toBe(1);
  });

  it('daily_goal_minutes가 120이면 유효 — 그대로 반영된다', () => {
    const result = profileToHydration(makeProfileRow({ daily_goal_minutes: 120 }));
    expect(result).not.toBeNull();
    expect(result!.dailyGoalMinutes).toBe(120);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // streak 폴백 (음수·비정수 → 0)
  // ─────────────────────────────────────────────────────────────────────────────

  it('streak이 음수이면 0으로 폴백된다', () => {
    const result = profileToHydration(makeProfileRow({ streak: -1 }));
    expect(result).not.toBeNull();
    expect(result!.streak).toBe(0);
  });

  it('streak이 비정수(2.7)이면 0으로 폴백된다', () => {
    const result = profileToHydration(makeProfileRow({ streak: 2.7 }));
    expect(result).not.toBeNull();
    expect(result!.streak).toBe(0);
  });

  it('streak이 0이면 유효 — 그대로 반영된다', () => {
    const result = profileToHydration(makeProfileRow({ streak: 0 }));
    expect(result).not.toBeNull();
    expect(result!.streak).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 정상 row → HydrationPatch 완전 매핑
  // ─────────────────────────────────────────────────────────────────────────────

  it('정상 row는 모든 필드를 올바르게 매핑하고 onboarded: true를 포함한다', () => {
    const row = makeProfileRow({
      goal: 'business',
      level: 'B1',
      daily_goal_minutes: 15,
      streak: 7,
      last_study_date: '2026-06-12',
      onboarded_at: '2026-06-13T10:00:00.000Z',
    });
    const result = profileToHydration(row);
    expect(result).not.toBeNull();
    expect(result).toEqual({
      onboarded: true,
      goal: 'business',
      level: 'B1',
      dailyGoalMinutes: 15,
      streak: 7,
      lastStudyDate: '2026-06-12',
    });
  });

  it('last_study_date가 null이면 lastStudyDate도 null로 매핑된다', () => {
    const result = profileToHydration(makeProfileRow({ last_study_date: null }));
    expect(result).not.toBeNull();
    expect(result!.lastStudyDate).toBeNull();
  });

  it('last_study_date가 YYYY-MM-DD 형식이 아니면 null로 폴백된다 (오염 방어)', () => {
    const result = profileToHydration(makeProfileRow({ last_study_date: '2026/06/12' }));
    expect(result).not.toBeNull();
    expect(result!.lastStudyDate).toBeNull();
  });

  it('last_study_date가 ISO 타임스탬프 형식이어도 null로 폴백된다 (date 컬럼 계약 위반)', () => {
    const result = profileToHydration(makeProfileRow({ last_study_date: '2026-06-12T00:00:00Z' }));
    expect(result).not.toBeNull();
    expect(result!.lastStudyDate).toBeNull();
  });

  it('모든 valid goal 값 (daily, business, travel)이 매핑된다', () => {
    for (const goal of ['daily', 'business', 'travel'] as const) {
      const result = profileToHydration(makeProfileRow({ goal }));
      expect(result).not.toBeNull();
      expect(result!.goal).toBe(goal);
    }
  });

  it('모든 valid level 값 (A1, A2, B1, B2)이 매핑된다', () => {
    for (const level of ['A1', 'A2', 'B1', 'B2'] as const) {
      const result = profileToHydration(makeProfileRow({ level }));
      expect(result).not.toBeNull();
      expect(result!.level).toBe(level);
    }
  });

  it('반환 HydrationPatch에는 onboarded: true가 항상 포함된다', () => {
    const result = profileToHydration(makeProfileRow());
    expect(result).not.toBeNull();
    expect(result!.onboarded).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUserStore — 스토어 레이어 계약 (hydrateFromServer·hydrating·partialize)
// RN은 vi.mock(Platform.OS='web')으로 대체 — 메모리 폴백 저장소 경로
// ─────────────────────────────────────────────────────────────────────────────

/** INITIAL_USER_STATE와 동일한 영속화 대상 키 (user.ts partialize 계약) */
const PERSISTED_KEYS = [
  'onboarded',
  'goal',
  'level',
  'dailyGoalMinutes',
  'micGranted',
  'streak',
  'xp',
  'todaySpeakingSeconds',
  'lastStudyDate',
] as const;

describe('useUserStore — 스토어 레이어', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('hydrateFromServer는 patch 필드를 반영한다', () => {
    useUserStore.getState().hydrateFromServer({
      onboarded: true,
      goal: 'business',
      level: 'B1',
      dailyGoalMinutes: 15,
      streak: 7,
      lastStudyDate: '2026-06-12',
    });
    const s = useUserStore.getState();
    expect(s.onboarded).toBe(true);
    expect(s.goal).toBe('business');
    expect(s.level).toBe('B1');
    expect(s.dailyGoalMinutes).toBe(15);
    expect(s.streak).toBe(7);
    expect(s.lastStudyDate).toBe('2026-06-12');
  });

  it('hydrateFromServer는 xp·todaySpeakingSeconds·micGranted를 건드리지 않는다', () => {
    useUserStore.setState({ xp: 120, todaySpeakingSeconds: 300, micGranted: true });
    useUserStore.getState().hydrateFromServer({
      onboarded: true,
      goal: 'daily',
      level: 'A2',
      dailyGoalMinutes: 10,
      streak: 3,
      lastStudyDate: null,
    });
    const s = useUserStore.getState();
    expect(s.xp).toBe(120);
    expect(s.todaySpeakingSeconds).toBe(300);
    expect(s.micGranted).toBe(true);
  });

  it('setHydrating으로 hydrating을 토글할 수 있다 (초기값 false)', () => {
    expect(useUserStore.getState().hydrating).toBe(false);
    useUserStore.getState().setHydrating(true);
    expect(useUserStore.getState().hydrating).toBe(true);
    useUserStore.getState().setHydrating(false);
    expect(useUserStore.getState().hydrating).toBe(false);
  });

  it('reset()은 사용자 데이터와 함께 hydrating도 false로 정리한다 (stuck-true 방지)', () => {
    useUserStore.setState({ xp: 50, onboarded: true });
    useUserStore.getState().setHydrating(true);
    useUserStore.getState().reset();
    const s = useUserStore.getState();
    expect(s.hydrating).toBe(false);
    expect(s.xp).toBe(0);
    expect(s.onboarded).toBe(false);
  });

  it('persist partialize는 hydrating(및 함수)을 영속화에서 제외한다', () => {
    const partialize = useUserStore.persist.getOptions().partialize!;
    useUserStore.getState().setHydrating(true);
    // getOptions의 partialize 반환 타입이 unknown — 검증 편의를 위해 좁힌다
    const snapshot = partialize(useUserStore.getState()) as Record<string, unknown>;
    expect(snapshot).not.toHaveProperty('hydrating');
    expect(Object.keys(snapshot).sort()).toEqual([...PERSISTED_KEYS].sort());
    expect(Object.values(snapshot).some((v) => typeof v === 'function')).toBe(false);
  });
});
