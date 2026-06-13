/**
 * login-core.ts — 로그인 화면 순수 로직 (U8).
 * RN·Supabase 의존 없는 순수 함수 — 단위 테스트로 계약 고정.
 */
import type { AuthMode } from './auth-config';

const MIN_PASSWORD_LENGTH = 8;

// 형식 검증용 — 완벽한 RFC 5322가 아닌, 명백한 오타 차단용 보수적 패턴.
// local@domain.tld 형태(@ 1개, 도메인에 점·TLD 존재)를 요구한다.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Dev Mock 로그인 버튼 노출 가드.
 * mock 모드이면서 prod가 아닐 때만 노출 — prod에서 mock 로그인이 새어나가면
 * "인증 없는 접근" 사고가 되므로 차단한다 (HANDOFF Known Issue).
 */
export function canShowMockLogin(mode: AuthMode['mode'], isProd: boolean): boolean {
  return mode === 'mock' && !isProd;
}

export type EmailFormResult =
  | { ok: true }
  | { ok: false; field: 'email' | 'password'; message: string };

/**
 * 이메일/비밀번호 입력 검증. 이메일 오류를 비밀번호보다 먼저 지목한다.
 */
export function validateEmailForm(email: string, password: string): EmailFormResult {
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { ok: false, field: 'email', message: '이메일을 입력해 주세요.' };
  }
  if (!EMAIL_RE.test(trimmed)) {
    return { ok: false, field: 'email', message: '올바른 이메일 형식이 아닙니다.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      field: 'password',
      message: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`,
    };
  }
  return { ok: true };
}

export interface AuthErrorLike {
  message?: string;
  status?: number;
}

const GENERIC_MESSAGE = '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.';
const CREDENTIALS_MESSAGE = '이메일 또는 비밀번호가 올바르지 않습니다.';
const RATE_LIMIT_MESSAGE = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';

/**
 * 서버 인증 에러를 한국어 사용자 메시지로 변환한다.
 *
 * 보안: 서버 원문 메시지(스택 트레이스·내부 식별자 등)를 절대 반환값에 포함하지 않는다.
 * 미리 정의된 정적 문자열만 반환해 정보 노출을 차단한다.
 */
export function mapAuthError(error: AuthErrorLike | null | undefined): string {
  if (!error) return GENERIC_MESSAGE;

  const status = error.status;
  const raw = typeof error.message === 'string' ? error.message.toLowerCase() : '';

  if (status === 429 || raw.includes('too many requests') || raw.includes('rate limit')) {
    return RATE_LIMIT_MESSAGE;
  }
  if (status === 400 || raw.includes('invalid login credentials') || raw.includes('invalid credentials')) {
    return CREDENTIALS_MESSAGE;
  }
  return GENERIC_MESSAGE;
}
