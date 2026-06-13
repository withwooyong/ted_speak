import { describe, expect, it, vi } from 'vitest';

import { MAX_REPLY_CHARS } from '@ted-speak/shared';
import { AiError } from '../src/stt';
import { getTurnFeedback } from '../src/tutor';

const FEEDBACK = {
  corrections: [{ original: 'like listen', suggested: 'like listening', type: 'grammar' }],
  reply: 'That sounds fun! What music do you like?',
  encouragement: '잘 하고 있어요!',
};

const okResponse = (content: unknown) =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200 },
  );

const cfg = (fetchImpl: typeof fetch) => ({ apiKey: 'sk-test', fetchImpl });

describe('getTurnFeedback (GPT-4o 튜터)', () => {
  it('피드백 JSON(corrections/reply/encouragement)을 파싱해 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(FEEDBACK));
    const fb = await getTurnFeedback('I like listen to music', {}, cfg(fetchMock));
    expect(fb.reply).toBe(FEEDBACK.reply);
    expect(fb.corrections).toHaveLength(1);
    expect(fb.corrections[0].type).toBe('grammar');
  });

  it('json_object 응답 형식과 시나리오 컨텍스트를 요청에 포함한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(FEEDBACK));
    await getTurnFeedback(
      'hello',
      { level: 'A2', scenarioTopic: 'Ask about hobbies', history: [{ role: 'assistant', content: 'Hi!' }] },
      cfg(fetchMock),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('A2');
    expect(body.messages[0].content).toContain('Ask about hobbies');
    // history가 system과 user 발화 사이에 들어간다
    expect(body.messages[1]).toEqual({ role: 'assistant', content: 'Hi!' });
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'hello' });
  });

  it('대화 히스토리는 최근 6턴으로 잘라 보낸다 (비용 관리, PLAN §7.3)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(FEEDBACK));
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
      content: `turn-${i}`,
    }));
    await getTurnFeedback('latest', { history }, cfg(fetchMock));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const sent = body.messages.slice(1, -1); // system과 마지막 user 제외
    expect(sent).toHaveLength(6);
    expect(sent[0].content).toBe('turn-4');
  });

  it('LLM이 스키마에 안 맞는 JSON을 주면 AiError를 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ reply: 'no corrections field' }));
    await expect(getTurnFeedback('x', {}, cfg(fetchMock))).rejects.toThrowError(AiError);
  });

  it('JSON 파싱 불가 응답이면 AiError를 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'not-json' } }] }), {
        status: 200,
      }),
    );
    await expect(getTurnFeedback('x', {}, cfg(fetchMock))).rejects.toThrowError(AiError);
  });

  it('API 5xx면 status가 담긴 AiError를 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('oops', { status: 500 }));
    await expect(getTurnFeedback('x', {}, cfg(fetchMock))).rejects.toMatchObject({ status: 500 });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // reply clamp — HANDOFF 2b LOW (파싱 성공 후 reply에 clampReply 적용)
  // ─────────────────────────────────────────────────────────────────────────────

  it('LLM reply가 MAX_REPLY_CHARS를 초과하면 ≤400자로 절단되고 문장 경계로 끝난다', async () => {
    // "This is sentence number N." 반복으로 600자+ 생성
    // 각 문장은 "This is sentence number 00. " = 26자 내외
    const longReply = Array.from({ length: 25 }, (_, i) =>
      `This is sentence number ${String(i + 1).padStart(2, '0')}.`,
    ).join(' ');
    // 600자 이상 확인
    expect(longReply.length).toBeGreaterThan(MAX_REPLY_CHARS);

    const longFeedback = {
      corrections: [{ original: 'like listen', suggested: 'like listening', type: 'grammar' }],
      reply: longReply,
      encouragement: '잘 하고 있어요!',
    };
    const fetchMock = vi.fn().mockResolvedValue(okResponse(longFeedback));
    const fb = await getTurnFeedback('I like listen to music', {}, cfg(fetchMock));

    // reply가 MAX_REPLY_CHARS 이하여야 한다
    expect(fb.reply.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
    // 문장 경계(. ! ?)로 끝나야 한다
    expect(fb.reply).toMatch(/[.!?]$/);
    // corrections와 encouragement는 불변
    expect(fb.corrections).toEqual(longFeedback.corrections);
    expect(fb.encouragement).toBe(longFeedback.encouragement);
  });

  it('reply가 종결부호 없이 MAX_REPLY_CHARS를 크게 초과하면 하드 절단 후 ≤400자를 보장한다', async () => {
    // 종결부호 없는 700자 reply
    const noPunctReply = 'X'.repeat(700);
    const noPunctFeedback = {
      corrections: [],
      reply: noPunctReply,
      encouragement: 'Good job!',
    };
    const fetchMock = vi.fn().mockResolvedValue(okResponse(noPunctFeedback));
    const fb = await getTurnFeedback('hello', {}, cfg(fetchMock));

    expect(fb.reply.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
    // corrections와 encouragement는 불변
    expect(fb.corrections).toEqual([]);
    expect(fb.encouragement).toBe('Good job!');
  });
});
