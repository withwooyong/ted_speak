# P2 W4 — 발음 피드백(정직한 최소 범위) 작업계획서

> Ted Speak (TalkTed) Phase 2 W4 | 2026-06-13 작성 (세션 7)
> 근거: ADR-0010(승인 — 스파이크 실측), PLAN.md §4.3·§11 / 선행: P1·W1~W3 완료
> 파이프라인: /ted-run | 보안 민감: **아니오** (신규 벤더·테이블·RLS 없음)

---

## 1. 목표

스파이크(ADR-0010)로 OpenAI 단독 음소 발음 점수가 불가함을 확정했다. W4는 **진실하게 말할 수
있는 것만** Drill에 더한다.

1. **단어 인식 결과** — 목표 핵심 단어가 인식됐나/빠졌나(기존 `scoreDrill` 재사용). "발음 점수"가
   아니라 **"단어 인식률"**임을 라벨로 명시.
2. **또렷함(clarity) 보조 힌트** — `avg_logprob` → coarse 밴드. **오디오가 또렷이 들렸는지**
   (발음 정확도 아님)로 정직하게 표기, 점수 아닌 조언으로만.
3. **PronunciationAssessor seam** — 향후 Azure 음소평가가 같은 인터페이스로 드롭인.

**비목표**: 음소 점수, 약점 음소 식별, `pronunciation_attempts` 테이블(Azure 도입까지 이월),
clarity의 점수화.

## 2. 작업 항목 (TDD)

### A. 순수 코어 — `packages/shared/src/pronunciation.ts`

- `ClarityBand = 'clear' | 'fair' | 'unclear' | 'unknown'`
- `assessClarity(avgLogprob: number | null | undefined): ClarityBand`
  - 스파이크 근거 임계값: ≥ -0.50 clear / ≥ -0.62 fair / < -0.62 unclear / null·NaN → unknown
- `interface PronunciationFeedback { recognitionScore; passed; recognized; missing; clarity }`
- `assessPronunciation(transcript, targetWords, avgLogprob?, opts?)`: **scoreDrill을 내부 재사용**
  (중복 금지) + recognized 목록 + clarity 머지. 순수·결정적.
- `interface PronunciationAssessor { assess(...): PronunciationFeedback }` + `localAssessor` 구현.
  Azure 구현 자리 주석(phonemeScores 확장 지점) 명시.
- 테스트: 빈 targetWords·전부 인식·일부 누락·logprob 밴드 경계·null/NaN·대소문자/문장부호 정규화.
- `packages/shared/index.ts` export, `vitest.config.ts` coverage.include 등록.

### B. STT 상세 전사 — `packages/ai/src/stt.ts`

- `transcribeDetailed(audio, cfg, opts): Promise<{ text: string; avgLogprob: number | null }>`
  - `response_format=verbose_json` + `timestamp_granularities[]=segment`, segments의 avg_logprob
    평균. segments 없으면 avgLogprob=null(텍스트는 항상 반환).
  - 기존 `transcribe`(text-only)는 **무변경**(다른 호출자 보존). reliableFetch·재시도·에러 경로 동일 재사용.
- 테스트: verbose_json 모킹으로 avgLogprob 평균/누락/단일 segment, throwIfNotOk 경로.

### C. 앱 어댑터 — `apps/mobile/src/lib/ai.ts`

- `transcribeUriDetailed(uri, cfg, opts): Promise<{ text; avgLogprob }>` — 기존 `transcribeUri`와
  같은 Blob 어댑터, `transcribeDetailed` 호출.

### D. Drill 연결 — `apps/mobile/src/app/lesson/[id].tsx` + `DrillStep.tsx`

- 드릴 녹음 경로를 `transcribeUriDetailed`로 교체, `assessPronunciation`으로 피드백 산출.
  텍스트 폴백은 avgLogprob 없음(clarity unknown) — 동선 보존.
- `DrillResultView`에 `clarity: ClarityBand` 추가.
- UI(토큰만): 점수 링 라벨을 **"단어 인식"**으로 reframe(발음 등급 오인 방지). clarity가 unclear/fair면
  통과 여부와 무관하게 보조 칩("또렷하게 다시 한 번 말해볼까요?") 노출. clear/unknown이면 숨김.
- 통과 문구에서 발음 정확도 단정("자연스러워요") 제거 → 인식 기반 정직 문구.

### E. E2E·문서

- e2e mock-flow에 clarity 힌트 노출/숨김 1케이스(가능 범위). 없으면 단위 테스트로 충분.
- `docs/plans/p2-tutor.md` §2 W4·§4 완료정의를 ADR-0010 기준으로 동기화.

## 3. 완료 정의

- [ ] `assessPronunciation`/`assessClarity` 순수·테스트 그린, 커버리지 게이트 통과
- [ ] `transcribeDetailed` avg_logprob 평균 정확, 기존 `transcribe` 무변경 회귀
- [ ] Drill UI가 단어 인식 결과 + clarity 힌트를 **정직한 라벨**로 표시(발음 점수로 오인 안 됨)
- [ ] `PronunciationAssessor` seam 존재 + Azure 드롭인 지점 주석
- [ ] `npm run ci` 그린. 신규 테이블·RLS 없음(보안 민감 아님)
- [ ] ADR-0010·p2-tutor.md 동기화

## 4. 순서

A(코어 TDD) → B(STT) → C(어댑터) → D(UI 연결) → E(E2E·문서) → 이중 리뷰 → verify → 커밋(푸시 미요청)
