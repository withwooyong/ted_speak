import { colors, radius } from '@ted-speak/shared';
import { StyleSheet, Text, View } from 'react-native';

import { useUserStore } from '@/stores/user';

export default function Profile() {
  const { streak, xp, todaySpeakingSeconds, level } = useUserStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>프로필</Text>
      <View style={styles.statRow}>
        <Stat value={`${Math.round(todaySpeakingSeconds / 60)}분`} label="오늘 발화" />
        <Stat value={`${xp} XP`} label="경험치" />
        <Stat value={`🔥 ${streak}`} label="streak" />
      </View>
      <Text style={styles.note}>레벨: {level ?? '미설정'} · 주간 스피킹 리포트 (구현 예정)</Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, padding: 24, paddingTop: 72 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  stat: { flex: 1, backgroundColor: colors.paper, borderRadius: radius.card - 4, padding: 14 },
  statValue: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  statLabel: { color: colors.ink60, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  note: { color: colors.ink40, fontSize: 12.5, marginTop: 16 },
});
