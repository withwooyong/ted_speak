import { courses } from '@ted-speak/content';
import { colors, radius } from '@ted-speak/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getProgressRepo } from '@/lib/progress';
import { useUserStore } from '@/stores/user';

const PROGRESS_KEY = ['progress', 'home'] as const;

/** 진행 저장소를 조회해 완료 레슨 id 집합 + 오늘 완료 여부를 한 번에 가져온다. */
async function fetchProgress(): Promise<{ completed: string[]; completedToday: boolean }> {
  const repo = getProgressRepo();
  if (!repo) return { completed: [], completedToday: false }; // 미로그인/repo 없음 → 빈 상태
  const [completed, completedToday] = await Promise.all([
    repo.getCompletedLessonIds(),
    repo.isLessonCompletedToday(),
  ]);
  return { completed, completedToday };
}

export default function Home() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { streak, xp } = useUserStore();

  const { data } = useQuery({
    queryKey: PROGRESS_KEY,
    queryFn: fetchProgress,
  });

  // 레슨 화면에서 돌아올 때 진행 상태를 재조회한다.
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: PROGRESS_KEY });
    }, [queryClient]),
  );

  const completed = data?.completed ?? [];
  const completedToday = data?.completedToday ?? false;

  const course = courses.at(0);
  const lessons = [...(course?.lessons ?? [])].sort((a, b) => a.order - b.order);
  const completedSet = new Set(completed);
  const nextLesson = lessons.find((l) => !completedSet.has(l.id));

  if (!course) {
    return (
      <View style={styles.container}>
        <Text style={styles.greet}>레슨을 불러오지 못했어요</Text>
        <Text style={styles.softNote}>콘텐츠가 비어 있어요. 앱을 다시 시작해보세요.</Text>
      </View>
    );
  }

  const allDone = !nextLesson;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <Text style={styles.greet}>좋은 하루예요! 👋</Text>
        <View style={styles.streakPill}>
          <Text style={styles.streakText}>🔥 {streak}</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <Stat value={`${xp}`} unit=" XP" label="누적 경험치" />
        <Stat value={`${completed.length}`} unit="개" label="완료 레슨" />
      </View>

      <Text style={styles.sectionLabel}>오늘의 레슨 — {course.title}</Text>

      {allDone ? (
        <View style={styles.doneCard}>
          <Text style={styles.doneEmoji}>🎉</Text>
          <Text style={styles.doneTitle}>코스를 모두 끝냈어요!</Text>
          <Text style={styles.doneSub}>새 코스가 곧 추가될 거예요. 정말 잘했어요.</Text>
        </View>
      ) : completedToday ? (
        // 소프트 제한 — 일 1레슨. 카드 비활성 + 안내.
        <View style={[styles.lessonCard, styles.lessonCardLocked]}>
          <Text style={styles.badge}>오늘의 학습 완료</Text>
          <Text style={styles.lockTitle}>오늘 레슨 완료! 내일 또 만나요 🌙</Text>
          <Text style={styles.lockSub}>무료 플랜은 하루 1개 레슨을 학습할 수 있어요.</Text>
        </View>
      ) : (
        <Pressable
          style={styles.lessonCard}
          onPress={() => router.push(`/lesson/${nextLesson.id}`)}>
          <Text style={styles.badge}>
            LESSON {nextLesson.order} · 약 {nextLesson.estimatedMinutes}분
          </Text>
          <Text style={styles.lessonTitle}>{nextLesson.title}</Text>
          <Text style={styles.lessonEn}>{nextLesson.titleEn}</Text>
        </Pressable>
      )}

      <Text style={styles.sectionLabel}>레슨 목록</Text>
      <View style={styles.list}>
        {lessons.map((l) => {
          const done = completedSet.has(l.id);
          return (
            <View key={l.id} style={styles.listRow}>
              <Text style={styles.listCheck}>{done ? '✅' : '⚪️'}</Text>
              <View style={styles.listText}>
                <Text style={styles.listTitle}>{l.title}</Text>
                <Text style={styles.listEn}>{l.titleEn}</Text>
              </View>
              <Text style={styles.listOrder}>{l.order}</Text>
            </View>
          );
        })}
      </View>

      {!completedToday && !allDone && (
        <Text style={styles.softNote}>무료 플랜은 하루 1개 레슨을 학습할 수 있어요.</Text>
      )}
    </ScrollView>
  );
}

function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>
        {value}
        <Text style={styles.statUnit}>{unit}</Text>
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 24, paddingTop: 72, paddingBottom: 40 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greet: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  streakPill: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  streakText: { fontWeight: '800', fontSize: 15, color: colors.gold },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  stat: { flex: 1, backgroundColor: colors.paper, borderRadius: radius.card - 4, padding: 14 },
  statValue: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  statUnit: { fontSize: 13, fontWeight: '700', color: colors.ink60 },
  statLabel: { color: colors.ink60, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  sectionLabel: { color: colors.ink, fontSize: 14, fontWeight: '800', marginTop: 28, marginBottom: 10 },
  lessonCard: { backgroundColor: colors.ink, borderRadius: radius.cardLg, padding: 22 },
  lessonCardLocked: { backgroundColor: colors.ink06 },
  badge: { color: colors.tedTint, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  lessonTitle: { color: colors.paper, fontSize: 21, fontWeight: '800', marginTop: 10 },
  lessonEn: { color: colors.onDark65, fontSize: 14, fontStyle: 'italic', marginTop: 4 },
  lockTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 10 },
  lockSub: { color: colors.ink60, fontSize: 13, marginTop: 6 },
  doneCard: {
    backgroundColor: colors.mintSoft,
    borderRadius: radius.cardLg,
    padding: 24,
    alignItems: 'center',
  },
  doneEmoji: { fontSize: 40 },
  doneTitle: { color: colors.ink, fontSize: 19, fontWeight: '800', marginTop: 8 },
  doneSub: { color: colors.ink60, fontSize: 13, marginTop: 6, textAlign: 'center' },
  list: { backgroundColor: colors.paper, borderRadius: radius.card, padding: 6 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12 },
  listCheck: { fontSize: 18, marginRight: 12 },
  listText: { flex: 1 },
  listTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  listEn: { color: colors.ink40, fontSize: 12.5, fontStyle: 'italic', marginTop: 2 },
  listOrder: { color: colors.ink40, fontSize: 13, fontWeight: '700' },
  softNote: { color: colors.ink40, fontSize: 12, textAlign: 'center', marginTop: 16 },
});
