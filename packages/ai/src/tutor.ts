import { clampReply, TurnFeedbackSchema, type TurnFeedback } from '@ted-speak/shared';

import { type AiClientConfig, resolveConfig } from './config';
import { AiError, throwIfNotOk } from './error';
import { buildTutorSystemPrompt, type TutorPromptContext } from './prompts';
import { reliableFetch, type RequestOptions } from './reliability';

/** 비용 관리: 대화 히스토리 슬라이딩 윈도우 (PLAN §7.3) */
const HISTORY_WINDOW = 6;
/** 응답 길이 cap — T2 지연·비용 관리 */
const MAX_TOKENS = 220;

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface TutorOptions extends TutorPromptContext {
  history?: ChatTurn[];
  model?: string;
}

/** 사용자 전사 → 교정 + Ted의 다음 발화 (GPT, JSON 모드) */
export async function getTurnFeedback(
  transcript: string,
  opts: TutorOptions,
  cfg: AiClientConfig,
  reqOpts: RequestOptions = {},
): Promise<TurnFeedback> {
  const { apiKey, baseUrl, fetchImpl } = resolveConfig(cfg);
  const history = (opts.history ?? []).slice(-HISTORY_WINDOW);

  const res = await reliableFetch(
    fetchImpl,
    `${baseUrl}/v1/chat/completions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model ?? 'gpt-4o',
        response_format: { type: 'json_object' },
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: buildTutorSystemPrompt(opts) },
          ...history,
          { role: 'user', content: transcript },
        ],
      }),
    },
    reqOpts,
  );
  await throwIfNotOk(res, 'LLM');

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new AiError('LLM 응답에 content 없음');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiError('LLM 응답이 JSON이 아님', undefined, content.slice(0, 200));
  }

  const result = TurnFeedbackSchema.safeParse(parsed);
  if (!result.success) {
    throw new AiError('LLM 응답이 TurnFeedback 스키마 위반', undefined, content.slice(0, 200));
  }
  // reply 길이 캡 — LLM이 max_tokens를 넘겨도 턴 전체를 실패시키지 않고 문장 경계 절단으로 회복 (2b LOW)
  return { ...result.data, reply: clampReply(result.data.reply) };
}
