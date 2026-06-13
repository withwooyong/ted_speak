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

// ── 롤플레이 시나리오 (P2 W3) ────────────────────────────────────────────────
// 프리토킹(코드 상수 TUTOR_TOPICS)과 달리 역할·목표·성공 기준이 있는 콘텐츠라
// content/roleplay/*.json + zod 단일 출처로 관리한다(시드 레슨과 동형).

/** 학습자가 대화 중 달성할 목표 1개 — 종료 시 체크리스트로 노출 */
export const RoleplayObjectiveSchema = z.object({
  id: z.string().min(1),
  /** 사용자 노출 라벨(한글) */
  label: z.string().min(1),
  /** 영문 라벨 */
  labelEn: z.string().min(1),
});

export const RoleplayScenarioSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    titleEn: z.string().min(1),
    level: z.enum(CEFR_LEVELS),
    order: z.number().int().positive(),
    /** 상황 설명(한글, 사용자 노출) */
    setting: z.string().min(1),
    /** 학습자 배역(한글) */
    learnerRole: z.string().min(1),
    /** Ted 배역(한글, 세션 헤더 노출) */
    tedRole: z.string().min(1),
    /** 모델 system 프롬프트에 주입할 Ted 배역·톤(영문) */
    tedPersona: z.string().min(1),
    /** Ted 첫 발화(영문) — 세션 시작 시 노출/주입 */
    openingLine: z.string().min(1),
    /** 달성 목표 2~4개 */
    objectives: z.array(RoleplayObjectiveSchema).min(2).max(4),
  })
  // objective id는 시나리오 안에서 고유해야 한다(목표 추적이 id로 머지됨)
  .refine((s) => new Set(s.objectives.map((o) => o.id)).size === s.objectives.length, {
    message: 'objective ids must be unique within a scenario',
    path: ['objectives'],
  });

export const RoleplayCollectionSchema = z
  .object({
    scenarios: z.array(RoleplayScenarioSchema).min(1),
  })
  // 시나리오 id는 컬렉션 안에서 고유해야 한다(findScenario·세션 topic 저장 키)
  .refine((c) => new Set(c.scenarios.map((s) => s.id)).size === c.scenarios.length, {
    message: 'scenario ids must be unique',
    path: ['scenarios'],
  });

export type RoleplayObjective = z.infer<typeof RoleplayObjectiveSchema>;
export type RoleplayScenario = z.infer<typeof RoleplayScenarioSchema>;
export type RoleplayCollection = z.infer<typeof RoleplayCollectionSchema>;
