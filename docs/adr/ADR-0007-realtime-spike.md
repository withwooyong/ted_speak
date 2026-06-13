# ADR-0007: Realtime API 채택 여부 (Phase 2 W1 스파이크)

- 날짜: 2026-06-13
- 상태: **승인** (2026-06-13 실측 완료) — AI 튜터 전송 계층은 Realtime 채택, 레슨은 turn-based 유지(Hybrid 확정)
- 관련: PLAN.md §6.2(Hybrid 음성), §4.3(AI 튜터), docs/plans/p2-tutor.md W1, ADR-0003(turn-based 기준)

## 맥락

PLAN의 Hybrid 전략은 "레슨은 turn-based(비용 예측·2~4초 허용), **AI 튜터(프리토킹·롤플레이)만
Realtime**"이다(D7). Phase 2 착수 전, AI 튜터의 전송 계층을 Realtime으로 갈지 turn-based로
폴백할지 **실측으로 판정**해야 한다. 기준선은 ADR-0003의 turn-based 체감 지연 **중앙값 3.51s**
(whisper-1 + gpt-4o + tts-1 스트리밍, 짧은 발화).

## 측정 방법 (스파이크)

`packages/ai/spike/realtime.mts` — `npm run spike:realtime -w @ted-speak/ai` (OPENAI_API_KEY 필요).

- **입력 오디오**: 고정 사용자 발화를 TTS `response_format=pcm`(24kHz·16bit·mono)으로 자가 합성 —
  Realtime 기본 입력 포맷과 동일해 파일 의존·리샘플 없음. turn-based 벤치와 동급 길이의 짧은 턴.
- **연결**: `wss://api.openai.com/v1/realtime?model=$REALTIME_MODEL`(기본 `gpt-realtime`), `ws` 헤더 인증.
- **첫 응답 지연**: `input_audio_buffer.commit`(+response.create) → 첫 오디오 출력 델타까지. 3회 중앙값.
  Realtime은 speech-to-speech라 STT+LLM+TTS 단계 합산이 없어 turn-based보다 크게 낮을 것으로 기대.
- **barge-in(끼어들기)**: Ted 발화 시작 직후 `response.cancel` 전송 → 취소 확정까지. turn-based가
  구조적으로 불가능한 기능이라 채택의 핵심 근거.
- **비용**: `response.done`의 usage 토큰 × gpt-realtime 단가(audio in $32 / out $64 per 1M, 2025-08 GA)
  로 턴당 비용 산출 + 분당 참고 환산.
- **스키마 견고성**: preview↔GA의 세션 스키마·이벤트명 차이를 흡수(session.created 로깅, 'audio'+'delta'
  매칭, error 표면화). 모델명 불일치는 `REALTIME_MODEL`로 1줄 수정.

## 판정 기준 (측정 후 자동 적용)

| 차원 | Realtime 채택 조건 | 기각/폴백 조건 |
|---|---|---|
| 첫 응답 지연(중앙값) | ≤ 2.5s (turn-based 3.51s 대비 체감 개선 명확) | > 3.5s (개선 없음 → turn-based 유지) |
| barge-in | 취소 확정 < 500ms로 동작 | 미동작/불안정 |
| 분당 비용 | 소프트 제한(AI 5분/일) 내 수용 가능 | turn-based 대비 과도(예: >5×)하고 지연 이득이 작음 |

- **세 차원 모두 채택 조건** → AI 튜터는 Realtime(레슨은 그대로 turn-based — Hybrid 확정).
- **지연/barge-in은 좋으나 비용 과도** → AI 튜터에 일일 시간 상한·세션 길이 cap을 강하게 걸고 Realtime.
- **지연 이득 미미 또는 barge-in 불안정** → AI 튜터도 turn-based 폴백(PLAN 허용), W2 전송 계층을 레슨과 공유.

## 측정 결과 (2026-06-13, gpt-realtime GA, 짧은 일상 턴 ~4.3s 입력)

