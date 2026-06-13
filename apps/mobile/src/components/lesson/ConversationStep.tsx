/**
 * ConversationStep (U6) — Ted와의 실전 대화.
 * 말풍선(ted/me), 교정 칩(inline), 격려 문구, 힌트를 표시한다.
 * 턴 누적·targetTurns 판정은 부모가 lesson-core(applyConversationTurn)로 처리한다.
 */
import type { Correction } from '@ted-speak/shared';
import { colors, font, radius } from '@ted-speak/shared';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MicOrb } from './MicOrb';

export interface ChatBubble {
  role: 'ted' | 'me';
  text: string;
  /** ted 발화에 붙는 힌트(프로토타입 인터랙션) */
  hint?: string;
  /** me 발화에 대한 교정 칩 */
  corrections?: Correction[];
  /** ted 발화의 격려 문구 */
  encouragement?: string;
}

export interface ConversationStepProps {
  bubbles: ChatBubble[];
  micDenied: boolean;
  recording: boolean;
  processing: boolean;
  /** 사용자 턴 입력 대기 중 여부 (Ted 발화/합성 중이면 false) */
  awaitingUser: boolean;
  thinking: boolean;
  error: string | null;
  onToggleRecord: () => void;
  onSubmitText: (text: string) => void;
  onRetry: () => void;
}

export function ConversationStep(props: ConversationStepProps) {
  const {
    bubbles,
    micDenied,
    recording,
    processing,
    awaitingUser,
    thinking,
    error,
    onToggleRecord,
    onSubmitText,
    onRetry,
  } = props;
  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [bubbles.length, thinking]);

  const stateMsg = thinking
    ? 'Ted가 생각하고 있어요…'
    : recording
      ? '듣고 있어요…'
      : processing
        ? '인식 중…'
        : awaitingUser
          ? micDenied
            ? '아래에 입력해 답해보세요 (텍스트 모드)'
            : '마이크를 눌러 답해보세요'
          : '';

  return (
    <View style={styles.pane}>
      <Text style={styles.eyebrow}>실전 대화 · CONVERSATION</Text>

      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}>
        {bubbles.map((b, i) => (
          <View key={i} style={styles.turnGroup}>
            <View style={[styles.bubble, b.role === 'ted' ? styles.bubbleTed : styles.bubbleMe]}>
              <Text style={[styles.msg, b.role === 'ted' ? styles.msgTed : styles.msgMe]}>
                {b.text}
              </Text>
            </View>
            {b.hint && <Text style={styles.hint}>💡 {b.hint}</Text>}
            {b.encouragement ? <Text style={styles.encourage}>{b.encouragement}</Text> : null}
            {b.corrections?.map((c, j) => (
              <View key={j} style={styles.correction}>
                <Text style={styles.correctionText}>
                  <Text style={styles.correctionStrike}>{c.original}</Text>
                  {'  →  '}
                  <Text style={styles.correctionTo}>{c.suggested}</Text>
                </Text>
              </View>
            ))}
          </View>
        ))}
        {thinking && (
          <View style={[styles.bubble, styles.bubbleTed]}>
            <Text style={styles.typing}>· · ·</Text>
          </View>
        )}
      </ScrollView>

      {error && (
        <View style={styles.errorRow}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={onRetry} hitSlop={8}>
            <Text style={styles.retryLink}>다시 시도</Text>
          </Pressable>
        </View>
      )}

      {micDenied && awaitingUser ? (
        <View style={styles.fallback}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="여기에 영어로 답하세요"
            placeholderTextColor={colors.ink40}
            autoCapitalize="none"
            accessibilityLabel="대화 텍스트 입력"
          />
          <Pressable
            style={[styles.submit, !text.trim() && styles.submitDisabled]}
            disabled={!text.trim()}
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
          <MicOrb
            recording={recording}
            disabled={!awaitingUser || processing}
            onPress={onToggleRecord}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  eyebrow: { color: colors.ted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  chat: { flex: 1, marginTop: 10 },
  chatContent: { gap: 14, paddingBottom: 8 },
  turnGroup: { gap: 8 },
  bubble: { maxWidth: '88%', borderRadius: 18, paddingVertical: 13, paddingHorizontal: 16 },
  bubbleTed: {
    alignSelf: 'flex-start',
    backgroundColor: colors.paper,
    borderBottomLeftRadius: 6,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: colors.ink,
    borderBottomRightRadius: 6,
  },
  msg: { fontFamily: font.english, fontSize: 15, lineHeight: 22 },
  msgTed: { color: colors.ink },
  msgMe: { color: colors.paper },
  hint: { alignSelf: 'flex-start', fontSize: 11.5, color: colors.ink40 },
  encourage: { alignSelf: 'flex-start', fontSize: 12.5, color: colors.mint, fontWeight: '600' },
  correction: {
    alignSelf: 'flex-end',
    backgroundColor: colors.goldSoft,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
    maxWidth: '88%',
  },
  correctionText: { fontSize: 12.5, fontWeight: '600', color: colors.goldText },
  correctionStrike: { textDecorationLine: 'line-through', color: colors.ink60 },
  correctionTo: { fontWeight: '800', color: colors.goldText },
  typing: { fontSize: 18, color: colors.ink40, letterSpacing: 2 },
  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8 },
  error: { color: colors.tedDeep, fontSize: 13 },
  retryLink: { fontSize: 13, fontWeight: '700', color: colors.tedDeep },
  fallback: { gap: 12, paddingTop: 14 },
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
  micZone: { alignItems: 'center', gap: 14, paddingVertical: 16 },
  micState: { fontSize: 13.5, fontWeight: '600', color: colors.ink60, minHeight: 20 },
});
