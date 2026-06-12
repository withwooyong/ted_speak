#!/usr/bin/env node --experimental-strip-types
/**
 * Phase 0 AI 스파이크 v2 — packages/ai 모듈 기반 1턴 E2E + T2 지연 최적화 측정
 *
 *   [사용자 발화] → transcribe → getTurnFeedback → synthesizeStream → [첫 청크 재생 시작]
 *
 * 체감 지연 = STT + LLM + TTS TTFB (첫 오디오 청크 도달까지) — 목표 ≤4s
 *
 * 실행:
 *   OPENAI_API_KEY=sk-... npm run spike -w @ted-speak/ai [-- 오디오파일]
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getTurnFeedback } from '../src/tutor.ts';
import { transcribe } from '../src/stt.ts';
import { synthesizeStream } from '../src/tts.ts';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('❌ OPENAI_API_KEY가 필요합니다.');
  process.exit(1);
}
const cfg = { apiKey };

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });

const SAMPLE_UTTERANCE =
  "I'm really into hiking. I go to the mountain every weekend and I like listen to music when I walk.";

// ── 0. 입력 오디오 ─────────────────────────────────────────────
let audioPath = process.argv[2];
if (!audioPath) {
  audioPath = join(OUT, 'user-utterance.wav');
  console.log('🎤 [입력] macOS say로 샘플 발화 합성');
  console.log(`   "${SAMPLE_UTTERANCE}"`);
  execFileSync('say', ['-v', 'Daniel', '-o', audioPath, '--data-format=LEI16@22050', SAMPLE_UTTERANCE]);
}
if (!existsSync(audioPath)) {
  console.error(`❌ 오디오 파일 없음: ${audioPath}`);
  process.exit(1);
}

const t0 = Date.now();

// ── 1. STT ────────────────────────────────────────────────────
const transcript = await transcribe(
  { data: readFileSync(audioPath), mimeType: 'audio/wav' },
  cfg,
);
const sttDone = Date.now();
console.log(`\n🧏 [1/3 STT] ${sttDone - t0}ms — "${transcript}"`);

// ── 2. LLM ────────────────────────────────────────────────────
const feedback = await getTurnFeedback(
  transcript,
  { level: 'A2', scenarioTopic: 'Ask about hobbies and free time.' },
  cfg,
);
const llmDone = Date.now();
console.log(`\n🧠 [2/3 LLM] ${llmDone - sttDone}ms`);
console.log(`   corrections : ${JSON.stringify(feedback.corrections)}`);
console.log(`   reply       : "${feedback.reply}"`);
console.log(`   encourage   : "${feedback.encouragement}"`);

// ── 3. TTS 스트리밍 — TTFB가 체감 지연의 끝 ───────────────────
const replyPath = join(OUT, 'ted-reply.mp3');
const file = createWriteStream(replyPath);
let ttfbAt = 0;
await synthesizeStream(feedback.reply, cfg, {
  onFirstByte: () => {
    ttfbAt = Date.now();
  },
  onChunk: (c) => file.write(c),
});
await new Promise<void>((resolve, reject) => {
  file.end();
  file.on('finish', resolve);
  file.on('error', reject);
});
const ttsDone = Date.now();

const perceived = ttfbAt - t0; // 재생 시작 가능 시점
const total = ttsDone - t0;
console.log(`\n🔊 [3/3 TTS] TTFB ${ttfbAt - llmDone}ms · 전체 ${ttsDone - llmDone}ms → ${replyPath}`);
console.log(`\n${'─'.repeat(56)}`);
console.log(
  `⏱  체감 지연 (재생 시작까지): ${(perceived / 1000).toFixed(2)}s  ${perceived <= 4000 ? '✅ 목표(≤4s) 달성' : '⚠️ 4s 초과'}`,
);
console.log(`    전체 완료: ${(total / 1000).toFixed(2)}s`);

writeFileSync(
  join(OUT, 'result.json'),
  JSON.stringify(
    {
      transcript,
      feedback,
      latency: {
        sttMs: sttDone - t0,
        llmMs: llmDone - sttDone,
        ttsTtfbMs: ttfbAt - llmDone,
        perceivedMs: perceived,
        totalMs: total,
      },
    },
    null,
    2,
  ),
);

try {
  execFileSync('afplay', [replyPath]);
} catch {
  /* 무음 환경 */
}
console.log('\n✅ 1턴 E2E 완료 — out/result.json 저장');
