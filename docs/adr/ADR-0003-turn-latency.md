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
   과대 측정되는 경향이 있다. Phase 1 추가 레버: 짧은 실발화 재측정, drill·대화용
   gpt-4o-mini 검토, 녹음 업로드 병렬화.
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
