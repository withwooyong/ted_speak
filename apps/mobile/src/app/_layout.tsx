import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from '@ted-speak/shared';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { initAuthListener } from '@/stores/auth';

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
