import { describe, expect, it, vi } from 'vitest';

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
});