```
model:                  gpt-realtime  (GA — session.type='realtime' 필수)
session 스키마:          GA(nested audio) — VAD 제어는 session.audio.input.turn_detection
첫 응답 지연 중앙값:      0.63s   (개별: 0.91 / 0.63 / 0.63 s)   [재현런: 0.64s — 0.88/0.64/0.63]
barge-in 취소 확정:      175ms   (재현런 191ms)  — response.cancel → response.done(status=cancelled)
턴당 비용 중앙값:        $0.0059  (재현런 $0.0105; 응답 길이에 따라 변동)  ~$0.035–0.063/분(6턴/분 가정)
usage(턴1):             total 165  (in 80: text 37 + audio 43 / out 85: text 22 + audio 63)
```

> **측정 유효성 주의(스파이크에서 발견·반영)**: 수동 commit 측정은 **서버 VAD를 반드시 꺼야**(GA:
> `session.audio.input.turn_detection: null`, `session.type:'realtime'` 동봉 필수) 한다. VAD가 켜진 채
> commit하면 입력 오디오가 "새 발화 시작"으로 감지돼 in-flight 응답이 `turn_detected`로 자동 취소되고,
> 첫 응답 지연이 0.02~0.06s·usage 0·빈 응답 같은 **가짜 측정값**이 나온다. realtime.mts는 session.updated
> 확인 + 턴 비취소로 VAD off를 이중 검증한다. 위 수치는 정상(미취소·완전 응답) 턴 기준.

## 결정 (확정)

판정 기준 대입:

| 차원 | 측정값 | 기준 | 판정 |
|---|---|---|---|
| 첫 응답 지연(중앙값) | **0.63s** | ≤ 2.5s 채택 | ✅ 채택 — turn-based 체감 3.51s 대비 ~5.6× 개선 |
| barge-in | **175ms** | < 500ms | ✅ 채택 — turn-based가 구조적으로 불가능한 기능 |
| 분당 비용 | **~$0.035–0.063/분** | 소프트 제한(5분/일) 내 수용 | ⚠️ 조건부 수용 — 5분/일 시 ~$0.18–0.32/일/유저, 상한 전제 필요 |

**결정: 승인.** 세 차원 중 지연·barge-in은 압도적 우위, 비용만 turn-based보다 높다. 비용은 AI 튜터의
일일 시간 상한(MVP 5분/일 소프트)과 세션 길이 cap으로 통제 가능한 수준이므로 **AI 튜터(프리토킹·롤플레이)는
Realtime을 채택**한다. **레슨(Learn·Drill·Conversation)은 turn-based 유지** — Hybrid 전략(D7) 확정.

후속(W2 전송 계층 설계 시 반영):
- AI 튜터에 **일일 시간 상한 + 세션 길이 cap**을 하드하게 건다(비용 통제). 프리토킹/롤플레이 시나리오별
  실제 토큰 프로파일을 W2에서 재측정해 분당 비용을 갱신한다.
- VAD 운영: 실사용은 서버 VAD **on**(자연스러운 turn-taking) + 클라이언트 barge-in. 스파이크의 VAD off는
  순수 측정용 설정이며 제품 동작과 무관함을 W2 설계 문서에 명시한다.
- 모바일 실측: 헤드리스 노드의 TTS 합성 입력 기준이므로, RN WebRTC + 실마이크 + 모바일 네트워크 경로의
  지연은 W2 RN 연결 검증 + 실기기에서 별도 확인(아래 한계 참조).

## 알려진 한계 (스파이크 범위)

- 헤드리스 노드에서 TTS 합성 음성을 입력으로 쓴다 — 실제 마이크 입력·네트워크 변동·모바일
  WebRTC 경로의 지연은 RN 연결 검증(W2 진입 시) + 실기기에서 별도 확인 필요.
- 분당 비용은 "턴/분" 가정에 민감 — 프리토킹(연속 발화)과 롤플레이(짧은 왕복)의 실제 토큰
  프로파일은 W2에서 시나리오별로 재측정.
- gpt-realtime 단가는 2025-08 GA 발표 기준 — 실행 시점 단가 변동 시 PRICE 상수·본 표 갱신.
