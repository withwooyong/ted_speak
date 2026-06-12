import { Redirect } from 'expo-router';

import { useUserStore } from '@/stores/user';

/** 온보딩 완료 여부에 따라 분기하는 진입점 */
export default function Index() {
  const onboarded = useUserStore((s) => s.onboarded);
  return <Redirect href={onboarded ? '/(tabs)/home' : '/onboarding'} />;
}
