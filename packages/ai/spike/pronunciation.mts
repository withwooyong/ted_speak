#!/usr/bin/env node --experimental-strip-types
/**
 * Phase 2 W4 발음 스파이크 — Whisper 근사로 "발음 점수"를 어디까지 낼 수 있나 실측
 *
 * 핵심 질문: 호스팅 Whisper API는 단어별 confidence를 주지 않는다(verbose_json은 segment
 * 단위 avg_logprob만, word 객체는 타임스탬프만). 그래서 Whisper 근사는
 *   ① 기준문↔전사 정렬(단어가 제대로 전사됐나)
 *   ② segment avg_logprob (전체 발화 신뢰도)
 *   ③ 정렬 실패 단어 → 약점 음소 휴리스틱(한국 학습자 L1 간섭)
 * 에 의존한다. 이게 원어민 vs 한국식 억양을 실제로 구분하는지 정량 측정한다.
 *
 * 입력 근사: macOS `say`로 같은 문장을 네이티브(en_US/GB) vs 한국어 보이스(ko_KR)로
 * 합성 → 한국어 보이스의 영어 낭독을 "한국 학습자 억양" 프록시로 사용.
 *
 * 실행: OPENAI_API_KEY=sk-... npm run spike:pron -w @ted-speak/ai
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('❌ OPENAI_API_KEY가 필요합니다.');
  process.exit(1);
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });

// 한국 학습자 난점 음소가 풍부한 기준 문장 (r/l, th, v/f, 어말 자음)
const REFERENCE = 'I really think the third river is very far from here.';

// 단어 → 도전 음소 태그 (L1 간섭 휴리스틱). 정렬 실패 시 약점 음소로 보고.
const PHONEME_TAGS: Record<string, string[]> = {
  really: ['r', 'l'],
  think: ['θ (th)'],
  third: ['θ (th)', 'r'],
  river: ['r', 'v'],
  very: ['v', 'r'],
  far: ['f', 'r'],
};

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}
interface WhisperSegment {
  text: string;
  avg_logprob: number;
  no_speech_prob: number;
  compression_ratio: number;
}
interface VerboseJson {
  text: string;
  segments?: WhisperSegment[];
  words?: WhisperWord[];
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9']+/g, '');
const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** 0~1 문자 유사도 (Levenshtein 기반). 전사된 단어가 기준 단어와 얼마나 닮았나. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return 1 - dp[b.length] / Math.max(a.length, b.length);
}

/** 기준 단어 각각에 대해 전사 토큰 중 가장 닮은 것을 찾아 매칭 점수 산출. */
function alignWords(refWords: string[], hypWords: string[]): { word: string; score: number }[] {
  return refWords.map((rw) => {
    const best = hypWords.reduce((m, hw) => Math.max(m, similarity(rw, hw)), 0);
    return { word: rw, score: Math.round(best * 100) };
  });
}

