import { colors, radius } from '@ted-speak/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import WeeklyReportCard from '@/components/profile/WeeklyReportCard';
import { getSavedRepo } from '@/lib/saved';
import { signOut, useAuthStore } from '@/stores/auth';
import { useUserStore } from '@/stores/user';

const GOAL_LABEL: Record<string, string> = {
  daily: '일상 회화',
  business: '비즈니스',
  travel: '여행',
};

export default function Profile() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { streak, xp, todaySpeakingSeconds, level, goal, dailyGoalMinutes } = useUserStore();
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // 화면에 들어올 때마다 저장한 표현 개수를 갱신(저장/삭제 후 복귀 반영)
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        const repo = getSavedRepo();
        if (!repo) return;
        try {
          const list = await repo.list();
          if (alive) setSavedCount(list.length);
        } catch {
          // 무시 — 카운트 표시는 부가 정보
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <View style={styles.who}>
          <Text style={styles.email}>{user?.email ?? '게스트'}</Text>
          {user?.isMock && (
            <View style={styles.mockBadge}>
              <Text style={styles.mockBadgeText}>DEV MOCK</Text>
            </View>
          )}
        </View>
        <View style={styles.levelChip}>
          <Text style={styles.levelChipText}>{level ?? '미설정'}</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <Stat value={`${Math.round(todaySpeakingSeconds / 60)}`} unit="분" label="오늘 발화" />
        <Stat value={`${xp}`} unit=" XP" label="경험치" />
        <Stat value={`🔥 ${streak}`} unit="" label="streak" />
      </View>

      <WeeklyReportCard />

      <View style={styles.infoBox}>
        <InfoRow label="학습 목표" value={goal ? (GOAL_LABEL[goal] ?? goal) : '미설정'} />
        <InfoRow label="레벨" value={level ?? '미설정'} />
        <InfoRow
          label="일일 목표"
          value={dailyGoalMinutes ? `${dailyGoalMinutes}분` : '미설정'}
        />
      </View>

      <View style={styles.menu}>
        <Pressable style={styles.menuRow} onPress={() => router.push('/history')}>
          <Text style={styles.menuLabel}>대화 기록</Text>
          <Text style={styles.menuChevron}>›</Text>
        </Pressable>
        <View style={styles.menuDivider} />
        <Pressable style={styles.menuRow} onPress={() => router.push('/saved')}>
          <Text style={styles.menuLabel}>저장한 표현</Text>
          <View style={styles.menuRight}>
            {savedCount !== null && <Text style={styles.menuCount}>{savedCount}</Text>}
            <Text style={styles.menuChevron}>›</Text>
          </View>
        </Pressable>
      </View>

      <Pressable style={styles.signOut} onPress={handleSignOut}>
        <Text style={styles.signOutText}>로그아웃</Text>
      </Pressable>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, padding: 24, paddingTop: 72 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  email: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  mockBadge: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mockBadgeText: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  levelChip: {
    backgroundColor: colors.tedSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  levelChipText: { color: colors.tedDeep, fontSize: 13, fontWeight: '800' },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  stat: { flex: 1, backgroundColor: colors.paper, borderRadius: radius.card - 4, padding: 14 },
  statValue: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  statUnit: { fontSize: 12, fontWeight: '700', color: colors.ink60 },
  statLabel: { color: colors.ink60, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  infoBox: {
    backgroundColor: colors.paper,
    borderRadius: radius.card,
    padding: 6,
    marginTop: 18,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  infoLabel: { color: colors.ink60, fontSize: 14, fontWeight: '600' },
  infoValue: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  menu: {
    backgroundColor: colors.paper,
    borderRadius: radius.card,
    marginTop: 12,
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  menuDivider: { height: 1, backgroundColor: colors.ink12, marginHorizontal: 18 },
  menuLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuCount: { color: colors.tedDeep, fontSize: 14, fontWeight: '800' },
  menuChevron: { color: colors.ink40, fontSize: 20, fontWeight: '700' },
  signOut: {
    marginTop: 'auto',
    borderRadius: radius.button,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.ink12,
  },
  signOutText: { color: colors.tedDeep, fontSize: 15, fontWeight: '700' },
});
