import { courses } from '@ted-speak/content';
import { colors, radius } from '@ted-speak/shared';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useUserStore } from '@/stores/user';

export default function Home() {
  const router = useRouter();
  const { streak, xp } = useUserStore();

  // MVP: 첫 코스의 첫 미완료 레슨 = 오늘의 레슨 (진행 저장은 T4 이후)
  const course = courses.at(0);
  const lesson = course?.lessons.at(0);

  if (!course || !lesson) {
    return (
      <View style={styles.container}>
        <Text style={styles.greet}>레슨을 불러오지 못했어요</Text>
        <Text style={styles.softNote}>콘텐츠가 비어 있어요. 앱을 다시 시작해보세요.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.greet}>좋은 하루예요! 👋</Text>
        <View style={styles.streakPill}>
          <Text style={styles.streakText}>🔥 {streak}</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>오늘의 레슨 — {course.title}</Text>
      <Pressable style={styles.lessonCard} onPress={() => router.push(`/lesson/${lesson.id}`)}>
        <Text style={styles.badge}>
          LESSON {lesson.order} · 약 {lesson.estimatedMinutes}분
        </Text>
        <Text style={styles.lessonTitle}>{lesson.title}</Text>
        <Text style={styles.lessonEn}>{lesson.titleEn}</Text>
      </Pressable>

      <Text style={styles.softNote}>무료 플랜은 하루 1개 레슨을 학습할 수 있어요. (XP {xp})</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, padding: 24, paddingTop: 72 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greet: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  streakPill: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  streakText: { fontWeight: '800', fontSize: 15, color: '#B07400' },
  sectionLabel: { color: colors.ink, fontSize: 14, fontWeight: '800', marginTop: 28, marginBottom: 10 },
  lessonCard: { backgroundColor: colors.ink, borderRadius: radius.cardLg, padding: 22 },
  badge: { color: '#FFB48A', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  lessonTitle: { color: colors.paper, fontSize: 21, fontWeight: '800', marginTop: 10 },
  lessonEn: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontStyle: 'italic', marginTop: 4 },
  softNote: { color: colors.ink40, fontSize: 12, textAlign: 'center', marginTop: 16 },
});
