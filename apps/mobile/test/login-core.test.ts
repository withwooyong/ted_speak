/**
 * login-core.test.ts — TDD red 단계
 * 대상(미존재): apps/mobile/src/lib/login-core.ts
 *
 * 로그인 화면 순수 로직 (U8)
 */

import { describe, expect, it } from 'vitest';

import {
  canShowMockLogin,
  mapAuthError,
  validateEmailForm,
} from '../src/lib/login-core';

// ─────────────────────────────────────────────────────────────────────────────
// canShowMockLogin
// ─────────────────────────────────────────────────────────────────────────────

describe('canShowMockLogin', () => {
  // 1-a. (mock, false) → true
  it('mock 모드이고 prod가 아니면 true를 반환한다', () => {
    expect(canShowMockLogin('mock', false)).toBe(true);
  });

  // 1-b. (mock, true) → false  (HANDOFF Known Issue: prod에서 mock 로그인 노출 방지)
  it('mock 모드이지만 prod이면 false를 반환한다 (보안 게이트)', () => {
    expect(canShowMockLogin('mock', true)).toBe(false);
  });

  // 1-c. (supabase, *) → false
  it('supabase 모드이고 prod가 아니어도 false를 반환한다', () => {
    expect(canShowMockLogin('supabase', false)).toBe(false);
  });

  it('supabase 모드이고 prod이면 false를 반환한다', () => {
    expect(canShowMockLogin('supabase', true)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateEmailForm
// ─────────────────────────────────────────────────────────────────────────────

describe('validateEmailForm', () => {
  // 2-a. 빈 이메일 → email 필드 오류
  it('이메일이 빈 문자열이면 email 필드 오류를 반환한다', () => {
    const result = validateEmailForm('', 'password123');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('email');
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('이메일이 공백만 있으면 email 필드 오류를 반환한다', () => {
    const result = validateEmailForm('   ', 'password123');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('email');
    }
  });

  // 2-b. 형식 오류 (@ 없음, 도메인 없음 등)
  it('@가 없는 이메일은 email 필드 오류를 반환한다', () => {
    const result = validateEmailForm('notanemail', 'password123');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('email');
    }
  });

  it('도메인이 없는 이메일(user@)은 email 필드 오류를 반환한다', () => {
    const result = validateEmailForm('user@', 'password123');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('email');
    }
  });

  it('TLD 없는 이메일(user@domain)은 email 필드 오류를 반환한다', () => {
    const result = validateEmailForm('user@domain', 'password123');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('email');
    }
  });

  // 2-c. 8자 미만 비밀번호 → password 필드 오류
  it('비밀번호가 빈 문자열이면 password 필드 오류를 반환한다', () => {
    const result = validateEmailForm('user@example.com', '');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('password');
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('비밀번호가 7자이면 password 필드 오류를 반환한다', () => {
    const result = validateEmailForm('user@example.com', '1234567');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('password');
    }
  });

  it('비밀번호가 1자이면 password 필드 오류를 반환한다', () => {
    const result = validateEmailForm('user@example.com', 'a');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('password');
    }
  });

  // 이메일 오류가 비밀번호 오류보다 먼저 체크된다
  it('이메일과 비밀번호 모두 오류면 email 필드를 먼저 지목한다', () => {
    const result = validateEmailForm('bad', '123');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('email');
    }
  });

  // 2-d. 정상 케이스 → ok: true
  it('유효한 이메일과 8자 이상 비밀번호면 ok: true를 반환한다', () => {
    const result = validateEmailForm('user@example.com', '12345678');
    expect(result.ok).toBe(true);
  });

  it('유효한 이메일과 긴 비밀번호도 ok: true를 반환한다', () => {
    const result = validateEmailForm('test.user+tag@subdomain.example.co.kr', 'verylongpassword!@#');
    expect(result.ok).toBe(true);
  });

  it('ok: true일 때 field와 message가 없다', () => {
    const result = validateEmailForm('user@example.com', 'password123');
    expect(result.ok).toBe(true);
    // ok: true 반환 객체에는 field, message 없음
    expect(result).not.toHaveProperty('field');
    expect(result).not.toHaveProperty('message');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapAuthError
// ─────────────────────────────────────────────────────────────────────────────

describe('mapAuthError', () => {
  // 3-a. 400/invalid credentials → 한국어 이메일/비밀번호 오류 메시지
  it('status 400이면 이메일 또는 비밀번호 관련 한국어 메시지를 반환한다', () => {
    const result = mapAuthError({ message: 'Invalid login credentials', status: 400 });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // 한국어 포함 여부 (이메일 또는 비밀번호 언급)
    expect(result).toMatch(/이메일|비밀번호/);
  });

  it('invalid credentials 메시지면 한국어 오류를 반환한다', () => {
    const result = mapAuthError({ message: 'invalid credentials' });
    expect(result).toMatch(/이메일|비밀번호/);
  });

  it('Invalid login credentials 메시지면 한국어 오류를 반환한다', () => {
    const result = mapAuthError({ message: 'Invalid login credentials' });
    expect(result).toMatch(/이메일|비밀번호/);
  });

  // 3-b. 429 → 잠시 후 재시도 안내
  it('status 429이면 재시도 안내 한국어 메시지를 반환한다', () => {
    const result = mapAuthError({ message: 'Too many requests', status: 429 });
    expect(typeof result).toBe('string');
    // 재시도 안내 포함
    expect(result).toMatch(/잠시|나중|다시/);
  });

  it('Too many requests 메시지면 재시도 안내를 반환한다', () => {
    const result = mapAuthError({ message: 'Too Many Requests' });
    expect(result).toMatch(/잠시|나중|다시/);
  });

  // 3-c. null/unknown → 일반 오류 문구
  it('null을 전달하면 일반 오류 문구를 반환한다', () => {
    const result = mapAuthError(null);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('빈 객체를 전달하면 일반 오류 문구를 반환한다', () => {
    const result = mapAuthError({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('알 수 없는 message를 전달하면 일반 오류 문구를 반환한다', () => {
    const result = mapAuthError({ message: 'some unknown server error xyz' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  // 서버 원문 메시지가 반환값에 포함되지 않음 (정보 노출 방지)
  it('서버 원문 메시지가 반환값에 포함되지 않는다 (정보 노출 방지)', () => {
    const rawMessage = 'INTERNAL-SERVER-ERROR-DETAIL-XYZ-12345';
    const result = mapAuthError({ message: rawMessage, status: 500 });
    expect(result).not.toContain(rawMessage);
  });

  it('400 에러의 서버 원문이 반환값에 포함되지 않는다', () => {
    const rawMessage = 'Invalid login credentials from DB_INTERNAL';
    const result = mapAuthError({ message: rawMessage, status: 400 });
    // 정제된 한국어 메시지만 나와야 함
    expect(result).not.toContain('DB_INTERNAL');
    expect(result).not.toContain(rawMessage);
  });

  it('429 에러의 서버 원문이 반환값에 포함되지 않는다', () => {
    const rawMessage = 'Rate limit exceeded at 2026-06-12T00:00:00Z server-node-42';
    const result = mapAuthError({ message: rawMessage, status: 429 });
    expect(result).not.toContain('server-node-42');
    expect(result).not.toContain(rawMessage);
  });

  it('500 에러의 서버 원문이 반환값에 포함되지 않는다', () => {
    const rawMessage = 'INTERNAL ERROR: stack trace /usr/lib/node_modules/supabase/auth.js:123';
    const result = mapAuthError({ message: rawMessage, status: 500 });
    expect(result).not.toContain('stack trace');
    expect(result).not.toContain(rawMessage);
  });

  // 모든 케이스에서 반환값은 비어있지 않은 문자열
  it('어떤 입력이든 비어있지 않은 문자열을 반환한다', () => {
    const cases = [
      null,
      {},
      { message: 'anything' },
      { status: 400 },
      { message: 'test', status: 500 },
    ];
    for (const c of cases) {
      const result = mapAuthError(c as Parameters<typeof mapAuthError>[0]);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
