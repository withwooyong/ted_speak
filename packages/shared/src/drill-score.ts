export interface DrillScoreOptions {
  /** 통과 점수 (기본 80) */
  passThreshold?: number;
}

export interface DrillScore {
  /** 0~100, 핵심 단어 포함 비율 */
  score: number;
  passed: boolean;
  /** 전사에서 빠진 핵심 단어 (원형 그대로) */
  missing: string[];
}

const normalizeWords = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );

/**
 * Drill 채점 — 핵심 단어(keyWords) 완전 일치 비율 (T2: LLM 없이 로컬 0ms).
 * 어형 변화(listen ≠ listening)는 오답 처리해 모범 발음 재시도를 유도한다.
 */
export function scoreDrill(
  transcript: string,
  keyWords: string[],
  opts: DrillScoreOptions = {},
): DrillScore {
  const threshold = opts.passThreshold ?? 80;
  if (keyWords.length === 0) return { score: 100, passed: true, missing: [] };

  const words = normalizeWords(transcript);
  const missing = keyWords.filter((k) => !words.has(k.toLowerCase()));
  const score = Math.round(((keyWords.length - missing.length) / keyWords.length) * 100);
  return { score, passed: score >= threshold, missing };
}
