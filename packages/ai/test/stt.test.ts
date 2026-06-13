import { describe, expect, it, vi } from 'vitest';

import { AiError, transcribe, transcribeDetailed } from '../src/stt';

const cfg = (fetchImpl: typeof fetch) => ({ apiKey: 'sk-test', fetchImpl });

const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF"

describe('transcribe (Whisper STT)', () => {
  it('성공 시 전사 텍스트를 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'I like listening to music.' }), { status: 200 }),
    );
    const text = await transcribe({ data: wavBytes, mimeType: 'audio/wav' }, cfg(fetchMock));
    expect(text).toBe('I like listening to music.');
  });

  it('multipart form으로 whisper-1 모델과 en 언어를 전송한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'ok' }), { status: 200 }),
    );
    await transcribe({ data: wavBytes, mimeType: 'audio/wav' }, cfg(fetchMock));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/v1/audio/transcriptions');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('language')).toBe('en');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('API가 4xx를 반환하면 status가 담긴 AiError를 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    await expect(transcribe({ data: wavBytes }, cfg(fetchMock))).rejects.toThrowError(AiError);
    await expect(transcribe({ data: wavBytes }, cfg(fetchMock))).rejects.toMatchObject({
      status: 429,
    });
  });

  it('네트워크 오류는 그대로 전파한다', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(transcribe({ data: wavBytes }, cfg(fetchMock))).rejects.toThrow(
      'Network request failed',
    );
  });

  it('ArrayBuffer·Blob 입력도 받는다 (RN/웹 플랫폼별 오디오 타입)', async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ text: 'ok' }), { status: 200 }),
    );
    await expect(transcribe({ data: wavBytes.buffer as ArrayBuffer }, cfg(fetchMock))).resolves.toBe('ok');
    await expect(
      transcribe({ data: new Blob([wavBytes], { type: 'audio/m4a' }) }, cfg(fetchMock)),
    ).resolves.toBe('ok');
  });

  it('baseUrl을 오버라이드할 수 있다 (프록시 전환 대비)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'ok' }), { status: 200 }),
    );
    await transcribe({ data: wavBytes }, { apiKey: 'sk-test', baseUrl: 'https://proxy.example.com', fetchImpl: fetchMock });
    expect(fetchMock.mock.calls[0][0]).toBe('https://proxy.example.com/v1/audio/transcriptions');
  });

  it('STT 응답에 text가 없으면 AiError를 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await expect(transcribe({ data: wavBytes }, cfg(fetchMock))).rejects.toThrowError(AiError);
  });
});

describe('transcribeDetailed (verbose_json — text + avg_logprob, W4 발음)', () => {
  const verbose = (text: string, segs: { avg_logprob: number }[] | undefined) =>
    new Response(JSON.stringify({ text, segments: segs }), { status: 200 });

  it('segments의 avg_logprob 평균과 text를 함께 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      verbose('I really think.', [{ avg_logprob: -0.4 }, { avg_logprob: -0.6 }]),
    );
    const r = await transcribeDetailed({ data: wavBytes, mimeType: 'audio/wav' }, cfg(fetchMock));
    expect(r.text).toBe('I really think.');
    expect(r.avgLogprob).toBeCloseTo(-0.5, 5);
  });

  it('단일 segment면 그 값이 그대로 평균', async () => {
    const fetchMock = vi.fn().mockResolvedValue(verbose('ok', [{ avg_logprob: -0.42 }]));
    const r = await transcribeDetailed({ data: wavBytes }, cfg(fetchMock));
    expect(r.avgLogprob).toBeCloseTo(-0.42, 5);
  });

  it('segments가 없거나 비면 avgLogprob는 null (text는 유지)', async () => {
    const noSegs = vi.fn().mockResolvedValue(verbose('ok', undefined));
    await expect(transcribeDetailed({ data: wavBytes }, cfg(noSegs))).resolves.toEqual({
      text: 'ok',
      avgLogprob: null,
    });
    const emptySegs = vi.fn().mockResolvedValue(verbose('ok', []));
    await expect(transcribeDetailed({ data: wavBytes }, cfg(emptySegs))).resolves.toEqual({
      text: 'ok',
      avgLogprob: null,
    });
  });

  it('verbose_json + segment granularity를 요청한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(verbose('ok', [{ avg_logprob: -0.4 }]));
    await transcribeDetailed({ data: wavBytes }, cfg(fetchMock));
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('language')).toBe('en');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.getAll('timestamp_granularities[]')).toContain('segment');
  });

  it('4xx면 AiError, text 없으면 AiError', async () => {
    const err = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(transcribeDetailed({ data: wavBytes }, cfg(err))).rejects.toThrowError(AiError);
    const noText = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ segments: [] }), { status: 200 }),
    );
    await expect(transcribeDetailed({ data: wavBytes }, cfg(noText))).rejects.toThrowError(AiError);
  });
});
