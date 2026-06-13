/**
 * 대화 기록 상세 (P2 W5) — 세션 1건의 턴을 텍스트로 재생한다.
 * 데이터는 tutor-repo.getSessionTurns()(기존 RLS select 재사용). 교정 칩은 길게 눌러 저장 가능.
 */
import { useQuery } from '@tanstack/react-query';
import { colors, radius, type Correction } from '@ted-speak/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSaveExpression } from '@/hooks/use-save-expression';
import { getTutorRepo } from '@/lib/tutor';
import type { TutorSessionSummary, TutorTurnRow } from '@/lib/tutor-repo';

import { sessionTitle } from './index';

export default function HistoryDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { saveCorrection, isSaved } = useSaveExpression();

  // 데이터 로드는 TanStack Query로 (effect 내 동기 setState 회피)
  const { data, isError } = useQuery({
    queryKey: ['tutor-session', id],
    queryFn: async (): Promise<{ turns: TutorTurnRow[]; meta: TutorSessionSummary | undefined }> => {
      const repo = getTutorRepo();
      if (!repo || !id) return { turns: [], meta: undefined };
      const [turns, session] = await Promise.all([repo.getSessionTurns(id), repo.getSession(id)]);
      return { turns, meta: session ?? undefined };
    },
  });
  const turns = data?.turns;
  const meta = data?.meta;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ 대화 기록</Text>
        </Pressable>
        <Text style={styles.title}>{meta ? sessionTitle(meta.topic) : '대화'}</Text>
      </View>

      {turns === undefined && !isError && <ActivityIndicator color={colors.ted} style={styles.loading} />}
      {isError && <Text style={styles.empty}>대화를 불러오지 못했어요.</Text>}
      {turns !== undefined && turns.length === 0 && !isError && (
        <Text style={styles.empty}>저장된 대화 내용이 없어요.</Text>
      )}

      {turns !== undefined && turns.length > 0 && (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.hint}>교정 칩을 길게 누르면 복습 목록에 저장돼요.</Text>
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
