/**
 * PLAN.md §8 데이터 모델 — 사용자·세션 도메인 타입.
 * 콘텐츠(Course/Lesson 등)는 content-schema.ts, 턴 피드백은 feedback-schema.ts에서 파생.
 */
import type { CEFR_LEVELS } from './content-schema';

export type CEFRLevel = (typeof CEFR_LEVELS)[number];
export type LearningGoal = 'daily' | 'business' | 'travel';

export type LessonStep = 1 | 2 | 3;
export type SessionStatus = 'in_progress' | 'completed';

export interface LessonSession {
  id: string;
  userId: string;
  lessonId: string;
  currentStep: LessonStep;
  status: SessionStatus;
  startedAt: string;
  completedAt?: string;
  feedbackSummary?: { strengths: string[]; improvements: string[] };
}
