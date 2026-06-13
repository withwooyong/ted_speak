/**
 * WeeklyReportCard — 프로필 "최근 7일" 주간 스피킹 리포트 (P2 W6).
 *
 * 데이터는 기존 select RLS 재사용(신규 RPC·스키마 변경 없음):
 *  - 발화 시간·완료 레슨: progress-repo.listProgress() + 완료 튜터 세션 duration
 *  - 교정 TOP5: 기간 내 레슨·튜터 세션 턴의 corrections 빈도(N+1, 주간 세션 수 적음)
 * 집계는 순수 weekly-report.ts. 표시값은 모두 서버 측 불변값(ADR-0010 정직성 원칙).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, radius } from '@ted-speak/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getProgressRepo } from '@/lib/progress';
import { getTutorRepo } from '@/lib/tutor';
import { collectWeeklyReport, type CorrectionCount } from '@/lib/weekly-report';

export default function WeeklyReportCard() {
  const queryClient = useQueryClient();
  const { data: report, isError } = useQuery({
    queryKey: ['weekly-report'],
    queryFn: () => collectWeeklyReport({ progressRepo: getProgressRepo(), tutorRepo: getTutorRepo(), now: new Date() }),
  });

  // 레슨·튜터 완료 후 프로필 탭으로 복귀하면 최신 집계로 갱신한다(탭이 마운트 유지돼 자동 refetch 안 됨).
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['weekly-report'] });
    }, [queryClient]),
  );

  return (
    <View style={styles.card}>
      <Text style={styles.cardHeader}>최근 7일</Text>

      {report === undefined && !isError && <ActivityIndicator color={colors.ted} style={styles.loading} />}
      {isError && <Text style={styles.empty}>리포트를 불러오지 못했어요.</Text>}

      {report !== undefined && !isError && (
        <>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {Math.round(report.speakingSeconds / 60)}
                <Text style={styles.statUnit}>분</Text>
              </Text>
              <Text style={styles.statLabel}>발화 시간</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {report.completedLessons}
                <Text style={styles.statUnit}>개</Text>
              </Text>
              <Text style={styles.statLabel}>완료 레슨</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>자주 받은 교정 TOP5</Text>
          {report.topCorrections.length === 0 ? (
            <Text style={styles.empty}>이번 주 받은 교정이 아직 없어요.</Text>
          ) : (
            <View style={styles.corrList}>
              {report.topCorrections.map((c) => (
                <CorrectionRow key={`${c.original}→${c.suggested}`} item={c} />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function CorrectionRow({ item }: { item: CorrectionCount }) {
  return (
    <View style={styles.corrRow}>
      <Text style={styles.corrText} numberOfLines={1}>
        <Text style={styles.corrOriginal}>{item.original}</Text>
        <Text style={styles.corrArrow}> → </Text>
        <Text style={styles.corrSuggested}>{item.suggested}</Text>
      </Text>
      {item.count > 1 && <Text style={styles.corrCount}>{item.count}회</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.paper, borderRadius: radius.card, padding: 16, marginTop: 18 },
  cardHeader: { color: colors.ink, fontSize: 15, fontWeight: '800', marginBottom: 12 },
  loading: { marginVertical: 16 },
  statRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.canvas, borderRadius: radius.card - 8, padding: 12 },
  statValue: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  statUnit: { fontSize: 12, fontWeight: '700', color: colors.ink60 },
  statLabel: { color: colors.ink60, fontSize: 12, fontWeight: '600', marginTop: 2 },
  sectionLabel: { color: colors.ink60, fontSize: 12.5, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  empty: { color: colors.ink40, fontSize: 13, fontWeight: '500', paddingVertical: 8 },
  corrList: { gap: 8 },
  corrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  corrText: { flexShrink: 1, fontSize: 13.5 },
  corrOriginal: { color: colors.ink40, fontWeight: '600', textDecorationLine: 'line-through' },
  corrArrow: { color: colors.ink40, fontWeight: '700' },
  corrSuggested: { color: colors.tedDeep, fontWeight: '800' },
  corrCount: { color: colors.goldDeep, fontSize: 12, fontWeight: '800' },
});
