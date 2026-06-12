import { colors, radius } from '@ted-speak/shared';
import { StyleSheet, Text, View } from 'react-native';

/** AI 튜터 — Phase 2 (프리토킹·롤플레이, OpenAI Realtime) */
export default function Tutor() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI 튜터</Text>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          🔭 Phase 2에서 열려요 — 실시간 음성으로 Ted와 자유롭게 대화하는 공간입니다.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, padding: 24, paddingTop: 72 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' },
  banner: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.card,
    padding: 16,
    marginTop: 16,
  },
  bannerText: { color: '#8A5B00', fontSize: 13, fontWeight: '600', lineHeight: 20 },
});
