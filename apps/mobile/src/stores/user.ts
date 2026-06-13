import type { CEFRLevel, LearningGoal } from '@ted-speak/shared';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { applyLessonReward } from './user-core';

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
      completeOnboarding: (p) => set({ ...p, onboarded: true }),
      setMicGranted: (granted) => set({ micGranted: granted }),
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
      reset: () => set({ ...INITIAL_USER_STATE }),
    }),
    {
      name: 'talkted-user',
      storage: createJSONStorage(() => storage),
    },
  ),
);
