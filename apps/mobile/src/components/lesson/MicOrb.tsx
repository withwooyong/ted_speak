/**
 * MicOrb — 시그니처 마이크 버튼 (프로토타입 .mic-orb).
 * 녹음 중에는 강조색, 비활성 시 흐리게. 인라인 hex 금지 — 토큰만 사용.
 */
import { colors } from '@ted-speak/shared';
import { Pressable, StyleSheet, Text } from 'react-native';

export interface MicOrbProps {
  recording: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export function MicOrb({ recording, disabled, onPress }: MicOrbProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recording ? '녹음 중지' : '녹음 시작'}
      accessibilityState={{ disabled: !!disabled, busy: recording }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.orb, recording && styles.orbRec, disabled && styles.orbDisabled]}>
      <Text style={styles.icon}>🎙️</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  orb: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.ted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbRec: { backgroundColor: colors.tedDeep },
  orbDisabled: { opacity: 0.4 },
  icon: { fontSize: 34 },
});
