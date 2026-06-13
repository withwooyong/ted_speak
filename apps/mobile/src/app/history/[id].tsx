/**
 * 대화 기록 상세 (P2 W5 + W5b) — 세션 1건의 턴을 텍스트로 재생한다.
 * kind(lesson|tutor)에 따라 해당 저장소에서 읽는다(둘 다 기존 RLS select 재사용, 신규 RPC 없음).
 * 교정 칩은 길게 눌러 저장 가능(레슨·튜터 공용).
 */
import { useQuery } from '@tanstack/react-query';
import { colors, radius, type Correction } from '@ted-speak/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSaveExpression } from '@/hooks/use-save-expression';
import { getProgressRepo } from '@/lib/progress';
import { getTutorRepo } from '@/lib/tutor';

import { lessonTitle, sessionTitle } from './index';

/** order/role/transcript/corrections 동형 — 레슨·튜터 턴을 공통 렌더한다 */
interface HistoryTurn {
  order: number;
  role: 'user' | 'assistant';
  transcript: string;
  corrections: Correction[];
}

export default function HistoryDetail() {
  const router = useRouter();
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const { saveCorrection, isSaved } = useSaveExpression();
  const isLesson = kind === 'lesson';

  // 데이터 로드는 TanStack Query로 (effect 내 동기 setState 회피)
  const { data, isError } = useQuery({
    queryKey: ['history-session', kind, id],
    queryFn: async (): Promise<{ turns: HistoryTurn[]; title: string }> => {
      if (!id) return { turns: [], title: '대화' };
      if (isLesson) {
        const repo = getProgressRepo();
        if (!repo) return { turns: [], title: '대화' };
        const [turns, session] = await Promise.all([repo.getSessionTurns(id), repo.getSession(id)]);
        return { turns, title: session ? lessonTitle(session.lessonId) : '레슨' };
      }
      const repo = getTutorRepo();
      if (!repo) return { turns: [], title: '대화' };
      const [turns, session] = await Promise.all([repo.getSessionTurns(id), repo.getSession(id)]);
      return { turns, title: session ? sessionTitle(session.topic) : '대화' };
    },
  });
  const turns = data?.turns;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ 대화 기록</Text>
        </Pressable>
        <Text style={styles.title}>{data?.title ?? '대화'}</Text>
      </View>

      {turns === undefined && !isError && <ActivityIndicator color={colors.ted} style={styles.loading} />}
      {isError && <Text style={styles.empty}>대화를 불러오지 못했어요.</Text>}
      {turns !== undefined && turns.length === 0 && !isError && (
        <Text style={styles.empty}>저장된 대화 내용이 없어요.</Text>
      )}

      {turns !== undefined && turns.length > 0 && (
        <ScrollView contentContainerStyle={styles.list}>
          {turns.some((t) => t.corrections.length > 0) && (
            <Text style={styles.hint}>교정 칩을 길게 누르면 복습 목록에 저장돼요.</Text>
          )}
          {turns.map((t) => (
            <View key={t.order} style={t.role === 'assistant' ? styles.tedBubble : styles.userBubble}>
              <Text style={t.role === 'assistant' ? styles.tedLabel : styles.userLabel}>
                {t.role === 'assistant' ? 'Ted' : '나'}
              </Text>
              <Text style={styles.bubbleText}>{t.transcript}</Text>
              {t.corrections.length > 0 && (
                <View style={styles.corrections}>
                  {t.corrections.map((c: Correction, i) => {
                    const saved = isSaved(c);
                    return (
                      <Pressable
                        key={`c-${i}`}
                        onLongPress={() => saveCorrection(c, t.transcript)}
                        delayLongPress={300}>
                        <Text style={styles.correctionChip}>
                          {c.original} → <Text style={styles.correctionSuggest}>{c.suggested}</Text>
                          {saved ? ' ✓' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, paddingTop: 64 },
  header: { paddingHorizontal: 24, gap: 8, paddingBottom: 8 },
  back: { color: colors.tedDeep, fontSize: 15, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  loading: { marginTop: 40 },
  empty: { color: colors.ink40, fontSize: 15, textAlign: 'center', marginTop: 60 },
  list: { padding: 24, gap: 14 },
  hint: { color: colors.ink40, fontSize: 13, lineHeight: 20 },
  tedBubble: { backgroundColor: colors.tedSoft, borderRadius: radius.card, padding: 14, gap: 6 },
  userBubble: { backgroundColor: colors.paper, borderRadius: radius.card, padding: 14, borderWidth: 1, borderColor: colors.ink12, gap: 6, alignSelf: 'flex-end', maxWidth: '90%' },
  tedLabel: { color: colors.tedDeep, fontSize: 12, fontWeight: '800' },
  userLabel: { color: colors.ink60, fontSize: 12, fontWeight: '800' },
  bubbleText: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  corrections: { borderTopWidth: 1, borderTopColor: colors.ink12, paddingTop: 8, marginTop: 2, gap: 4 },
  correctionChip: { color: colors.ink60, fontSize: 14, paddingVertical: 2 },
  correctionSuggest: { color: colors.mint, fontWeight: '700' },
});
