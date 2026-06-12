/**
 * 인증 모드 결정 (T4) — RN 의존 없는 순수 로직.
 * Supabase 환경변수가 완전할 때만 supabase 모드, 아니면 Dev Mock Auth.
 *
 * dev: 어떤 경우에도 앱은 부팅 가능해야 한다 (p0-foundation 리스크 대응).
 * prod: 환경변수 누락 시 조용히 mock으로 폴백하면 "인증 없는 배포" 사고가 되므로 즉시 throw.
 */
export interface AuthEnv {
  url: string | undefined;
  anonKey: string | undefined;
}

export type AuthMode =
  | { mode: 'mock' }
  | { mode: 'supabase'; url: string; anonKey: string };

export function resolveAuthMode(
  { url, anonKey }: AuthEnv,
  opts: { isProd?: boolean } = {},
): AuthMode {
  const u = url?.trim();
  const k = anonKey?.trim();
  if (u && k) return { mode: 'supabase', url: u, anonKey: k };
  if (opts.isProd) {
    throw new Error(
      '프로덕션 빌드에 EXPO_PUBLIC_SUPABASE_URL/ANON_KEY가 없습니다 — mock 인증으로 배포할 수 없습니다.',
    );
  }
  return { mode: 'mock' };
}
