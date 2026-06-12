import { z } from 'zod';

/**
 * 턴 피드백 계약 (PLAN §7.2) — LLM 응답의 단일 출처.
 * packages/ai의 런타임 검증과 앱의 타입이 모두 여기서 파생된다.
 */
export const CorrectionSchema = z.object({
  original: z.string(),
  suggested: z.string(),
  type: z.enum(['grammar', 'vocab', 'pronunciation']),
});

export const TurnFeedbackSchema = z.object({
  corrections: z.array(CorrectionSchema),
  reply: z.string().min(1),
  encouragement: z.string(),
});

export type Correction = z.infer<typeof CorrectionSchema>;
export type TurnFeedback = z.infer<typeof TurnFeedbackSchema>;
