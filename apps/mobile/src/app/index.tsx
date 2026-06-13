import { Redirect } from 'expo-router';

import { useAuthStore } from '@/stores/auth';
import { useUserStore } from '@/stores/user';

/**
 * 진입 라우팅 — 인증 상태와 온보딩 완료 여부로 분기한다.
 *
 *  - signed_out                  → /login (mock 모드도 "개발용 로그인" 버튼을 거치도록 로그인 화면 경유)
 *  - signed_in && !onboarded     → /onboarding
 *  - signed_in && onboarded      → /(tabs)/home
 */
export default function Index() {
  const status = useAuthStore((s) => s.status);
  const onboarded = useUserStore((s) => s.onboarded);

  if (status === 'signed_out') return <Redirect href="/login" />;
  if (!onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)/home" />;
}
