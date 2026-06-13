import type { CEFRLevel, LearningGoal } from '@ted-speak/shared';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { applyLessonReward, type HydrationPatch } from './user-core';

// 영속 저장소: 네이티브는 AsyncStorage, 웹(SSR 포함)은 메모리 폴백.
// AsyncStorage 웹 구현이 정적 export에서 window를 참조해 깨지는 문제 회피 — lib/supabase.ts와 동일 패턴.
const memoryStore = new Map<string, string>();
const storage: StateStorage =
  Platform.OS === 'web'
    ? {
        getItem: (k) => memoryStore.get(k) ?? null,
        setItem: (k, v) => void memoryStore.set(k, v),
        removeItem: (k) => void memoryStore.delete(k),
      }
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('@react-native-async-storage/async-storage')
        .default as typeof import('@react-native-async-storage/async-storage').default);

interface UserState {
  onboarded: boolean;
  goal: LearningGoal | null;
  level: CEFRLevel | null;
  dailyGoalMinutes: number | null;
  micGranted: boolean;
  streak: number;
  xp: number;
  todaySpeakingSeconds: number;
  /** 마지막 학습 날짜 (YYYY-MM-DD, 로컬) — streak 판정용 */
  lastStudyDate: string | null;
  /**
   * 서버 하이드레이트 진행 중 플래그 — 실로그인 시 profiles 재조회가 끝날 때까지 true.
   * 영속화 제외(아래 partialize): true가 저장되면 재시작 시 영구 로딩에 갇힌다.
   */
  hydrating: boolean;
  completeOnboarding: (p: {
    goal: LearningGoal;
    level: CEFRLevel;
    dailyGoalMinutes: number;
    micGranted: boolean;
  }) => void;
  setMicGranted: (granted: boolean) => void;
  /**
   * 레슨 완료 보상 적용 (낙관적 UI 갱신).
   * 권위 있는 통계는 서버 트리거(handle_progress_recorded) 소관 — user-core 주석 참조.
   */
  applyReward: (p: { xp: number; speakingSeconds: number }) => void;
  /** 서버 하이드레이트 진행 상태 토글 (lib/profile-sync.ts에서 사용) */
  setHydrating: (b: boolean) => void;
  /**
   * 서버 profiles → 로컬 스토어 반영 (재로그인 동기화).
   * patch 필드만 덮어쓴다 — xp·todaySpeakingSeconds·micGranted는 서버 권위 밖이라 불변.
   */
  hydrateFromServer: (patch: HydrationPatch) => void;
  /** 로그아웃 시 사용자 데이터 초기화 (공유 단말 PII 잔존 방지) */
  reset: () => void;
}

const INITIAL_USER_STATE = {
  onboarded: false,
  goal: null,
  level: null,
  dailyGoalMinutes: null,
  micGranted: false,
  streak: 0,
  xp: 0,
  todaySpeakingSeconds: 0,
  lastStudyDate: null,
} as const;

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      ...INITIAL_USER_STATE,
      hydrating: false,
      completeOnboarding: (p) => set({ ...p, onboarded: true }),
      setMicGranted: (granted) => set({ micGranted: granted }),
      setHydrating: (b) => set({ hydrating: b }),
      // patch 필드만 반영 — xp·todaySpeakingSeconds·micGranted는 의도적으로 건드리지 않는다.
      hydrateFromServer: (patch) => set({ ...patch }),
      applyReward: (p) =>
        set((s) =>
          applyLessonReward(
            {
              xp: s.xp,
              streak: s.streak,
              todaySpeakingSeconds: s.todaySpeakingSeconds,
              lastStudyDate: s.lastStudyDate,
            },
            { ...p, today: new Date().toISOString().slice(0, 10) },
          ),
        ),
      // hydrating도 함께 끈다 — 로그아웃 시점에 in-flight 하이드레이트가 있었으면
      // profile-sync의 스테일 가드가 setHydrating(false)를 건너뛰므로 여기서 정리해야 stuck-true가 없다.
      reset: () => set({ ...INITIAL_USER_STATE, hydrating: false }),
    }),
    {
      name: 'talkted-user',
      storage: createJSONStorage(() => storage),
      // 영속화 대상은 INITIAL_USER_STATE 키만 — hydrating(및 액션 함수)은 제외한다.
      // hydrating=true가 저장되면 재시작 시 영구 로딩에 갇힌다(index.tsx가 리다이렉트를 막음).
      partialize: (s) =>
        Object.fromEntries(
          Object.keys(INITIAL_USER_STATE).map((k) => [k, s[k as keyof UserState]]),
        ) as Pick<UserState, keyof typeof INITIAL_USER_STATE>,
    },
  ),
);
