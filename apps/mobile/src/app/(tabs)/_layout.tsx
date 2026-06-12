import { colors } from '@ted-speak/shared';
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tedDeep,
        tabBarInactiveTintColor: colors.ink40,
        tabBarStyle: { backgroundColor: colors.paper },
      }}>
      <Tabs.Screen name="home" options={{ title: '홈' }} />
      <Tabs.Screen name="tutor" options={{ title: 'AI 튜터' }} />
      <Tabs.Screen name="profile" options={{ title: '프로필' }} />
    </Tabs>
  );
}
