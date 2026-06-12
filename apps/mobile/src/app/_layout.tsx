import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from '@ted-speak/shared';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const queryClient = new QueryClient();

export default function RootLayout() {
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
