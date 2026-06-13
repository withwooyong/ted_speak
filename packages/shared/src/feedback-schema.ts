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

/**
 * reply 길이 상한 (HANDOFF 2b LOW) — TTS 비용·재생 시간 상한.
 * max_tokens(220)는 LLM 협조에 의존하므로, 비정상적으로 긴 reply에 대한 클라이언트 측 하드 캡이 필요하다.
 */
export const MAX_REPLY_CHARS = 400;

/**
 * reply를 MAX_REPLY_CHARS 이내로 절단한다 (회복형 — 스키마 .max() 하드 실패 대신).
 *
 * 캡 이내면 원문 그대로(trim도 하지 않음). 초과 시 앞 MAX_REPLY_CHARS 글자 내
 * 마지막 종결부호(. ! ?)에서 절단하고, 종결부호가 없으면 캡에서 하드 절단한다.
 * 절단된 경우에만 끝 공백을 정리한다.
 */
export function clampReply(reply: string): string {
  if (reply.length <= MAX_REPLY_CHARS) return reply;

  const head = reply.slice(0, MAX_REPLY_CHARS);
  // 앞 캡 범위 내 마지막 종결부호 위치 — 그 다음 글자까지 포함해 절단(종결부호 포함)
  const lastBoundary = Math.max(head.lastIndexOf('.'), head.lastIndexOf('!'), head.lastIndexOf('?'));
  const cut = lastBoundary >= 0 ? head.slice(0, lastBoundary + 1) : head;
  return cut.trimEnd();
}
