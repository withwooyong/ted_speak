import { scoreDrill, type DrillScoreOptions } from './drill-score';

/**
 * 발음 피드백 — 정직한 최소 범위 (ADR-0010).
 *
 * 스파이크(packages/ai/spike/pronunciation.mts) 실측 결론: OpenAI 단독으로는 음소·단어
 * 발음 "점수"를 정직하게 낼 수 없다(whisper는 오류를 자동 교정해 거짓 100점, gpt-audio는
 * 환각). 그래서 여기서는 진실하게 말할 수 있는 것만 만든다.
 *   ① 단어 인식 결과 — scoreDrill 재사용. "발음 점수"가 아니라 "핵심 단어 인식률"이다.
 *   ② 또렷함(clarity) — avg_logprob 밴드. 발음 정확도가 아니라 "오디오가 또렷이 들렸는지"
 *      (전사 신뢰도 proxy)다. 점수가 아닌 조언으로만 노출한다.
 * 진짜 음소 평가는 아래 PronunciationAssessor seam 뒤로 이월한다(Azure 도입 시).
 */

/** 또렷함 밴드 — 점수가 아니라 전사 신뢰도(오디오 명료도) proxy. */
export type ClarityBand = 'clear' | 'fair' | 'unclear' | 'unknown';

// 임계값 근거(스파이크 실측): 정발음 avg_logprob ≈ -0.42~-0.44, 인식 붕괴 ≈ -0.65.
const CLARITY_CLEAR = -0.5;
const CLARITY_FAIR = -0.62;

/**
 * Whisper verbose_json의 avg_logprob를 또렷함 밴드로 매핑한다.
 * 발음 정확도가 아니라 오디오/전사 신뢰도 신호임에 유의(ADR-0010). 값이 없으면 unknown.
 */
export function assessClarity(avgLogprob: number | null | undefined): ClarityBand {
  if (avgLogprob == null || Number.isNaN(avgLogprob)) return 'unknown';
  if (avgLogprob >= CLARITY_CLEAR) return 'clear';
  if (avgLogprob >= CLARITY_FAIR) return 'fair';
  return 'unclear';
}

export interface PronunciationFeedback {
  /** 핵심 단어 인식률 (0~100). 발음 점수가 아님 — scoreDrill 비율. */
  recognitionScore: number;
  passed: boolean;
  /** 인식된 목표 단어 (원형 그대로) */
  recognized: string[];
  /** 인식되지 않은 목표 단어 (원형 그대로) */
  missing: string[];
  /** 또렷함 — 전사 신뢰도 proxy. 발음 정확도 아님. */
  clarity: ClarityBand;
}

/**
 * 단어 인식(scoreDrill 위임) + 또렷함을 합쳐 정직한 발음 피드백을 만든다. 순수·결정적.
 * @param avgLogprob Whisper verbose_json의 segment 평균 logprob. 없으면 clarity=unknown.
 */
export function assessPronunciation(
  transcript: string,
  targetWords: string[],
  avgLogprob?: number | null,
  opts?: DrillScoreOptions,
): PronunciationFeedback {
  const drill = scoreDrill(transcript, targetWords, opts);
  const missingSet = new Set(drill.missing.map((w) => w.toLowerCase()));
  const recognized = targetWords.filter((w) => !missingSet.has(w.toLowerCase()));
  return {
    recognitionScore: drill.score,
    passed: drill.passed,
    recognized,
    missing: drill.missing,
    clarity: assessClarity(avgLogprob),
  };
}

/**
 * 발음 평가 seam — 향후 Azure Speech 음소평가가 같은 인터페이스로 드롭인된다.
 * Azure 구현은 PronunciationFeedback에 음소 단위 필드(phonemeScores 등)를 확장해 더한다.
 * 현재는 OpenAI 단독 한계로 음소 점수를 제공하지 않는다(ADR-0010).
 */
export interface PronunciationAssessor {
  assess(
    transcript: string,
    targetWords: string[],
    avgLogprob?: number | null,
    opts?: DrillScoreOptions,
  ): PronunciationFeedback;
}

/** 로컬(OpenAI 스택) 구현 — 정직한 최소 범위. */
export const localAssessor: PronunciationAssessor = {
  assess: assessPronunciation,
};
