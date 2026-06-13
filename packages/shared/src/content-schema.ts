import { z } from 'zod';

/**
 * content/*.json 계약 (T5) — 콘텐츠 도메인 타입의 단일 출처.
 * Course/Lesson 등의 TS 타입은 모두 여기서 z.infer로 파생된다.
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;

// 사용자 도메인(profiles.goal) 상수지만 여기(런타임 파일)에 둔다 —
// types.ts는 타입 전용(vitest coverage exclude 전제)이라 런타임 값을 둘 수 없다.
// init.sql profiles.goal CHECK과 동시 수정 필수.
export const LEARNING_GOALS = ['daily', 'business', 'travel'] as const;

export const KeyPhraseSchema = z.object({
  en: z.string().min(1),
  ko: z.string().min(1),
});

export const DrillSchema = z.object({
  text: z.string().min(1),
  ko: z.string().min(1),
  keyWords: z.array(z.string().min(1)).min(1),
});

export const ConversationScenarioSchema = z.object({
  topic: z.string().min(1),
  openingLine: z.string().min(1),
  // PLAN §4.2 — 실전 대화는 3~5턴
  targetTurns: z.number().int().min(3).max(5),
  hints: z.array(z.string()).optional(),
});

export const LessonSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().positive(),
  title: z.string().min(1),
  titleEn: z.string().min(1),
  estimatedMinutes: z.number().positive(),
  // 레슨당 핵심 표현 3~5개 (PLAN §4.2) — 시드 제작 가드
  keyPhrases: z.array(KeyPhraseSchema).min(1).max(5),
  drills: z.array(DrillSchema).min(1),
  conversation: ConversationScenarioSchema,
});

export const CourseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  level: z.enum(CEFR_LEVELS),
  order: z.number().int().positive(),
  description: z.string().min(1),
  lessons: z.array(LessonSchema).min(1),
});

export type KeyPhrase = z.infer<typeof KeyPhraseSchema>;
export type Drill = z.infer<typeof DrillSchema>;
export type ConversationScenario = z.infer<typeof ConversationScenarioSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type Course = z.infer<typeof CourseSchema>;
