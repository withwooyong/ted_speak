#!/usr/bin/env node
/**
 * Phase 2 W1 — OpenAI Realtime API 스파이크 (가부 판정용 실측)
 *
 * 목적(docs/plans/p2-tutor.md W1): 양방향 음성 1세션을 E2E로 돌려
 *   ① 첫 응답 지연(commit→첫 오디오 출력)  ② 끊김(barge-in) 지원  ③ 분당 비용
 * 을 실측하고, turn-based(ADR-0003 체감 지연 중앙값 3.51s) 대비 ADR-0007 판정 근거를 만든다.
 *
 * 실행:
 *   OPENAI_API_KEY=... npx tsx packages/ai/spike/realtime.mts [반복수]
 *   REALTIME_MODEL=gpt-realtime-2 OPENAI_API_KEY=... npx tsx ... [반복수]   # 모델 오버라이드
 *
 * 설계 메모:
 * - 입력 오디오는 OpenAI TTS를 response_format=pcm(24kHz·16bit·mono)으로 호출해 자가 합성한다.
 *   이 포맷이 Realtime 기본 입력 포맷과 동일하므로 파일 의존·리샘플 없이 그대로 흘려보낸다.
 * - Realtime은 preview→GA 사이에 세션 스키마(flat input_audio_format vs nested audio.input)와
 *   이벤트명(response.audio.delta vs response.output_audio.delta)이 갈렸다. 이 스파이크는
 *   특정 스키마에 베팅하지 않는다: session.created 페이로드를 로깅하고, "오디오 출력 첫 청크"는
 *   type에 'audio'와 'delta'가 함께 든 이벤트로 견고하게 탐지하며, error 이벤트는 원문 그대로
 *   노출한다. 모델명/스키마가 안 맞으면 서버 error가 그대로 떠 1줄 수정으로 끝난다.
 */
import { Buffer } from 'node:buffer';

import WebSocket from 'ws';

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.REALTIME_MODEL ?? 'gpt-realtime';
const runs = Number(process.argv[2] ?? 3);
if (!apiKey) {
  console.error('사용법: OPENAI_API_KEY=... npx tsx packages/ai/spike/realtime.mts [반복수]');
  process.exit(1);
}

// 측정에 쓸 고정 사용자 발화 — 짧은 일상 대화 턴(turn-based 벤치와 동급 길이)
const USER_UTTERANCE = 'Hi Ted, yesterday I went to the park and played soccer with my friends.';
const INSTRUCTIONS =
  'You are Ted, a friendly English speaking tutor for beginners. Reply in one or two short, encouraging sentences and ask a simple follow-up question.';

