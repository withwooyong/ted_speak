import { colors, radius, type LessonStep } from '@ted-speak/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const STEP_LABELS: Record<LessonStep, string> = {
  1: '오늘의 수업 · LEARN',
  2: '스피킹 연습 · DRILL',
  3: '실전 대화 · CONVERSATION',
};

/**
 * 레슨 플레이어 — 3단계 상태 머신 스텁.
 * Learn/Drill/Conversation 실제 구현은 p0-foundation 이후 Phase 1 계획서의 과제.
 */
export default function LessonPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [step, setStep] = useState<LessonStep>(1);

  const next = () => {
    if (step < 3) setStep((step + 1) as LessonStep);
    else router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
        <View style={styles.progress}>
          {([1, 2, 3] as const).map((n) => (
            <View key={n} style={[styles.seg, n <= step && styles.segFill]} />
          ))}
        </View>
        <Text style={styles.stepTag}>STEP {step}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.eyebrow}>{STEP_LABELS[step]}</Text>
        <Text style={styles.title}>레슨 {id}</Text>
        <Text style={styles.sub}>이 단계의 UI·로직은 작업계획서 기반으로 구현됩니다.</Text>
      </View>

      <Pressable style={styles.cta} onPress={next}>
        <Text style={styles.ctaText}>{step < 3 ? '다음 단계' : '레슨 완료'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, padding: 24, paddingTop: 64 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  close: { color: colors.ink40, fontSize: 18 },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  seg: { flex: 1, height: 7, borderRadius: radius.pill, backgroundColor: colors.ink12 },
  segFill: { backgroundColor: colors.ted },
  stepTag: { color: colors.ted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  body: { flex: 1, justifyContent: 'center' },
  eyebrow: { color: colors.ted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 24, fontWeight: '800', marginTop: 8 },
  sub: { color: colors.ink60, fontSize: 14, marginTop: 10, lineHeight: 21 },
  cta: {
    backgroundColor: colors.ted,
    borderRadius: radius.button,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 24,
  },
  ctaText: { color: colors.paper, fontSize: 16, fontWeight: '700' },
});
