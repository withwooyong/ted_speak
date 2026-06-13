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
  const hydrating = useUserStore((s) => s.hydrating);

  if (status === 'signed_out') return <Redirect href="/login" />;
  // 서버 하이드레이트 완료 전에는 리다이렉트하지 않는다 — 온보딩 완료자를 온보딩으로 잘못 보내는 것 방지.
  if (hydrating) return null;
  if (!onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)/home" />;
}