// ── gpt-realtime 가격 (2025-08 GA 발표 기준, USD / 1M tokens) — 변동 가능, ADR에 출처·일자 명시 ──
// 출처: openai.com/index/introducing-gpt-realtime (audio in 32 / out 64, text in 4 / out 16, cached audio in 0.40)
const PRICE = { audioIn: 32, audioOut: 64, textIn: 4, textOut: 16, cachedIn: 0.4 }; // per 1M tokens

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 사용자 발화를 24kHz·16bit·mono PCM(raw)로 합성 — Realtime 입력 포맷과 동일 */
async function synthesizeUserPcm(text: string): Promise<Buffer> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', voice: 'echo', input: text, response_format: 'pcm' }),
  });
  if (!res.ok) throw new Error(`입력 TTS 합성 실패: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

interface TurnResult {
  firstAudioMs: number | null; // commit → 첫 오디오 출력 델타
  doneMs: number; // commit → response.done
  usage: Record<string, unknown> | null;
  replyText: string;
  cancelAckMs: number | null; // barge-in: response.cancel → 취소 확정
}

/** type에 두 토큰이 모두 든 이벤트인지 (preview/GA 이름 차이 흡수) */
const matches = (t: string, a: string, b: string) => t.includes(a) && t.includes(b);

function computeCostUsd(usage: Record<string, unknown> | null): number | null {
  if (!usage) return null;
  const inDet = (usage.input_token_details ?? {}) as Record<string, number>;
  const outDet = (usage.output_token_details ?? {}) as Record<string, number>;
  const audioIn = inDet.audio_tokens ?? 0;
  const cachedIn = (inDet.cached_tokens ?? 0) as number;
  const textIn = (inDet.text_tokens ?? 0) as number;
  const audioOut = outDet.audio_tokens ?? 0;
  const textOut = outDet.text_tokens ?? 0;
  return (
    ((audioIn - cachedIn) * PRICE.audioIn +
      cachedIn * PRICE.cachedIn +
      textIn * PRICE.textIn +
      audioOut * PRICE.audioOut +
      textOut * PRICE.textOut) /
    1_000_000
  );
}

async function runOneTurn(
  ws: WebSocket,
  pcm: Buffer,
  opts: { testBargeIn: boolean },
): Promise<TurnResult> {
  return new Promise<TurnResult>((resolve, reject) => {
    let committedAt = 0;
    let firstAudioMs: number | null = null;
    let cancelSentAt = 0;
    let cancelAckMs: number | null = null;
    let bargeInTriggered = false;
    let replyText = '';

    const onMessage = (raw: WebSocket.RawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const type = String(msg.type ?? '');

      if (process.env.DEBUG_REALTIME) {
        const extra =
          type === 'response.done'
            ? ` ${JSON.stringify((msg.response as Record<string, unknown>) ?? {})}`
            : type.includes('delta')
              ? ` delta=${JSON.stringify(msg.delta ?? '').slice(0, 40)}`
              : '';
        console.log(`    [evt] ${type}${extra}`);
      }

      if (type === 'error') {
        cleanup();
        reject(new Error(`서버 error 이벤트: ${JSON.stringify(msg.error ?? msg)}`));
        return;
      }

      // 오디오 출력 첫 청크 = 첫 응답 지연의 끝 (response.audio.delta | response.output_audio.delta)
      // output_audio_transcript.delta도 'audio'+'delta'를 포함하므로 transcript는 제외 — 실제 오디오 바이트만.
      if (firstAudioMs === null && matches(type, 'audio', 'delta') && !type.includes('transcript')) {
        firstAudioMs = Date.now() - committedAt;
        // barge-in 테스트: Ted가 말하기 시작하자마자 끼어들어 취소를 보낸다
        if (opts.testBargeIn && !bargeInTriggered) {
          bargeInTriggered = true;
          cancelSentAt = Date.now();
          ws.send(JSON.stringify({ type: 'response.cancel' }));
        }
      }

      // 응답 텍스트(전사) 수집 — sanity 출력용 (text/transcript delta 모두 흡수)
      if (matches(type, 'delta', 'text') || matches(type, 'delta', 'transcript')) {
        const d = (msg.delta ?? '') as string;
        if (typeof d === 'string') replyText += d;
      }

      if (type === 'response.done') {
        // barge-in 취소 확정 = cancel 전송 → 권위 있는 response.done 도달(중간 *.done 이벤트 제외)
        if (cancelSentAt && cancelAckMs === null) cancelAckMs = Date.now() - cancelSentAt;
        const usage = ((msg.response as Record<string, unknown>)?.usage ?? null) as
          | Record<string, unknown>
          | null;
        const doneMs = Date.now() - committedAt;
        cleanup();
        resolve({ firstAudioMs, doneMs, usage, replyText: replyText.trim(), cancelAckMs });
      }
    };

    const onErr = (e: Error) => {
      cleanup();
      reject(e);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('턴 타임아웃(20s) — 응답 없음'));
    }, 20_000);
    function cleanup() {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onErr);
    }

    ws.on('message', onMessage);
    ws.on('error', onErr);

    // 입력 오디오를 32KB 청크로 append → commit → response 생성
    const CHUNK = 32_000;
    for (let i = 0; i < pcm.length; i += CHUNK) {
      const slice = pcm.subarray(i, Math.min(i + CHUNK, pcm.length));
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: slice.toString('base64') }));
    }
    committedAt = Date.now();
    ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    ws.send(JSON.stringify({ type: 'response.create' }));
  });
}

async function main() {
  console.log(`■ Realtime 스파이크 — model=${model}, ${runs}회 + barge-in 1회`);
  console.log('  입력 발화 합성(TTS pcm 24kHz)…');
  const pcm = await synthesizeUserPcm(USER_UTTERANCE);
  console.log(`  입력 PCM ${(pcm.length / 1024).toFixed(0)}KB (~${(pcm.length / (24000 * 2)).toFixed(1)}s)\n`);

  const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  console.log('  WebSocket 연결됨\n');

  // session.created를 받아 서버 실제 스키마를 노출(스키마 차이 디버깅용)
  let isGA = true;
  await new Promise<void>((resolve) => {
    const onCreated = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'session.created') {
        const s = msg.session ?? {};
        isGA = 'audio' in s || !('input_audio_format' in s);
        const shape = 'audio' in s ? 'GA(nested audio)' : 'input_audio_format' in s ? 'preview(flat)' : 'unknown';
        console.log(`  session.created — 스키마: ${shape}`);
        ws.off('message', onCreated);
        resolve();
      }
    };
    ws.on('message', onCreated);
    // 일부 구현은 session.created 없이 바로 동작 — 1.5s 후 진행
    setTimeout(() => {
      ws.off('message', onCreated);
      resolve();
    }, 1500);
  });

  // 수동 commit로 깔끔히 측정하려면 서버 VAD를 꺼야 한다. VAD가 켜져 있으면 commit한 입력
  // 오디오가 "새 발화 시작"으로 감지돼 in-flight 응답이 turn_detected로 자동 취소된다(빈 응답·usage 0).
  // 스키마에 맞는 경로 하나만 보낸다 — GA에 flat 파라미터를 섞으면 update 전체가 거부될 수 있다.
  // GA는 session.type='realtime'이 필수(missing_required_parameter), preview는 flat 스키마.
  const session: Record<string, unknown> = isGA
    ? { type: 'realtime', instructions: INSTRUCTIONS, audio: { input: { turn_detection: null } } }
    : { instructions: INSTRUCTIONS, turn_detection: null };
  // session.update 적용 결과(session.updated | error)를 확인 — 거부되면 측정이 무효이므로 즉시 중단한다.
  await new Promise<void>((resolve, reject) => {
    const onUpdated = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString());
      if (process.env.DEBUG_REALTIME) console.log(`    [upd-evt] ${msg.type}`);
      if (msg.type === 'session.updated') {
        // GA는 turn_detection을 끄면 audio.input에서 생략하거나 null로 반환한다. null/생략(undefined)
        // 둘 다 'VAD off'를 의미 — 비활성은 후속 턴이 turn_detected로 취소되지 않는 것으로 최종 확인된다.
        const s = msg.session as Record<string, any>;
        const td = s?.audio?.input?.turn_detection !== undefined ? s.audio.input.turn_detection : s?.turn_detection;
        const vadOff = td === null || td === undefined;
        console.log(`  session.updated — turn_detection: ${JSON.stringify(td)} ${vadOff ? '✅(VAD off — 턴 비취소로 최종 확인)' : '⚠️(VAD 여전히 on)'}`);
        ws.off('message', onUpdated);
        resolve();
      } else if (msg.type === 'error') {
        ws.off('message', onUpdated);
        reject(new Error(`session.update 거부: ${JSON.stringify(msg.error ?? msg)}`));
      }
    };
    ws.on('message', onUpdated);
    ws.send(JSON.stringify({ type: 'session.update', session }));
    setTimeout(() => {
      ws.off('message', onUpdated);
      reject(new Error('session.update 확인 타임아웃 — VAD 비활성 미확인'));
    }, 3000);
  });

  const results: TurnResult[] = [];
  let bargeIn: TurnResult | null = null;
  try {
    for (let i = 0; i < runs; i++) {
      const r = await runOneTurn(ws, pcm, { testBargeIn: false });
      results.push(r);
      console.log(
        `  턴 ${i + 1}: 첫 오디오 ${r.firstAudioMs ?? '—'}ms · done ${r.doneMs}ms · "${r.replyText.slice(0, 60)}"`,
      );
      await sleep(600);
    }
    console.log('\n  barge-in(끼어들기) 테스트…');
    bargeIn = await runOneTurn(ws, pcm, { testBargeIn: true });
    console.log(
      `  취소 확정까지 ${bargeIn.cancelAckMs ?? '—'}ms (response.cancel → done)`,
    );
  } finally {
    ws.close();
  }

  const firsts = results.map((r) => r.firstAudioMs).filter((x): x is number => x !== null);
  const costs = results.map((r) => computeCostUsd(r.usage)).filter((x): x is number => x !== null);
  const medFirst = firsts.length ? median(firsts) : null;
  const medCost = costs.length ? median(costs) : null;

  console.log('\n' + '─'.repeat(56));
  console.log('■ 결과 요약 (vs turn-based 체감 중앙값 3.51s — ADR-0003)');
  if (medFirst !== null) {
    console.log(
      `  첫 응답 지연 중앙값: ${(medFirst / 1000).toFixed(2)}s ${medFirst <= 4000 ? '✅' : '⚠️'}  (개별: ${firsts.map((x) => (x / 1000).toFixed(2)).join(' / ')}s)`,
    );
  } else {
    console.log('  ⚠️ 오디오 출력 델타 미탐지 — 이벤트명 확인 필요(원시 로그 참고)');
  }
  console.log(`  barge-in 지원: ${bargeIn?.cancelAckMs !== null && bargeIn?.cancelAckMs !== undefined ? `예 (취소 확정 ${bargeIn.cancelAckMs}ms)` : '미확인'}`);
  if (medCost !== null) {
    // 분당 환산: 한 턴 오디오 입력 ~Ns + 출력 Ms로 1분 대화에 몇 턴 들어가는지는 시나리오 의존.
    // 여기서는 "턴당 비용"을 보고하고, 1분=~6턴(짧은 왕복) 가정의 참고 환산만 덧붙인다.
    console.log(`  턴당 비용 중앙값: $${medCost.toFixed(5)}  (참고: 6턴/분 가정 시 ~$${(medCost * 6).toFixed(4)}/분)`);
    console.log(`  (turn-based 참고: whisper $0.006/분 + gpt-4o 토큰 + tts $15/1M자 — ADR-0003)`);
  }
  console.log('  usage(턴1):', JSON.stringify(results[0]?.usage ?? null));
}

main().catch((e) => {
  console.error('\n❌ 스파이크 실패:', e.message);
  console.error('   모델/스키마가 안 맞으면 REALTIME_MODEL 환경변수로 모델명을 바꿔보세요 (예: gpt-realtime-2).');
  process.exit(1);
});
