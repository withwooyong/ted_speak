/**
 * 대화 기록 목록 (P2 W5) — 본인 튜터 세션을 최신순으로 보여준다.
 * 데이터는 tutor-repo.listSessions()(기존 RLS select 재사용 — 신규 RPC 없음).
 */
import { useQuery } from '@tanstack/react-query';
import { findScenario } from '@ted-speak/content';
import { colors, radius } from '@ted-speak/shared';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { findTopic } from '@/lib/tutor-core';
import { getTutorRepo } from '@/lib/tutor';

/** 세션 topic(주제 id 또는 시나리오 id)을 사용자 노출 제목으로 변환 */
export function sessionTitle(topic: string): string {
  return findScenario(topic)?.title ?? findTopic(topic)?.title ?? '프리토킹';
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

export default function HistoryList() {
  const router = useRouter();
  // 데이터 로드는 TanStack Query로 (tutor.tsx/home.tsx 패턴 — effect 내 동기 setState 회피)
  const { data: sessions, isError } = useQuery({
    queryKey: ['tutor-history'],
    queryFn: async () => {
      const repo = getTutorRepo();
      return repo ? repo.listSessions() : [];
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

      {sessions === undefined && !isError && (
        <ActivityIndicator color={colors.ted} style={styles.loading} />
      )}

      {isError && <Text style={styles.empty}>기록을 불러오지 못했어요.</Text>}

      {sessions !== undefined && sessions.length === 0 && !isError && (
        <Text style={styles.empty}>아직 대화 기록이 없어요.{'\n'}AI 튜터와 대화를 나눠 보세요.</Text>
      )}

      {sessions !== undefined && sessions.length > 0 && (
        <ScrollView contentContainerStyle={styles.list}>
          {sessions.map((s) => {
            const goal = readGoal(s.summary);
            return (
              <Pressable
                key={s.id}
                style={styles.card}
                onPress={() => router.push(`/history/${s.id}`)}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{sessionTitle(s.topic)}</Text>
                  <Text style={styles.cardWhen}>{formatWhen(s.startedAt)}</Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.metaText}>
                    {s.status === 'completed'
                      ? `${Math.round(s.durationSeconds / 60)}분 · ${s.turnCount}턴`
                      : s.status === 'in_progress'
                        ? '진행 중'
                        : '중단됨'}
                  </Text>
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
  metaText: { color: colors.ink60, fontSize: 13, fontWeight: '600' },
  metaBadge: { color: colors.goldDeep, fontSize: 12, fontWeight: '800' },
  metaBadgeDone: { color: colors.mint },
});
