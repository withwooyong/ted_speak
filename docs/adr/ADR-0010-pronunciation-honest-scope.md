# ADR-0010: 발음 피드백 — OpenAI 단독 한계 실측 + 정직한 최소 범위

- 날짜: 2026-06-13
- 상태: **승인** (P2 W4)
- 관련: docs/plans/p2-w4-pronunciation.md, PLAN.md §4.3·§8(PronunciationAttempt)·§11 리스크,
  packages/ai/spike/pronunciation.mts, ADR-0003(turn-based)

## 맥락

P2 W4는 "발음 점수·피드백"이 목표다. 후보는 ① Azure Speech 발음 평가(음소 단위, 유료·신규 벤더)
② Whisper 근사(기존 OpenAI, 무료, 정밀도 미지수)였다. 확정 스택은 OpenAI 단독(CLAUDE.md)이라
신규 벤더 도입은 사용자 확인 사항 → 우선 **Whisper 근사의 도달 가능 정밀도를 스파이크로 실측**해
ADR로 확정하기로 했다.

## 실측 (packages/ai/spike/pronunciation.mts)

같은 기준문("I really think the third river is very far from here.")을 macOS `say`로 합성해
3 방식으로 비교했다. 한국 학습자 난점 음소(r/l, θ(th), v/f, 어말 자음)가 풍부하도록 설계.

| 입력 | whisper-1 단어점수 | avg_logprob | gpt-audio(-mini) |
|------|------|------|------|
| 네이티브 정발음(en_US/GB) | 100 | -0.42 ~ -0.44 | overall 70대 + **약점 음소 환각** |
| 한국어 보이스 정발음(ko_KR) | 100 | -0.43 | (동) |
| **음소 치환 오류 주입**(th→s, v→b, f→p, r→l) | 74 | -0.65 | 비결정적(거부/환각/깨진 JSON) |

핵심 관찰 2가지:

1. **Whisper는 오류를 자동 교정해 숨긴다.** 명백한 음소 오류로 합성한 `ribber/bery/par`를
   디코더가 언어모델 prior로 `river/very/far`로 복원해 **모두 100점**을 줬다. 주입한 6개 오류 중
   3개(really/think/third)만 점수에 샜다. 즉 단어 인식이 깨질 만큼 망가진 발음만, 그것도 불완전하게
   잡는다. 이해 가능한 억양은 logprob Δ≈0.00으로 전혀 구분 못 한다(Whisper의 설계 목표인 억양
   강건성이 발음 채점에는 정확히 역효과).
2. **gpt-audio(-mini)는 신뢰 불가.** 실행마다 (a) 오디오 처리 거부 (b) 완벽한 네이티브 TTS에
   약점 음소 환각(overall 70대) (c) 깨진 JSON 을 비결정적으로 반복했다. 점수가 오디오 실제 내용이
   아니라 "한국 학습자는 보통 이게 약점"이라는 패턴 흉내로 보였다.

## 결정

### 1. OpenAI 단독으로는 음소·단어 발음 "점수"를 만들지 않는다

가짜 점수 출시는 품질 우선 원칙(D10)과 PLAN §11 리스크("STT 한국인 발음 오인식 → 좌절감")에
정면으로 어긋난다. whisper는 거짓 칭찬(틀린 발음에 100점), gpt-audio는 거짓 경보(정발음에 환각)를
낸다. **둘 다 출시 안 한다.**

### 2. W4를 "정직한 최소 범위"로 재정의한다

진실하게 말할 수 있는 것만 보여준다.
- **단어 인식 결과**(이미 `scoreDrill`이 산출) — 목표 핵심 단어가 인식됐나/빠졌나. 이건 "발음
  점수"가 아니라 **"단어 인식률"**임을 라벨로 명시(점수 링이 발음 등급으로 오인되지 않게 reframe).
- **또렷함(clarity) 보조 힌트** — `verbose_json`의 `avg_logprob`를 coarse 밴드로 매핑(스파이크
  근거: 정발음 ≈ -0.43, 인식 붕괴 ≈ -0.65). **발음 정확도가 아니라 "오디오가 또렷이 들렸는지"**
  (전사 신뢰도 proxy — 음질·소음·속도·발화 명료도 복합)로 정직하게 표기. 점수가 아닌 조언("또렷하게
  다시 한 번")으로만 노출.
- **음소 단위 점수·약점 음소 식별은 제공하지 않는다**(Azure 도입 전까지).

### 3. 진짜 음소 평가는 PronunciationAssessor seam 뒤로 이월한다

`PronunciationAssessor` 인터페이스(transcript·avgLogprob·targetWords → recognized/missing/clarity)를
두고, 로컬 구현(OpenAI 스택, 위 2번)을 끼운다. 향후 Azure 구현이 `phonemeScores`를 채워 같은
인터페이스로 드롭인된다. **`pronunciation_attempts` 테이블(PLAN §8, phonemeScores jsonb)은 채울
정직한 데이터가 없으므로 Azure 도입 시점까지 만들지 않는다**(빈/가짜 컬럼 회피 = 보안·스키마 표면 절약).

## 결과

- W4 완료 기준 재정의: ~~"단어별 점수 시각화, 약점 음소 1개 이상 식별"~~ →
  **"Drill에서 단어 인식 결과 + 또렷함 힌트를 정직한 라벨로 표시, 발음 점수로 오인 안 되게 reframe,
  Azure 음소평가 seam 확보"**. (docs/plans/p2-w4-pronunciation.md, p2-tutor.md §4 동기화)
- 신규 벤더·신규 테이블·신규 RLS 없음 → 이번 작업은 보안 민감 아님(일반 ted-run).
- 스파이크는 재현 아티팩트로 유지(`npm run spike:pron`, OPENAI_API_KEY 필요). 단가·모델 변동 시 재실행.

## 한계·이월

- 진짜 음소·강세·억양 피드백은 Azure Speech(또는 더 신뢰 가능한 미래 오디오 모델) 도입 시 W4-후속으로.
  그때 `PronunciationAssessor` Azure 구현 + `pronunciation_attempts` 테이블(보안 민감 ted-run) 추가.
- clarity는 약한·복합 신호다(억양 품질 아님). 사용자에게 점수로 제시하지 않고 보조 조언으로만 쓴다.
- 스파이크 입력은 TTS 합성·헤드리스 기준 — 실마이크/모바일 경로의 logprob 분포는 실기기 검증에서 확인.
