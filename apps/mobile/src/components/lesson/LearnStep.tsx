/**
 * LearnStep (U5) — keyPhrases 카드(en+ko) + ▶ TTS 버튼.
 * 진입 시 prefetch가 시작되므로 ▶는 캐시 경유 즉시 재생(오프라인 재진입 보장).
 */
import type { KeyPhrase } from '@ted-speak/shared';
import { colors, font, radius } from '@ted-speak/shared';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export interface LearnStepProps {
  keyPhrases: KeyPhrase[];
  /** TTS 사용 가능 여부 (AI 설정 null이면 false) */
  ttsEnabled: boolean;
  onPlay: (text: string) => void;
  onContinue: () => void;
}

export function LearnStep({ keyPhrases, ttsEnabled, onPlay, onContinue }: LearnStepProps) {
  return (
    <View style={styles.pane}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>오늘의 수업 · LEARN</Text>
        <Text style={styles.title}>이 표현이면 충분해요</Text>

        {keyPhrases.map((p, i) => (
          <View key={`${p.en}-${i}`} style={styles.card}>
            <View style={styles.cardText}>
              <Text style={styles.en}>{p.en}</Text>
              <Text style={styles.ko}>{p.ko}</Text>
            </View>
            {ttsEnabled && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${p.en} 발음 듣기`}
                hitSlop={8}
                style={styles.playBtn}
                onPress={() => onPlay(p.en)}>
                <Text style={styles.playIcon}>▶</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>

      <Pressable style={styles.cta} onPress={onContinue}>
        <Text style={styles.ctaText}>표현 연습 시작하기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  scroll: { paddingBottom: 16 },
  eyebrow: { color: colors.ted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '800', marginTop: 6, marginBottom: 6 },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.card,
    padding: 20,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardText: { flex: 1 },
  en: { fontFamily: font.english, color: colors.ink, fontSize: 19, fontWeight: '500', lineHeight: 26 },
  ko: { color: colors.ink60, fontSize: 13, marginTop: 5 },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.tedSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { color: colors.tedDeep, fontSize: 16 },
  cta: {
    backgroundColor: colors.ted,
    borderRadius: radius.button,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 12,
  },
  ctaText: { color: colors.paper, fontSize: 16, fontWeight: '700' },
});
