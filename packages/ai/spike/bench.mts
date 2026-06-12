#!/usr/bin/env node
/**
 * T2 벤치마크 — 모델 조합별 턴 체감 지연 비교 (ADR-0003 근거 데이터)
 *
 * 조합 A (현행): whisper-1 + gpt-4o + tts-1
 * 조합 B (저지연): gpt-4o-mini-transcribe + gpt-4o-mini + tts-1
 *
 * 실행: OPENAI_API_KEY=... npx tsx packages/ai/spike/bench.mts <오디오파일> [반복수]
 */
import { readFileSync } from 'node:fs';

import { transcribe } from '../src/stt.ts';
import { getTurnFeedback } from '../src/tutor.ts';
import { synthesizeStream } from '../src/tts.ts';

const apiKey = process.env.OPENAI_API_KEY;
const audioPath = process.argv[2];
const runs = Number(process.argv[3] ?? 3);
if (!apiKey || !audioPath) {
  console.error('사용법: OPENAI_API_KEY=... tsx bench.mts <오디오파일> [반복수]');
  process.exit(1);
}
const cfg = { apiKey };
const audio = readFileSync(audioPath);

interface Combo {
  name: string;
  sttModel: string;
  llmModel: string;
}
const COMBOS: Combo[] = [
  { name: 'A 현행 (whisper-1 + gpt-4o)', sttModel: 'whisper-1', llmModel: 'gpt-4o' },
  { name: 'B 저지연 (mini-transcribe + 4o-mini)', sttModel: 'gpt-4o-mini-transcribe', llmModel: 'gpt-4o-mini' },
];

async function oneTurn(c: Combo) {
  const t0 = Date.now();
  const transcript = await transcribe({ data: audio, mimeType: 'audio/wav' }, cfg, { model: c.sttModel });
  const t1 = Date.now();
  const fb = await getTurnFeedback(
    transcript,
    { level: 'A2', scenarioTopic: 'Ask about hobbies.', model: c.llmModel },
    cfg,
  );
  const t2 = Date.now();
  let ttfbAt: number | null = null;
  await synthesizeStream(fb.reply, cfg, { onFirstByte: () => (ttfbAt = Date.now()) });
  if (ttfbAt === null) throw new Error('TTS 응답에 오디오 청크 없음 — 측정 무효');
  return { stt: t1 - t0, llm: t2 - t1, ttfb: ttfbAt - t2, perceived: ttfbAt - t0, transcript, corrections: fb.corrections.length };
}

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function oneTurnWithRetry(c: Combo, retries = 2): Promise<Awaited<ReturnType<typeof oneTurn>>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await oneTurn(c);
    } catch (e) {
      if (attempt >= retries) throw e;
      console.log(`  (재시도 ${attempt + 1} — ${(e as Error).message})`);
      await sleep(1500);
    }
  }
}

for (const combo of COMBOS) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    results.push(await oneTurnWithRetry(combo));
    await sleep(800);
  }
  const m = {
    stt: median(results.map((r) => r.stt)),
    llm: median(results.map((r) => r.llm)),
    ttfb: median(results.map((r) => r.ttfb)),
    perceived: median(results.map((r) => r.perceived)),
  };
  console.log(`\n■ ${combo.name} — ${runs}회 중앙값`);
  console.log(`  STT ${m.stt}ms · LLM ${m.llm}ms · TTS TTFB ${m.ttfb}ms`);
  console.log(`  체감 ${(m.perceived / 1000).toFixed(2)}s ${m.perceived <= 4000 ? '✅' : '⚠️'}  (개별: ${results.map((r) => (r.perceived / 1000).toFixed(2)).join(' / ')}s)`);
  console.log(`  전사: "${results[0].transcript}" · 교정 ${results[0].corrections}건`);
}
