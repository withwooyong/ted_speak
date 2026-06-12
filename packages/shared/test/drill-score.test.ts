import { describe, expect, it } from 'vitest';

import { scoreDrill } from '../src/drill-score';

describe('scoreDrill — 로컬 keyWords 매칭 (T2: LLM 없이 0ms 채점)', () => {
  const keyWords = ['like', 'listening', 'music'];

  it('모든 핵심 단어가 있으면 100점', () => {
    const r = scoreDrill('I like listening to music.', keyWords);
    expect(r.score).toBe(100);
    expect(r.passed).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('대소문자·구두점·공백 차이는 무시한다', () => {
    const r = scoreDrill('  i LIKE   Listening, to MUSIC!! ', keyWords);
    expect(r.score).toBe(100);
  });

  it('빠진 단어는 missing에 담고 비율로 감점한다', () => {
    const r = scoreDrill('I like to music.', keyWords); // listening 누락
    expect(r.missing).toEqual(['listening']);
    expect(r.score).toBe(67); // 2/3 반올림
    expect(r.passed).toBe(false); // 기본 임계 80
  });

  it('어형 변화 오답은 부분 일치로 인정하지 않는다 (listen ≠ listening)', () => {
    const r = scoreDrill('I like listen to music.', keyWords);
    expect(r.missing).toEqual(['listening']);
  });

  it('빈 전사는 0점', () => {
    const r = scoreDrill('', keyWords);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });

  it('keyWords가 비어 있으면 100점 처리 (콘텐츠 오류 방어)', () => {
    expect(scoreDrill('anything', []).score).toBe(100);
  });

  it('임계값을 조정할 수 있다', () => {
    const r = scoreDrill('I like to music.', keyWords, { passThreshold: 60 });
    expect(r.passed).toBe(true);
  });
});