async function transcribeVerbose(audioPath: string): Promise<VerboseJson> {
  const buf = readFileSync(audioPath);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buf)], { type: 'audio/wav' }), 'u.wav');
  form.append('model', 'whisper-1');
  form.append('language', 'en');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.append('timestamp_granularities[]', 'word');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`STT ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as VerboseJson;
}

interface Result {
  label: string;
  voice: string;
  audioPath: string;
  transcript: string;
  avgLogprob: number;
  meanWordScore: number;
  weakPhonemes: string[];
  perWord: { word: string; score: number }[];
}

// 음소 치환 오류를 native 보이스에 주입하기 위한 철자 변형(한국 학습자 전형 오류).
// 같은 native 보이스로 합성하되 텍스트를 망가뜨려 "실제 잘못된 발음" 오디오를 만든다.
// 채점은 항상 올바른 REFERENCE 기준 — 정렬이 오류를 잡아내는지 검증.
const MISPRONOUNCED = 'I leally sink da sird ribber is bery par from here.';

async function run(
  label: string,
  voice: string,
  text: string = REFERENCE,
): Promise<Result | null> {
  const tag = text === REFERENCE ? voice : `${voice}-mispron`;
  const path = join(OUT, `pron-${tag}.wav`);
  try {
    execFileSync('say', ['-v', voice, '-o', path, '--data-format=LEI16@22050', text]);
  } catch {
    console.error(`⚠️  보이스 '${voice}' 합성 실패 — 건너뜀`);
    return null;
  }
  if (!existsSync(path)) return null;

  const json = await transcribeVerbose(path);
  const refWords = tokens(REFERENCE);
  const hypWords = tokens(json.text);
  const perWord = alignWords(refWords, hypWords);

  // 약점 음소: 점수 낮은(<70) 기준 단어에 태그된 음소 수집
  const weak = new Set<string>();
  for (const w of perWord) {
    if (w.score < 70) (PHONEME_TAGS[w.word] ?? []).forEach((p) => weak.add(p));
  }

  const segs = json.segments ?? [];
  const avgLogprob =
    segs.length > 0 ? segs.reduce((s, x) => s + x.avg_logprob, 0) / segs.length : NaN;
  const meanWordScore = Math.round(perWord.reduce((s, w) => s + w.score, 0) / perWord.length);

  return {
    label,
    voice,
    audioPath: path,
    transcript: json.text.trim(),
    avgLogprob,
    meanWordScore,
    weakPhonemes: [...weak],
    perWord,
  };
}

// ── gpt-4o-audio-preview 발음 평가 (멀티모달 오디오 LLM, 신규 벤더 없음) ──────
interface AudioAssess {
  overall: number;
  words: { word: string; score: number; issue?: string }[];
  weakPhonemes: string[];
}
async function assessWithAudioLLM(audioPath: string): Promise<AudioAssess | null> {
  const b64 = readFileSync(audioPath).toString('base64');
  const sys =
    'You are an English pronunciation coach for Korean learners. Listen to the audio and assess ' +
    `pronunciation against the target sentence: "${REFERENCE}". Score each content word 0-100 ` +
    '(how native-like the actual pronunciation sounds — NOT whether the word is intelligible). ' +
    'Identify weak phonemes (e.g. "r/l", "θ (th)", "v/f"). Reply ONLY compact JSON: ' +
    '{"overall":int,"words":[{"word":str,"score":int,"issue":str}],"weakPhonemes":[str]}';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-audio-mini',
      modalities: ['text'],
      messages: [
        { role: 'system', content: sys },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Assess my pronunciation.' },
            { type: 'input_audio', input_audio: { data: b64, format: 'wav' } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    console.error(`  ⚠️ gpt-4o-audio ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? '';
  // JSON 객체 부분만 추출 + 파이썬 dict 스타일(작은따옴표) 보정
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) {
    console.error(`  ⚠️ gpt-audio 응답에 JSON 없음: ${raw.slice(0, 120)}`);
    return null;
  }
  for (const candidate of [m[0], m[0].replace(/'/g, '"')]) {
    try {
      return JSON.parse(candidate) as AudioAssess;
    } catch {
      /* 다음 후보 시도 */
    }
  }
  console.error(`  ⚠️ gpt-audio JSON 파싱 실패: ${m[0].slice(0, 120)}`);
  return null;
}

console.log(`\n🎯 기준문: "${REFERENCE}"\n`);

const cases: { label: string; voice: string; text?: string; kind: 'native' | 'accent' | 'mispron' }[] = [
  { label: '네이티브 정발음 (en_US)', voice: 'Samantha', kind: 'native' },
  { label: '네이티브 정발음 (en_GB)', voice: 'Daniel', kind: 'native' },
  { label: '한국어 보이스 정발음 (ko_KR)', voice: 'Yuna', kind: 'accent' },
  { label: '음소 치환 오류 주입 (th→s, v→b, f→p, r→l)', voice: 'Samantha', text: MISPRONOUNCED, kind: 'mispron' },
];

const results: (Result & { kind: string })[] = [];
for (const c of cases) {
  const r = await run(c.label, c.voice, c.text);
  if (r) results.push({ ...r, kind: c.kind });
}

console.log('━'.repeat(72));
for (const r of results) {
  console.log(`\n■ ${r.label} — voice=${r.voice}`);
  console.log(`  전사:        "${r.transcript}"`);
  console.log(`  avg_logprob: ${r.avgLogprob.toFixed(3)}  (0에 가까울수록 신뢰↑)`);
  console.log(`  평균 단어점수: ${r.meanWordScore}/100`);
  console.log(`  약점 음소:    ${r.weakPhonemes.length ? r.weakPhonemes.join(', ') : '(없음)'}`);
  console.log(
    `  단어별:      ${r.perWord
      .filter((w) => PHONEME_TAGS[w.word])
      .map((w) => `${w.word}=${w.score}`)
      .join('  ')}`,
  );
}

console.log(`\n${'━'.repeat(72)}`);
console.log('판정 — Whisper 근사가 무엇을 구분하나:');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const byKind = (k: string) => results.filter((r) => r.kind === k);
const fmt = (k: string, name: string) => {
  const rs = byKind(k);
  if (!rs.length) return;
  console.log(
    `  ${name.padEnd(22)} logprob ${avg(rs.map((r) => r.avgLogprob)).toFixed(3)}  단어점수 ${avg(
      rs.map((r) => r.meanWordScore),
    ).toFixed(0)}  약점음소 ${rs.flatMap((r) => r.weakPhonemes).length || '없음'}`,
  );
};
fmt('native', '네이티브 정발음');
fmt('accent', '한국어 보이스 정발음');
fmt('mispron', '음소 치환 오류');
console.log('\n  핵심: TTS는 보이스 로케일과 무관하게 깨끗한 음소를 내므로, 억양 프록시(accent)는');
console.log('  네이티브와 사실상 동일하게 나온다. 의미 있는 분리는 "음소 치환 오류"에서만 — 즉');
console.log('  Whisper 근사는 단어를 못 알아들을 만큼 망가진 발음만 잡고, 이해 가능한 억양은 못 잡는다.');
console.log('  (게다가 ribber→river, bery→very, par→far가 100점 — Whisper가 오류를 자동 교정해 숨김)');

// ── 대조군: gpt-4o-audio-preview 발음 평가 (같은 OpenAI, 신규 벤더 없음) ────────
console.log(`\n${'━'.repeat(72)}`);
console.log('대조 — gpt-audio-mini 발음 평가 (멀티모달 오디오 LLM):');
for (const r of results) {
  const a = await assessWithAudioLLM(r.audioPath);
  if (!a) continue;
  const tagged = (a.words ?? []).filter((w) => PHONEME_TAGS[norm(w.word)]);
  console.log(`\n  ■ ${r.label}`);
  console.log(`    overall=${a.overall}  약점음소=[${(a.weakPhonemes ?? []).join(', ')}]`);
  console.log(`    단어별: ${tagged.map((w) => `${w.word}=${w.score}`).join('  ')}`);
}
console.log('\n  관찰: gpt-audio(-mini)는 실행마다 (a) 오디오 처리 거부 (b) 완벽한 네이티브 TTS에');
console.log('  약점 음소 환각(overall 70대) (c) 깨진 JSON 을 비결정적으로 반복 — 신뢰 가능한 점수 아님.');
console.log('\n  결론(ADR-0010 근거): OpenAI 단독으로는 정직한 음소/단어 발음 점수 불가.');
console.log('  whisper=오류 자동교정으로 거짓 100점, gpt-audio=비결정적 환각. 가짜 점수 출시 안 함.');
console.log('');
