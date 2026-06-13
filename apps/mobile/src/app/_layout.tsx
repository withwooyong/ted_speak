import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from '@ted-speak/shared';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { initAuthListener } from '@/stores/auth';
// 사이드이펙트 import — auth 스토어 구독을 등록해 실로그인 시 서버 profiles를 하이드레이트한다.
import '@/lib/profile-sync';

const queryClient = new QueryClient();

export default function RootLayout() {
  useEffect(() => initAuthListener(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      />
      <StatusBar style="dark" />
    </QueryClientProvider>
  );
}
