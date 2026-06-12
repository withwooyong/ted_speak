#!/usr/bin/env node
/**
 * Phase 0 AI 스파이크 — turn-based 1턴 대화 E2E
 *
 *   [사용자 발화 오디오] → Whisper(STT) → GPT-4o(교정+응답) → OpenAI TTS → [재생]
 *
 * 검증 목표 (PLAN.md §6.2):
 *   - 파이프라인이 실제로 연결되는가
 *   - 턴당 지연이 2~4초 허용 범위에 들어오는가 (단계별 latency 측정)
 *   - 피드백 JSON 스키마(PLAN.md §7.2)가 안정적으로 나오는가
 *
 * 실행:
 *   OPENAI_API_KEY=sk-... node packages/ai/spike/one-turn.mjs [오디오파일]
 *   (오디오 생략 시 macOS `say`로 샘플 발화를 합성해 사용)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('❌ OPENAI_API_KEY가 필요합니다.');
  process.exit(1);
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });

const SAMPLE_UTTERANCE =
  "I'm really into hiking. I go to the mountain every weekend and I like listen to music when I walk.";

// Ted 페르소나 시스템 프롬프트 (초급 A2 가정, PLAN.md §7.1 원칙)
const SYSTEM_PROMPT = `You are Ted, a friendly AI English tutor for Korean beginner learners (CEFR A2).
The user just spoke. Reply ONLY with JSON matching this schema:
{
  "corrections": [{ "original": string, "suggested": string, "type": "grammar"|"vocab"|"pronunciation" }],
  "reply": string,        // your next conversational turn: short (max 2 sentences), warm, A2-level vocabulary, end with a simple follow-up question
  "encouragement": string // one short encouraging sentence in Korean
}
Rules: do not interrupt the conversation flow — corrections go in the corrections array, your reply stays natural. If nothing to correct, corrections is [].`;

const t0 = Date.now();
const lap = (() => { let prev = t0; return () => { const now = Date.now(), d = now - prev; prev = now; return d; }; })();

// ── 0. 입력 오디오 준비 ────────────────────────────────────────────
let audioPath = process.argv[2];
if (!audioPath) {
  audioPath = join(OUT, 'user-utterance.wav');
  console.log(`🎤 [입력] macOS say로 샘플 발화 합성 (마이크 시뮬레이션)`);
  console.log(`   "${SAMPLE_UTTERANCE}"`);
  execFileSync('say', ['-v', 'Daniel', '-o', audioPath, '--data-format=LEI16@22050', SAMPLE_UTTERANCE]);
  lap();
}
if (!existsSync(audioPath)) {
  console.error(`❌ 오디오 파일 없음: ${audioPath}`);
  process.exit(1);
}

// ── 1. STT: Whisper ───────────────────────────────────────────────
const form = new FormData();
form.append('file', new Blob([readFileSync(audioPath)], { type: 'audio/wav' }), 'utterance.wav');
form.append('model', 'whisper-1');
form.append('language', 'en');

const sttRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${API_KEY}` },
  body: form,
});
if (!sttRes.ok) throw new Error(`Whisper ${sttRes.status}: ${await sttRes.text()}`);
const { text: transcript } = await sttRes.json();
const sttMs = lap();
console.log(`\n🧏 [1/3 STT · Whisper] ${sttMs}ms`);
console.log(`   transcript: "${transcript}"`);

// ── 2. LLM: GPT-4o 교정 + 다음 발화 ──────────────────────────────
const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: transcript },
    ],
  }),
});
if (!llmRes.ok) throw new Error(`GPT ${llmRes.status}: ${await llmRes.text()}`);
const llmJson = await llmRes.json();
const feedback = JSON.parse(llmJson.choices[0].message.content);
const llmMs = lap();
console.log(`\n🧠 [2/3 LLM · GPT-4o] ${llmMs}ms`);
console.log(`   corrections : ${JSON.stringify(feedback.corrections)}`);
console.log(`   reply       : "${feedback.reply}"`);
console.log(`   encourage   : "${feedback.encouragement}"`);

// ── 3. TTS: OpenAI TTS ───────────────────────────────────────────
const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
  method: 'POST',
  headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'tts-1', voice: 'alloy', input: feedback.reply }),
});
if (!ttsRes.ok) throw new Error(`TTS ${ttsRes.status}: ${await ttsRes.text()}`);
const replyPath = join(OUT, 'ted-reply.mp3');
writeFileSync(replyPath, Buffer.from(await ttsRes.arrayBuffer()));
const ttsMs = lap();
console.log(`\n🔊 [3/3 TTS · tts-1] ${ttsMs}ms → ${replyPath}`);

// ── 결과 요약 ─────────────────────────────────────────────────────
const apiTotal = sttMs + llmMs + ttsMs;
console.log(`\n${'─'.repeat(52)}`);
console.log(`⏱  턴 지연 (API 합계): ${(apiTotal / 1000).toFixed(2)}s  ${apiTotal <= 4000 ? '✅ 허용 범위(≤4s)' : '⚠️ 4s 초과 — 최적화 필요'}`);
console.log(`    STT ${sttMs}ms · LLM ${llmMs}ms · TTS ${ttsMs}ms`);
writeFileSync(join(OUT, 'result.json'), JSON.stringify({ transcript, feedback, latency: { sttMs, llmMs, ttsMs, apiTotal } }, null, 2));

// 재생 (macOS)
try { execFileSync('afplay', [replyPath]); } catch { /* CI 등 무음 환경 */ }
console.log('\n✅ 1턴 E2E 완료 — out/result.json 저장');
