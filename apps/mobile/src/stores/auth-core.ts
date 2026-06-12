/**
 * 인증 상태 슬라이스 (T4) — zustand·RN 의존 없는 순수 로직 (단위 테스트 대상).
 * Supabase 세션 연동과 Dev Mock 로그인을 동일한 상태 모델로 다룬다.
 */
export interface AuthUser {
  id: string;
  email: string;
  /** Dev Mock 사용자 여부 — mock 데이터는 서버에 동기화하지 않는다 */
  isMock: boolean;
}

export type AuthStatus = 'signed_out' | 'signed_in';

export interface AuthSlice {
  user: AuthUser | null;
  status: AuthStatus;
  /** Supabase 미설정 환경(dev)에서만 노출되는 로그인 */
  signInMock: () => void;
  /** Supabase onAuthStateChange → 세션 반영 (null = 로그아웃) */
  setSession: (session: { userId: string; email: string } | null) => void;
  signOut: () => void;
}

const MOCK_USER: AuthUser = {
  id: 'mock-user-0001',
  email: 'dev@talkted.local',
  isMock: true,
};

export function createAuthSlice(set: (partial: Partial<AuthSlice>) => void): AuthSlice {
  return {
    user: null,
    status: 'signed_out',
    signInMock: () => set({ user: { ...MOCK_USER }, status: 'signed_in' }),
    setSession: (session) =>
      set(
        session
          ? { user: { id: session.userId, email: session.email, isMock: false }, status: 'signed_in' }
          : { user: null, status: 'signed_out' },
      ),
    signOut: () => set({ user: null, status: 'signed_out' }),
  };
}
