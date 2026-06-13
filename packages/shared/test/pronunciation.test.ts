import { describe, expect, it } from 'vitest';

import {
  assessClarity,
  assessPronunciation,
  localAssessor,
  type ClarityBand,
} from '../src/pronunciation';

describe('assessClarity — avg_logprob → 또렷함 밴드 (ADR-0010, 점수 아님)', () => {
  it('정발음 수준(≥ -0.5)은 clear (스파이크 네이티브 ≈ -0.43)', () => {
    expect(assessClarity(-0.43)).toBe<ClarityBand>('clear');
    expect(assessClarity(-0.5)).toBe<ClarityBand>('clear');
    expect(assessClarity(0)).toBe<ClarityBand>('clear');
  });

  it('경계 구간(-0.5 ~ -0.62)은 fair', () => {
    expect(assessClarity(-0.55)).toBe<ClarityBand>('fair');
    expect(assessClarity(-0.62)).toBe<ClarityBand>('fair');
  });

  it('인식 붕괴 수준(< -0.62)은 unclear (스파이크 오류주입 ≈ -0.65)', () => {
    expect(assessClarity(-0.65)).toBe<ClarityBand>('unclear');
    expect(assessClarity(-1.2)).toBe<ClarityBand>('unclear');
  });

  it('값이 없으면(null/undefined/NaN) unknown — 텍스트 폴백 등', () => {
    expect(assessClarity(null)).toBe<ClarityBand>('unknown');
    expect(assessClarity(undefined)).toBe<ClarityBand>('unknown');
    expect(assessClarity(NaN)).toBe<ClarityBand>('unknown');
  });
});

describe('assessPronunciation — 정직한 단어 인식 + 또렷함 (scoreDrill 재사용)', () => {
  const target = ['like', 'listening', 'music'];

  it('모든 목표 단어 인식 → recognitionScore 100·passed·missing 없음', () => {
    const r = assessPronunciation('I like listening to music.', target, -0.4);
    expect(r.recognitionScore).toBe(100);
    expect(r.passed).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.recognized).toEqual(['like', 'listening', 'music']);
    expect(r.clarity).toBe<ClarityBand>('clear');
  });

  it('일부 누락 → missing/recognized 분리, recognitionScore 비율', () => {
    const r = assessPronunciation('I like to music.', target, -0.55);
    expect(r.missing).toEqual(['listening']);
    expect(r.recognized).toEqual(['like', 'music']);
    expect(r.recognitionScore).toBe(67);
    expect(r.passed).toBe(false);
    expect(r.clarity).toBe<ClarityBand>('fair');
  });

  it('avg_logprob 없으면 clarity unknown (텍스트 폴백 동선 보존)', () => {
    const r = assessPronunciation('I like listening to music.', target);
    expect(r.recognitionScore).toBe(100);
    expect(r.clarity).toBe<ClarityBand>('unknown');
  });

  it('대소문자·구두점 정규화는 scoreDrill과 동일하게 위임', () => {
    const r = assessPronunciation('  i LIKE Listening, to MUSIC!! ', target, -0.3);
    expect(r.recognitionScore).toBe(100);
    expect(r.missing).toEqual([]);
  });

  it('목표 단어가 비면 인식률 100 (콘텐츠 방어, scoreDrill 위임)', () => {
    const r = assessPronunciation('anything', [], -1);
    expect(r.recognitionScore).toBe(100);
    expect(r.recognized).toEqual([]);
    expect(r.clarity).toBe<ClarityBand>('unclear');
  });

  it('passThreshold 옵션을 scoreDrill로 전달한다', () => {
    const r = assessPronunciation('I like to music.', target, -0.4, { passThreshold: 60 });
    expect(r.passed).toBe(true);
  });
});

describe('PronunciationAssessor seam — Azure 음소평가 드롭인 자리', () => {
  it('localAssessor.assess는 assessPronunciation과 동일 결과', () => {
    const a = localAssessor.assess('I like music.', ['like', 'music'], -0.4);
    const b = assessPronunciation('I like music.', ['like', 'music'], -0.4);
    expect(a).toEqual(b);
  });
});
