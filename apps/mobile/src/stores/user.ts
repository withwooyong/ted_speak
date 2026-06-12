import type { CEFRLevel, LearningGoal } from '@ted-speak/shared';
import { create } from 'zustand';

interface UserState {
  onboarded: boolean;
  goal: LearningGoal | null;
  level: CEFRLevel | null;
  dailyGoalMinutes: number | null;
  micGranted: boolean;
  streak: number;
  xp: number;
  todaySpeakingSeconds: number;
  completeOnboarding: (p: {
    goal: LearningGoal;
    level: CEFRLevel;
    dailyGoalMinutes: number;
    micGranted: boolean;
  }) => void;
}

export const useUserStore = create<UserState>((set) => ({
  onboarded: false,
  goal: null,
  level: null,
  dailyGoalMinutes: null,
  micGranted: false,
  streak: 0,
  xp: 0,
  todaySpeakingSeconds: 0,
  completeOnboarding: (p) => set({ ...p, onboarded: true }),
}));
