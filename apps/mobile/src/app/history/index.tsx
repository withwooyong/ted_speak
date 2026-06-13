/**
 * 대화 기록 목록 (P2 W5 + W5b) — 본인 레슨·튜터 세션을 최신순으로 통합해 보여준다.
 * 데이터는 tutor-repo.listSessions() + progress-repo.listSessions()(둘 다 기존 RLS select 재사용,
 * 신규 RPC 없음) → mergeHistory()로 시간순 병합. 카드에 종류 배지(레슨/AI 튜터).
 */
import { useQuery } from '@tanstack/react-query';
import { findLesson, findScenario } from '@ted-speak/content';
import { colors, radius } from '@ted-speak/shared';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getProgressRepo } from '@/lib/progress';
import { mergeHistory, type HistoryItem } from '@/lib/history';
import { findTopic } from '@/lib/tutor-core';
import { getTutorRepo } from '@/lib/tutor';

/** 튜터 세션 topic(주제 id 또는 시나리오 id)을 사용자 노출 제목으로 변환 */
export function sessionTitle(topic: string): string {
  return findScenario(topic)?.title ?? findTopic(topic)?.title ?? '프리토킹';
}

/** 레슨 id를 사용자 노출 제목으로 변환 */
export function lessonTitle(lessonId: string): string {
  return findLesson(lessonId)?.lesson.title ?? '레슨';
}

/** 기록 1건의 화면 제목 */
function historyTitle(item: HistoryItem): string {
  return item.kind === 'tutor' ? sessionTitle(item.session.topic) : lessonTitle(item.session.lessonId);
}

/** ISO 시각 → KST 날짜·시간 라벨 */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** summary에서 목표 달성(롤플레이)을 방어적으로 읽는다 */
function readGoal(summary: unknown): { met: number; total: number } | null {
  if (typeof summary !== 'object' || summary === null) return null;
  const goal = (summary as { goal?: unknown }).goal;
  if (typeof goal !== 'object' || goal === null) return null;
  const { met, total } = goal as { met?: unknown; total?: unknown };
  if (typeof met === 'number' && typeof total === 'number') return { met, total };
  return null;
}

/** 카드 메타 라벨(상태·시간·턴수) */
function metaLabel(item: HistoryItem): string {
  if (item.kind === 'tutor') {
    const s = item.session;
    if (s.status === 'completed') return `${Math.round(s.durationSeconds / 60)}분 · ${s.turnCount}턴`;
    return s.status === 'in_progress' ? '진행 중' : '중단됨';
  }
  return item.session.status === 'completed' ? '완료' : '진행 중';
}

export default function HistoryList() {
  const router = useRouter();
  // 데이터 로드는 TanStack Query로 (tutor.tsx/home.tsx 패턴 — effect 내 동기 setState 회피)
  const { data: items, isError } = useQuery({
    queryKey: ['history'],
    queryFn: async (): Promise<HistoryItem[]> => {
      const tutorRepo = getTutorRepo();
      const lessonRepo = getProgressRepo();
      const [tutor, lesson] = await Promise.all([
        tutorRepo ? tutorRepo.listSessions() : Promise.resolve([]),
        lessonRepo ? lessonRepo.listSessions() : Promise.resolve([]),
      ]);
      return mergeHistory(tutor, lesson);
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.title}>대화 기록</Text>
      </View>

      {items === undefined && !isError && (
        <ActivityIndicator color={colors.ted} style={styles.loading} />
      )}

      {isError && <Text style={styles.empty}>기록을 불러오지 못했어요.</Text>}

      {items !== undefined && items.length === 0 && !isError && (
        <Text style={styles.empty}>아직 대화 기록이 없어요.{'\n'}레슨이나 AI 튜터와 대화를 나눠 보세요.</Text>
      )}

      {items !== undefined && items.length > 0 && (
        <ScrollView contentContainerStyle={styles.list}>
          {items.map((item) => {
            const s = item.session;
            const goal = item.kind === 'tutor' ? readGoal(s.summary) : null;
            return (
              <Pressable
                key={`${item.kind}-${s.id}`}
                style={styles.card}
                onPress={() => router.push(`/history/${s.id}?kind=${item.kind}`)}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{historyTitle(item)}</Text>
                  <Text style={styles.cardWhen}>{formatWhen(s.startedAt)}</Text>
                </View>
                <View style={styles.cardMeta}>
                  <View style={styles.metaLeft}>
                    <Text style={item.kind === 'lesson' ? styles.kindLesson : styles.kindTutor}>
                      {item.kind === 'lesson' ? '레슨' : 'AI 튜터'}
                    </Text>
                    <Text style={styles.metaText}>{metaLabel(item)}</Text>
                  </View>
                  {goal && (
                    <Text style={[styles.metaBadge, goal.met === goal.total && styles.metaBadgeDone]}>
                      목표 {goal.met}/{goal.total}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, paddingTop: 64 },
  header: { paddingHorizontal: 24, gap: 8, paddingBottom: 8 },
  back: { color: colors.tedDeep, fontSize: 15, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 24, fontWeight: '800' },
  loading: { marginTop: 40 },
  empty: { color: colors.ink40, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 60, paddingHorizontal: 24 },
  list: { padding: 24, gap: 12 },
  card: { backgroundColor: colors.paper, borderRadius: radius.card, padding: 16, borderWidth: 1, borderColor: colors.ink12, gap: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  cardWhen: { color: colors.ink40, fontSize: 12, fontWeight: '600' },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kindLesson: { color: colors.tedDeep, fontSize: 11, fontWeight: '800', backgroundColor: colors.tedSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  kindTutor: { color: colors.goldDeep, fontSize: 11, fontWeight: '800', backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  metaText: { color: colors.ink60, fontSize: 13, fontWeight: '600' },
  metaBadge: { color: colors.goldDeep, fontSize: 12, fontWeight: '800' },
  metaBadgeDone: { color: colors.mint },
});
