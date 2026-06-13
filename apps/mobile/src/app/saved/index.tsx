/**
 * 저장한 표현(복습 목록) (P2 W5) — 본인 saved_expressions를 최신순으로 보여주고 삭제한다.
 * 데이터는 saved-repo(본인 RLS select/delete).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, radius, type SavedExpression } from '@ted-speak/shared';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSavedRepo } from '@/lib/saved';

const TYPE_LABEL: Record<SavedExpression['type'], string> = {
  grammar: '문법',
  vocab: '어휘',
  pronunciation: '발음',
};

const SAVED_KEY = ['saved-expressions'];

export default function SavedList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // 데이터 로드는 TanStack Query로 (effect 내 동기 setState 회피)
  const { data: items, isError } = useQuery({
    queryKey: SAVED_KEY,
    queryFn: async () => {
      const repo = getSavedRepo();
      return repo ? repo.list() : [];
    },
  });

  const handleRemove = useCallback(
    async (id: string) => {
      const repo = getSavedRepo();
      if (!repo) return;
      // 낙관적 제거 — 캐시에서 즉시 제거
      queryClient.setQueryData<SavedExpression[]>(SAVED_KEY, (prev) =>
        prev ? prev.filter((e) => e.id !== id) : prev,
      );
      try {
        await repo.remove(id);
      } catch {
        // 실패 시 재조회해 일관성 회복
        void queryClient.invalidateQueries({ queryKey: SAVED_KEY });
      }
    },
    [queryClient],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.title}>저장한 표현</Text>
      </View>

      {items === undefined && !isError && <ActivityIndicator color={colors.ted} style={styles.loading} />}
      {isError && <Text style={styles.empty}>표현을 불러오지 못했어요.</Text>}
      {items !== undefined && items.length === 0 && !isError && (
        <Text style={styles.empty}>
          아직 저장한 표현이 없어요.{'\n'}대화 중 교정 칩을 길게 눌러 저장해 보세요.
        </Text>
      )}

      {items !== undefined && items.length > 0 && (
        <ScrollView contentContainerStyle={styles.list}>
          {items.map((e) => (
            <View key={e.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.typeBadge}>{TYPE_LABEL[e.type]}</Text>
                <Pressable onPress={() => handleRemove(e.id)} hitSlop={10}>
                  <Text style={styles.remove}>삭제</Text>
                </Pressable>
              </View>
              <Text style={styles.expr}>
                {e.original} → <Text style={styles.exprSuggest}>{e.suggested}</Text>
              </Text>
              {e.context ? <Text style={styles.context}>“{e.context}”</Text> : null}
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
  title: { color: colors.ink, fontSize: 24, fontWeight: '800' },
  loading: { marginTop: 40 },
  empty: { color: colors.ink40, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 60, paddingHorizontal: 24 },
  list: { padding: 24, gap: 12 },
  card: { backgroundColor: colors.paper, borderRadius: radius.card, padding: 16, borderWidth: 1, borderColor: colors.ink12, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeBadge: { color: colors.tedDeep, backgroundColor: colors.tedSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, fontSize: 11.5, fontWeight: '800', overflow: 'hidden' },
  remove: { color: colors.ink40, fontSize: 13, fontWeight: '700' },
  expr: { color: colors.ink60, fontSize: 16, lineHeight: 24 },
  exprSuggest: { color: colors.mint, fontWeight: '800' },
  context: { color: colors.ink40, fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
});
