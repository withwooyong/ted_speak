import { colors, radius } from '@ted-speak/shared';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useUserStore } from '@/stores/user';

/**
 * 온보딩 — 목표·레벨·일일 목표·마이크 권한 (4단계).
 * 스캐폴딩 단계: 단일 화면 스텁. 실제 4단계 플로우는 p0-foundation 계획서의 과제.
 */
export default function Onboarding() {
  const router = useRouter();
  const completeOnboarding = useUserStore((s) => s.completeOnboarding);

  const skipWithDefaults = () => {
    completeOnboarding({ goal: 'daily', level: 'A2', dailyGoalMinutes: 10, micGranted: false });
    router.replace('/(tabs)/home');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>ONBOARDING</Text>
      <Text style={styles.title}>어떤 영어가{'\n'}필요하세요?</Text>
      <Text style={styles.sub}>목표 → 레벨 → 일일 목표 → 마이크 권한 (구현 예정)</Text>
      <Pressable style={styles.cta} onPress={skipWithDefaults}>
        <Text style={styles.ctaText}>기본값으로 시작하기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, padding: 24, justifyContent: 'center' },
  eyebrow: { color: colors.ted, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '800', lineHeight: 38, marginTop: 8 },
  sub: { color: colors.ink60, fontSize: 14, marginTop: 12, lineHeight: 21 },
  cta: {
    backgroundColor: colors.ted,
    borderRadius: radius.button,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 32,
  },
  ctaText: { color: colors.paper, fontSize: 16, fontWeight: '700' },
});
