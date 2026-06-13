/**
 * DrillStep (U5) — 문장 제시 → 녹음/텍스트 입력 → 채점 결과.
 * 채점·상태 머신 전이는 모두 부모(orchestrator)가 lesson-core/scoreDrill로 처리하고,
 * 이 컴포넌트는 표시와 입력 콜백만 담당한다(화면에 분기 로직 중복 금지).
 */
import type { Drill } from '@ted-speak/shared';
import { colors, font, radius } from '@ted-speak/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MicOrb } from './MicOrb';

export interface DrillResultView {
  score: number;
  passed: boolean;
  /** 전사(또는 텍스트 입력) 결과 */
  transcript: string;
  /** 빠진 핵심 단어 (강조용) */
  missing: string[];
}

export interface DrillStepProps {
  drill: Drill;
  index: number;
  total: number;
  ttsEnabled: boolean;
  micDenied: boolean;
  recording: boolean;
  processing: boolean;
  /** 직전 채점 결과 (없으면 null) */
  result: DrillResultView | null;
  /** 2회 실패 후 노출 */
  canSkip: boolean;
  error: string | null;
  onToggleRecord: () => void;
  onSubmitText: (text: string) => void;
  onPlayModel: () => void;
  onSkip: () => void;
  onRetry: () => void;
}

/** 모범 문장에서 missing 단어를 강조 렌더 */
function renderTarget(text: string, missing: string[]) {
  if (missing.length === 0) return <Text style={styles.targetEn}>{text}</Text>;
  const missSet = new Set(missing.map((m) => m.toLowerCase()));
  const tokens = text.split(/(\s+)/);
  return (
    <Text style={styles.targetEn}>
      {tokens.map((tok, i) => {
        const bare = tok.toLowerCase().replace(/[^a-z0-9']/g, '');
        return missSet.has(bare) ? (
          <Text key={i} style={styles.miss}>
            {tok}
          </Text>
        ) : (
          <Text key={i}>{tok}</Text>
        );
      })}
    </Text>
  );
}

export function DrillStep(props: DrillStepProps) {
  const {
    drill,
    index,
    total,
    ttsEnabled,
    micDenied,
    recording,
    processing,
    result,
    canSkip,
    error,
    onToggleRecord,
    onSubmitText,
    onPlayModel,
    onSkip,
    onRetry,
  } = props;
  const [text, setText] = useState('');

  // 통과 결과 표시 중에는 전이 대기 상태 — 추가 입력/제출을 막아 이중 제출을 방지(L2).
  const locked = (result?.passed ?? false) || processing;

  const stateMsg = recording
    ? '듣고 있어요…'
    : processing
      ? '인식 중…'
      : micDenied
        ? '아래에 입력해 연습할 수 있어요 (텍스트 모드)'
        : '마이크를 눌러 말해보세요';

  return (
    <View style={styles.pane}>
      <Text style={styles.eyebrow}>스피킹 연습 · DRILL</Text>

      <View style={styles.target}>
        <Text style={styles.label}>따라 말해보세요</Text>
        {renderTarget(drill.text, result && !result.passed ? result.missing : [])}
        <Text style={styles.targetKo}>{drill.ko}</Text>
        {ttsEnabled && (
          <Pressable style={styles.listen} onPress={onPlayModel}>
            <Text style={styles.listenText}>🔊 모범 발음 듣기</Text>
          </Pressable>
        )}
      </View>

      {result && (
        <View style={[styles.result, result.passed ? styles.resultGood : styles.resultBad]}>
          <View style={[styles.scoreRing, result.passed ? styles.ringGood : styles.ringBad]}>
            <Text style={[styles.scoreText, result.passed ? styles.scoreGood : styles.scoreBad]}>
              {result.score}
            </Text>
          </View>
          <View style={styles.resultBody}>
            <Text style={styles.heard}>&ldquo;{result.transcript}&rdquo;</Text>
            <Text style={styles.msg}>
              {result.passed
                ? '좋아요! 자연스러워요 👏'
                : '모범 발음을 듣고 다시 해볼까요?'}
            </Text>
          </View>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {micDenied ? (
        <View style={styles.fallback}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="여기에 영어로 입력하세요"
            placeholderTextColor={colors.ink40}
            autoCapitalize="none"
            editable={!locked}
            accessibilityLabel="드릴 텍스트 입력"
          />
          <Pressable
            style={[styles.submit, (!text.trim() || locked) && styles.submitDisabled]}
            disabled={!text.trim() || locked}
            onPress={() => {
              onSubmitText(text.trim());
              setText('');
            }}>
            <Text style={styles.submitText}>제출</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.micZone}>
          <Text style={styles.micState}>{stateMsg}</Text>
          <MicOrb recording={recording} disabled={processing} onPress={onToggleRecord} />
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.count}>
          {index + 1} / {total}
        </Text>
        {result && !result.passed && (
          <Pressable onPress={onRetry} hitSlop={8}>
            <Text style={styles.retryLink}>다시 시도</Text>
          </Pressable>
        )}
        {canSkip && (
          <Pressable onPress={onSkip} hitSlop={8}>
            <Text style={styles.skipLink}>건너뛰기</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  eyebrow: { color: colors.ted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  target: {
    backgroundColor: colors.paper,
    borderRadius: radius.cardLg,
    padding: 28,
    marginTop: 14,
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink40,
    letterSpacing: 1,
    marginBottom: 12,
  },
  targetEn: {
    fontFamily: font.english,
    color: colors.ink,
    fontSize: 25,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 34,
  },
  miss: { color: colors.tedDeep, fontStyle: 'italic', fontWeight: '700' },
  targetKo: { fontSize: 13.5, color: colors.ink60, marginTop: 10 },
  listen: {
    marginTop: 14,
    backgroundColor: colors.tedSoft,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
  },
  listenText: { color: colors.tedDeep, fontSize: 13, fontWeight: '700' },
  result: {
    marginTop: 14,
    borderRadius: radius.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  resultGood: { backgroundColor: colors.mintSoft },
  resultBad: { backgroundColor: colors.tedSoft },
  scoreRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.paper,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringGood: { borderColor: colors.mint },
  ringBad: { borderColor: colors.ted },
  scoreText: { fontSize: 20, fontWeight: '800' },
  scoreGood: { color: colors.mint },
  scoreBad: { color: colors.tedDeep },
  resultBody: { flex: 1 },
  heard: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  msg: { color: colors.ink60, fontSize: 12.5, marginTop: 3 },
  error: { color: colors.tedDeep, fontSize: 13, marginTop: 12, textAlign: 'center' },
  micZone: { marginTop: 'auto', alignItems: 'center', gap: 14, paddingVertical: 20 },
  micState: { fontSize: 13.5, fontWeight: '600', color: colors.ink60, minHeight: 20 },
  fallback: { marginTop: 'auto', gap: 12, paddingTop: 20 },
  input: {
    backgroundColor: colors.paper,
    borderRadius: radius.button,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.ink12,
  },
  submit: {
    backgroundColor: colors.ted,
    borderRadius: radius.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: colors.paper, fontSize: 15, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginTop: 10,
  },
  count: { fontSize: 12.5, fontWeight: '700', color: colors.ink40 },
  retryLink: { fontSize: 13, fontWeight: '700', color: colors.tedDeep },
  skipLink: { fontSize: 13, fontWeight: '700', color: colors.ink40 },
});
