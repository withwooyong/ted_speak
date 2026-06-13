# ADR-0003: 턴 지연 전략 — TTS 스트리밍 재생 + Drill 로컬 채점

- 날짜: 2026-06-12
- 상태: 승인
- 관련: PLAN.md §6.2 (turn-based, 턴당 2~4초), docs/plans/p0-foundation.md T2

## 맥락

스파이크 v1(순차 버퍼링): STT 1.7~2.3s + LLM 1.5~1.8s + TTS 1.7~2.2s = **5.4~5.9s**로
목표(≤4s)를 초과했다. 각 단계가 고르게 1.5~2s라 단일 병목 제거로는 부족하다.

## 결정

1. **TTS는 스트리밍 소비** — 첫 오디오 청크 도달(TTFB) 즉시 재생을 시작한다.
   체감 지연 = STT + LLM + TTS TTFB. 스파이크 v2 실측 3회: **3.33s / 4.22s / 4.89s (중앙값 4.22s)**.
   v1(순차 버퍼링 5.4~5.9s) 대비 1.2~1.5s 개선됐으나 **≤4s 목표는 아직 일관 달성 못 함**.
   단, 측정에 쓴 샘플 발화는 약 9초 분량으로 실제 드릴·대화 턴(2~5초)보다 길어 STT가
   과대 측정되는 경향이 있다.

   **(추가 측정 2026-06-12, 짧은 발화 1.5초 샘플, spike/bench.mts)**
   - A 현행(whisper-1 + gpt-4o + tts-1 스트리밍): **중앙값 3.51s ✅** (개별 2.44~5.51s — 변동 큼)
   - B 저지연 후보(gpt-4o-mini-transcribe + gpt-4o-mini): 중앙값 7.02s ⚠️ — mini의 JSON 모드
     생성이 오히려 느리고 분산 극심(최대 16s). **채택하지 않음, 현행 모델 유지.**
   - 별도 발견: undici keep-alive 스톨로 TTS HeadersTimeout 2회 관측 → **클라이언트에
     타임아웃·재시도 필수** (Phase 1 과제, PLAN §13 네트워크 리스크와 연계).
2. **LLM 응답 길이 cap** — `max_tokens: 220` + "max 2 sentences" 프롬프트. 지연·비용 동시 관리.
3. **Drill(Step 2) 채점은 LLM을 쓰지 않는다** — `scoreDrill()` 로컬 keyWords 매칭(0ms).
   LLM 교정은 Conversation(Step 3)에서만 사용한다.
4. 대화 히스토리는 최근 6턴 슬라이딩 윈도우 (PLAN §7.3).

## 결과

- `packages/ai/src/tts.ts`의 `synthesizeStream()`이 표준 재생 경로.
  비스트리밍 `synthesize()`는 레슨 고정 문장 사전 캐시 용도로 유지.
- `packages/shared/src/drill-score.ts`가 Drill 채점 단일 구현.
- 모바일에서 스트리밍 재생(expo-audio buffer queue) 가능 여부는 Phase 1에서 검증.
  불가 시 폴백: 문장 단위 분할 합성(첫 문장 먼저 재생).

## 갱신 (2026-06-12, P1 U1·U6)

1. **신뢰성 계층 구현** — `packages/ai/src/reliability.ts`의 `reliableFetch()`가 전 AI 호출의
   표준 경로. 시도당 타임아웃 15s(AbortController) + 지수 백오프 재시도 2회(500→1000ms).
   재시도 대상: 네트워크 에러·타임아웃·5xx·429. 4xx(429 제외)는 즉시 반환(상위 `throwIfNotOk`).
   호출자 `signal` abort는 재시도 없이 즉시 중단(레슨 이탈 시 취소). STT는 FormData 1회 소비
   문제로 시도마다 init을 재생성(팩토리 주입). **스트리밍은 첫 바이트 수신 전까지만 재시도**
   (이중 재생 방지) — 이후 스트림 에러는 AiError로 즉시 실패.
2. **모바일 Ted 발화 재생은 문장 단위 분할 합성으로 확정** — RN(Hermes)에는 MediaSource가
   없어 `synthesizeStream()` 청크의 점진 재생이 불가하다. `apps/mobile/src/hooks/use-tts.ts`가
   reply를 문장으로 분할해 첫 문장을 합성·재생하고 다음 문장을 재생 중 백그라운드 합성한다
   (위 폴백 경로 채택). `synthesizeStream` 직접 재생은 네이티브 buffer queue 모듈 도입 시 재평가.
3. 레슨 고정 문장(keyPhrases·drills)은 `apps/mobile/src/lib/tts-cache.ts`로 사전 합성·파일
   캐시(expo-file-system) — 오프라인 재진입 재생 + 비용 절감(PLAN §7.3).
