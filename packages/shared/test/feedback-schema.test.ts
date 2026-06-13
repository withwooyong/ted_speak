/**
 * feedback-schema.test.ts — TDD red 단계
 * 대상(미구현): packages/shared/src/feedback-schema.ts의 clampReply / MAX_REPLY_CHARS
 *
 * HANDOFF 2b LOW — 스키마 .max() 하드 실패 대신 회복형 clamp 도입.
 * TTS 비용·재생 시간 상한을 보장하면서도 유효한 입력을 버리지 않는다.
 */

import { describe, expect, it } from 'vitest';

import {
  clampReply,
  MAX_REPLY_CHARS,
  SavedExpressionInputSchema,
  SavedExpressionSchema,
  type SavedExpression,
  type SavedExpressionInput,
} from '../src/feedback-schema';

describe('MAX_REPLY_CHARS 상수', () => {
  it('400이다 (TTS 비용·재생 시간 상한)', () => {
    expect(MAX_REPLY_CHARS).toBe(400);
  });
});

describe('clampReply — 회복형 절단 (HANDOFF 2b LOW)', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 불변 케이스
  // ─────────────────────────────────────────────────────────────────────────────

  it('길이 ≤ MAX_REPLY_CHARS이면 원문 그대로 반환한다 (trim도 하지 않음)', () => {
    const short = 'That sounds fun! What music do you like?  ';
    expect(clampReply(short)).toBe(short);
  });

  it('앞뒤 공백이 포함된 짧은 문자열은 공백까지 그대로 보존된다', () => {
    const withSpaces = '  Hello!  ';
    expect(clampReply(withSpaces)).toBe(withSpaces);
  });

  it('정확히 400자인 문자열은 변경 없이 반환된다', () => {
    // 200자 문장 2개 = 400자 (종결부호 포함)
    const exactly400 = 'A'.repeat(199) + '.' + 'B'.repeat(199) + '.';
    expect(exactly400).toHaveLength(400);
    expect(clampReply(exactly400)).toBe(exactly400);
  });

  it('빈 문자열은 빈 문자열 그대로 반환된다', () => {
    expect(clampReply('')).toBe('');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 문장 경계 절단
  // ─────────────────────────────────────────────────────────────────────────────

  it('초과 시 앞 MAX_REPLY_CHARS 글자 내 마지막 종결부호(.)에서 절단한다 (종결부호 포함)', () => {
    // "First sentence. Second sentence." + 나머지로 401자 이상 구성
    const first = 'A'.repeat(200) + '.'; // 201자 — 종결부호 있음
    const second = 'B'.repeat(200) + '.'; // 201자 — 종결부호 있음
    const input = first + ' ' + second; // 403자
    const result = clampReply(input);
    // 앞 400자 안의 마지막 종결부호는 first 끝 '.' (인덱스 200)
    expect(result).toBe(first);
    expect(result.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
  });

  it('느낌표(!)를 종결부호로 인식해 절단한다', () => {
    const exclaim = 'A'.repeat(100) + '!'; // 101자 — '!' 포함
    const rest = 'B'.repeat(350);           // 350자 — 합계 451자
    const input = exclaim + rest;
    const result = clampReply(input);
    expect(result.endsWith('!')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
  });

  it('물음표(?)를 종결부호로 인식해 절단한다', () => {
    const question = 'A'.repeat(100) + '?'; // 101자
    const rest = 'B'.repeat(350);
    const input = question + rest;
    const result = clampReply(input);
    expect(result.endsWith('?')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
  });

  it('여러 문장 중 마지막 종결부호 위치에서 절단한다', () => {
    // 앞 400자 안에 종결부호가 여러 개 있을 때 가장 뒤 것을 택한다
    const s1 = 'A'.repeat(99) + '.'; // 100자
    const s2 = 'B'.repeat(99) + '.'; // 100자
    const s3 = 'C'.repeat(99) + '.'; // 100자 — 인덱스 300에서 종결
    const rest = 'D'.repeat(200);    // 200자 추가 → 전체 600자
    const input = s1 + s2 + s3 + rest;
    const result = clampReply(input);
    // 앞 400자 안의 마지막 종결부호는 s3의 끝 '.' (인덱스 299)
    expect(result).toBe(s1 + s2 + s3);
    expect(result.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
  });

  it('절단 결과 끝 공백은 trimEnd된다', () => {
    // 종결부호 뒤에 공백이 오고 그 뒤가 잘린 경우
    const base = 'A'.repeat(199) + '. '; // 201자 — 종결부호 다음에 공백
    const rest = 'B'.repeat(300);
    const result = clampReply(base + rest);
    expect(result.endsWith(' ')).toBe(false);
    expect(result.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 종결부호 없는 초과 — 하드 절단
  // ─────────────────────────────────────────────────────────────────────────────

  it('앞 MAX_REPLY_CHARS 글자 안에 종결부호가 없으면 MAX_REPLY_CHARS에서 하드 절단한다', () => {
    const noPunct = 'X'.repeat(600); // 종결부호 없음
    const result = clampReply(noPunct);
    // trimEnd 후에도 길이는 MAX_REPLY_CHARS 이하 (공백 없으므로 정확히 400)
    expect(result.length).toBe(MAX_REPLY_CHARS);
    expect(result).toBe('X'.repeat(400));
  });

  it('하드 절단 후에도 길이 ≤ MAX_REPLY_CHARS를 보장한다', () => {
    const long = 'Y'.repeat(1000);
    const result = clampReply(long);
    expect(result.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 경계 케이스
  // ─────────────────────────────────────────────────────────────────────────────

  it('401번째 글자가 종결부호인 경우 — 앞 400자 안에는 없으므로 하드 절단된다', () => {
    // 인덱스 400 (401번째 글자)에 '.' 위치 → 앞 400자에 포함되지 않음
    const input = 'A'.repeat(400) + '.B'.repeat(10); // 인덱스 400이 '.'
    const result = clampReply(input);
    // 앞 400자 안에 종결부호 없으므로 하드 절단
    expect(result).toBe('A'.repeat(400));
    expect(result.length).toBe(MAX_REPLY_CHARS);
  });

  it('정확히 400번째 글자(인덱스 399)가 종결부호이면 그 위치까지 반환된다', () => {
    // 인덱스 399가 '.' → 앞 400자 내 마지막 종결부호
    const input = 'A'.repeat(399) + '.' + 'B'.repeat(100);
    const result = clampReply(input);
    expect(result).toBe('A'.repeat(399) + '.');
    expect(result.length).toBe(MAX_REPLY_CHARS);
  });

  it('비어있지 않은 입력에 대해 결과도 비어있지 않다', () => {
    expect(clampReply('Hello!')).not.toBe('');
    expect(clampReply('X'.repeat(500))).not.toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SavedExpression (W5) — Correction 재사용 단일 출처
// ─────────────────────────────────────────────────────────────────────────────

describe('SavedExpressionInputSchema — 저장 입력(교정 스냅샷)', () => {
  it('Correction 필드 + 선택 context를 파싱한다', () => {
    const input: SavedExpressionInput = {
      original: 'I go to school yesterday',
      suggested: 'I went to school yesterday',
      type: 'grammar',
      context: 'I go to school yesterday with my friend',
    };
    expect(SavedExpressionInputSchema.parse(input)).toEqual(input);
  });

  it('context는 선택이다(없어도 통과)', () => {
    const parsed = SavedExpressionInputSchema.parse({
      original: 'kid',
      suggested: 'child',
      type: 'vocab',
    });
    expect(parsed.context).toBeUndefined();
    expect(parsed.suggested).toBe('child');
  });

  it('type은 Correction enum을 재사용한다(grammar/vocab/pronunciation만)', () => {
    expect(() =>
      SavedExpressionInputSchema.parse({ original: 'a', suggested: 'b', type: 'spelling' }),
    ).toThrow();
    for (const type of ['grammar', 'vocab', 'pronunciation'] as const) {
      expect(SavedExpressionInputSchema.parse({ original: 'a', suggested: 'b', type }).type).toBe(type);
    }
  });

  it('original/suggested 누락은 거부한다', () => {
    expect(() => SavedExpressionInputSchema.parse({ suggested: 'b', type: 'grammar' })).toThrow();
    expect(() => SavedExpressionInputSchema.parse({ original: 'a', type: 'grammar' })).toThrow();
  });
});

describe('SavedExpressionSchema — 저장된 표현(id·createdAt 포함)', () => {
  it('입력에 id·createdAt이 추가된 형태를 파싱한다', () => {
    const saved: SavedExpression = {
      id: 'se-1',
      original: 'I go to school yesterday',
      suggested: 'I went to school yesterday',
      type: 'grammar',
      context: undefined,
      createdAt: '2026-06-13T01:00:00.000Z',
    };
    expect(SavedExpressionSchema.parse(saved)).toMatchObject({ id: 'se-1', type: 'grammar' });
  });

  it('빈 id는 거부한다', () => {
    expect(() =>
      SavedExpressionSchema.parse({
        id: '',
        original: 'a',
        suggested: 'b',
        type: 'grammar',
        createdAt: '2026-06-13T01:00:00.000Z',
      }),
    ).toThrow();
  });
});
