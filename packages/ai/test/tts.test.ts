import { describe, expect, it, vi } from 'vitest';

import { AiError } from '../src/stt';
import { synthesize, synthesizeStream } from '../src/tts';

const cfg = (fetchImpl: typeof fetch) => ({ apiKey: 'sk-test', fetchImpl });

describe('synthesize (OpenAI TTS)', () => {
  it('성공 시 오디오 ArrayBuffer를 반환한다', async () => {
    const audio = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(audio, { status: 200 }));
    const buf = await synthesize('Hello!', cfg(fetchMock));
    expect(new Uint8Array(buf)).toEqual(audio);
  });

  it('tts-1 모델과 입력 텍스트를 전송한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array(1), { status: 200 }));
    await synthesize('Hello!', cfg(fetchMock));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('tts-1');
    expect(body.input).toBe('Hello!');
  });

  it('API 오류 시 AiError를 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }));
    await expect(synthesize('x', cfg(fetchMock))).rejects.toThrowError(AiError);
  });
});

describe('synthesizeStream (T2 지연 최적화 — 첫 바이트 즉시 재생)', () => {
  it('응답 body 스트림과 TTFB 콜백을 제공한다', async () => {
    const audio = new Uint8Array([9, 9, 9]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(audio, { status: 200 }));
    const onFirstByte = vi.fn();

    const chunks: Uint8Array[] = [];
    await synthesizeStream('Hello!', cfg(fetchMock), {
      onFirstByte,
      onChunk: (c) => chunks.push(c),
    });

    expect(onFirstByte).toHaveBeenCalledTimes(1);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(audio));
  });

  it('스트림 시작 전 오류(4xx)는 AiError로 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad', { status: 401 }));
    await expect(synthesizeStream('x', cfg(fetchMock), {})).rejects.toMatchObject({ status: 401 });
  });

  it('핸들러를 생략해도 스트림을 끝까지 소비한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2]), { status: 200 }));
    await expect(synthesizeStream('x', cfg(fetchMock), {})).resolves.toBeUndefined();
  });

  it('body가 없는 응답이면 AiError를 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(synthesizeStream('x', cfg(fetchMock), {})).rejects.toThrowError(AiError);
  });
});
