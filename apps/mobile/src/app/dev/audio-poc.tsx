import { colors, radius } from '@ted-speak/shared';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * T3 — 마이크 녹음/재생 POC (dev 전용, expo-audio).
 * 검증 항목: 권한 요청 → 녹음 시작/정지 → 파일 재생, 거부 시 안내.
 * 산출 포맷(m4a/HIGH_QUALITY)은 Whisper 업로드 호환 (m4a 지원 확인됨).
 */
export default function AudioPoc() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const player = useAudioPlayer(recordedUri ?? undefined);

  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      setPermission(status.granted ? 'granted' : 'denied');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    })();
  }, []);

  const toggleRecord = async () => {
    if (permission !== 'granted') {
      Alert.alert('마이크 권한 필요', '설정에서 마이크를 허용하거나, 텍스트 입력으로 학습할 수 있어요.');
      return;
    }
    if (recorderState.isRecording) {
      await recorder.stop();
      setRecordedUri(recorder.uri);
    } else {
      await recorder.prepareToRecordAsync();
      await recorder.record();
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>오디오 POC (T3)</Text>
      <Text style={styles.sub}>
        권한: {permission} · 상태: {recorderState.isRecording ? '🔴 녹음 중' : '대기'}
      </Text>

      <Pressable
        style={[styles.orb, recorderState.isRecording && styles.orbRec]}
        onPress={toggleRecord}>
        <Text style={styles.orbIcon}>🎙️</Text>
      </Pressable>

      {recordedUri && (
        <Pressable style={styles.cta} onPress={() => player.play()}>
          <Text style={styles.ctaText}>녹음 재생</Text>
        </Pressable>
      )}
      {recordedUri && <Text style={styles.uri}>{recordedUri}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 18,
  },
  title: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  sub: { color: colors.ink60, fontSize: 13.5 },
  orb: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.ted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbRec: { backgroundColor: colors.tedDeep },
  orbIcon: { fontSize: 34 },
  cta: {
    backgroundColor: colors.ink,
    borderRadius: radius.button,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  ctaText: { color: colors.paper, fontSize: 15, fontWeight: '700' },
  uri: { color: colors.ink40, fontSize: 10.5, textAlign: 'center' },
});
