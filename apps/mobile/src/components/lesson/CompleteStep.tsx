/**
 * CompleteStep (U7) — 완료 요약 화면 (프로토타입 #complete 구조).
 * 말한 문장 수, +XP, 발화 시간 칩 + 잘한 점 / 다음엔 이렇게.
 */
import { colors, radius } from '@ted-speak/shared';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LessonSummary } from '@/lib/lesson-core';

export interface CompleteStepProps {
  summary: LessonSummary;
  streak: number;
  onHome: () => void;
}

/** 초 → "N분" / "N초" 라벨 */
function speakingLabel(seconds: number): string {
  if (seconds >= 60) return `${Math.round(seconds / 60)}분`;
  return `${Math.round(seconds)}초`;
}

export function CompleteStep({ summary, streak, onHome }: CompleteStepProps) {
  return (
    <View style={styles.pane}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>레슨 완료! 🎉</Text>
        <Text style={styles.sub}>
          오늘 영어로 <Text style={styles.subBold}>{summary.sentencesSpoken}문장</Text>을 말했어요.
          {'\n'}Ted가 정리한 피드백을 확인해보세요.
        </Text>

        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={[styles.chipV, styles.gold]}>+{summary.xp}</Text>
            <Text style={styles.chipL}>XP 획득</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipV}>🔥 {streak}일</Text>
            <Text style={styles.chipL}>연속 학습</Text>
          </View>
          <View style={styles.chip}>
            <Text style={[styles.chipV, styles.mint]}>{speakingLabel(summary.speakingSeconds)}</Text>
            <Text style={styles.chipL}>발화 시간</Text>
          </View>
        </View>

        <View style={styles.fbBox}>
          <Text style={styles.fbHeading}>💪 잘한 점</Text>
          {summary.strengths.map((s, i) => (
            <Text key={i} style={styles.fbItem}>
              · {s}
            </Text>
          ))}
          {summary.improvements.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.fbHeading}>🎯 다음엔 이렇게</Text>
              {summary.improvements.map((s, i) => (
                <Text key={i} style={styles.fbItem}>
                  · {s}
                </Text>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <Pressable style={styles.cta} onPress={onHome}>
        <Text style={styles.ctaText}>홈으로 돌아가기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  scroll: { alignItems: 'center', paddingBottom: 16 },
  title: { color: colors.ink, fontSize: 27, fontWeight: '800', marginTop: 24 },
  sub: { color: colors.ink60, fontSize: 14.5, marginTop: 8, lineHeight: 23, textAlign: 'center' },
  subBold: { color: colors.ink, fontWeight: '800' },
  chipRow: { flexDirection: 'row', gap: 12, marginTop: 24, alignSelf: 'stretch' },
  chip: {
    flex: 1,
    backgroundColor: colors.paper,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
  },
  chipV: { fontSize: 22, fontWeight: '800', color: colors.ink },
  gold: { color: colors.goldDeep },
  mint: { color: colors.mint },
  chipL: { fontSize: 11.5, fontWeight: '600', color: colors.ink60, marginTop: 3 },
  fbBox: {
    alignSelf: 'stretch',
    marginTop: 18,
    backgroundColor: colors.paper,
    borderRadius: radius.card,
    padding: 20,
  },
  fbHeading: { fontSize: 13, fontWeight: '800', color: colors.ink, marginBottom: 10 },
  fbItem: { fontSize: 13.5, color: colors.ink60, lineHeight: 24 },
  divider: { height: 1, backgroundColor: colors.ink06, marginVertical: 16 },
  cta: {
    backgroundColor: colors.ted,
    borderRadius: radius.button,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 12,
  },
  ctaText: { color: colors.paper, fontSize: 16, fontWeight: '700' },
});
