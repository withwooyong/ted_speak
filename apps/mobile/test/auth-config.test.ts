import { describe, expect, it } from 'vitest';

import { resolveAuthMode } from '../src/lib/auth-config';

describe('resolveAuthMode — Supabase 미설정 시 Dev Mock Auth (T4)', () => {
  it('URL과 anon key가 모두 있으면 supabase 모드', () => {
    expect(
      resolveAuthMode({ url: 'http://127.0.0.1:54321', anonKey: 'anon-key' }),
    ).toEqual({ mode: 'supabase', url: 'http://127.0.0.1:54321', anonKey: 'anon-key' });
  });

  it('환경변수가 없으면 mock 모드 (앱은 항상 부팅 가능해야 한다)', () => {
    expect(resolveAuthMode({ url: undefined, anonKey: undefined })).toEqual({ mode: 'mock' });
  });

  it('둘 중 하나만 있으면 mock 모드로 폴백 (불완전 설정 방어)', () => {
    expect(resolveAuthMode({ url: 'http://x', anonKey: undefined }).mode).toBe('mock');
    expect(resolveAuthMode({ url: undefined, anonKey: 'k' }).mode).toBe('mock');
  });

  it('빈 문자열·공백 문자열은 미설정으로 취급한다', () => {
    expect(resolveAuthMode({ url: '', anonKey: '' }).mode).toBe('mock');
    expect(resolveAuthMode({ url: 'http://x', anonKey: '   ' }).mode).toBe('mock');
  });

  it('프로덕션에서 미설정이면 mock 폴백 대신 throw (배포 사고 방지)', () => {
    expect(() => resolveAuthMode({ url: undefined, anonKey: undefined }, { isProd: true })).toThrow(
      /프로덕션/,
    );
  });

  it('프로덕션이라도 완전 설정이면 supabase 모드', () => {
    expect(resolveAuthMode({ url: 'https://x.supabase.co', anonKey: 'k' }, { isProd: true }).mode).toBe(
      'supabase',
    );
  });
});
