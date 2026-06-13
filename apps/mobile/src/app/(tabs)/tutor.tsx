import { colors, radius, type Correction, type RoleplayScenario } from '@ted-speak/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { findScenario, roleplayScenarios } from '@ted-speak/content';
import { getTutorRepo } from '@/lib/tutor';
import {
  applyTedTurn,
  applyUserTurn,
  createTutorState,
  endSession,
  findTopic,
  markActive,
  SESSION_MAX_SECONDS,
  startConnecting,
  summarizeTutor,
  tick,
  TURN_MAX_SECONDS,
  toSummary,
  TUTOR_TOPICS,
  type TutorState,
} from '@/lib/tutor-core';
import { DAILY_CAP_SECONDS, remainingDailyCap } from '@/lib/tutor-repo';
import {
  createMockTutorTransport,
  createRoleplayMockTransport,
  type TutorTransport,
} from '@/lib/tutor-transport';

/** mm:ss 포맷 */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 텍스트 미리보기 모드의 발화 시간 추정(초) — 단어 수 기반, TURN_MAX_SECONDS로 클램프.
 * 실제 측정 발화 시간은 라이브 음성(이월) 도입 시 대체된다.
 */
function estimateSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.min(Math.round(words * 0.5), TURN_MAX_SECONDS));
}

/** 오늘(KST) 누적 프리토킹 발화 시간(초) — 일일 캡 판정용 */
async function fetchDailyUsed(): Promise<number> {
  const repo = getTutorRepo();
  return repo ? repo.getTodaySessionSeconds() : 0;
}

const TUTOR_CAP_KEY = ['tutor', 'daily-cap'] as const;

/** AI 튜터 — 프리토킹 (P2 W2 기반: 목 전송 + 텍스트 미리보기, 라이브 음성은 이월) */
export default function Tutor() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<TutorState | null>(null);
  const [input, setInput] = useState('');

  const transportRef = useRef<TutorTransport | null>(null);
  const orderRef = useRef(0);
  const startTsRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const endingHandled = useRef(false);
  const startingRef = useRef(false);
  // 최신 state 미러 — ending effect가 phase 변화에만 반응하면서도 최종 카운터를 읽도록(매 tick 재실행 방지).
  // 렌더 중 ref 쓰기는 금지(react-hooks/refs)이므로 effect에서 동기화한다(아래 ending effect보다 먼저 선언).
  const stateRef = useRef<TutorState | null>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 일일 캡 사용량 — TanStack Query로 로드 (home.tsx 진행 조회와 동일 패턴)
  const { data: dailyUsed = 0, isLoading: loadingCap } = useQuery({
    queryKey: TUTOR_CAP_KEY,
    queryFn: fetchDailyUsed,
  });

  // 탭 재진입 시 캡 재조회 (home.tsx와 동일 패턴)
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: TUTOR_CAP_KEY });
    }, [queryClient]),
  );

  // 언마운트 시 전송 정리 — 진행 중 세션의 전송(향후 라이브 WebRTC 포함)을 누수 없이 닫는다
  useEffect(() => {
    return () => {
      transportRef.current?.close();
      transportRef.current = null;
    };
  }, []);

  // 세션 타이머 — active 동안 1초마다 tick (상한 도달 시 코어가 ending으로 전이)
  useEffect(() => {
    if (state?.phase !== 'active') return;
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTsRef.current) / 1000);
      setState((s) => (s ? tick(s, elapsed) : s));
    }, 1000);
    return () => clearInterval(timer);
  }, [state?.phase]);

  // ending → 세션 저장 후 summary 전이 (phase 변화에만 반응, 한 번만)
  const phase = state?.phase;
  useEffect(() => {
    if (phase !== 'active' && phase !== 'ending') endingHandled.current = false;
    if (phase !== 'ending' || endingHandled.current) return;
    endingHandled.current = true;
    const current = stateRef.current; // phase가 'ending'인 최신 스냅샷
    if (!current) return;
    transportRef.current?.close();
    transportRef.current = null;
    void (async () => {
      try {
        const repo = getTutorRepo();
        if (repo && sessionIdRef.current) {
          await repo.completeSession(sessionIdRef.current, {
            summary: summarizeTutor(current),
            durationSeconds: current.elapsedSeconds,
            turnCount: current.turnCount,
          });
        }
      } catch {
        // 저장 실패해도 요약은 보여준다 (Fallback 원칙) — PII 로깅 금지
      }
      void queryClient.invalidateQueries({ queryKey: TUTOR_CAP_KEY });
      setState((s) => (s ? toSummary(s) : s));
    })();
  }, [phase, queryClient]);

  // onTedReply 핸들러 — 프리토킹/롤플레이 공유. 코어에 적용(metObjectiveIds 포함) + 턴 영속.
  const handleTedReply = useCallback(
    (reply: { reply: string; corrections: Correction[]; metObjectiveIds?: string[] }) => {
      setState((s) => (s ? applyTedTurn(s, reply) : s));
      const order = (orderRef.current += 1);
      if (sessionIdRef.current) {
        // repo는 매번 새로 조회한다 — 세션 중 로그아웃 시 옛 사용자에게 쓰지 않도록(스테일 repo 방지)
        void getTutorRepo()
          ?.appendTurn(sessionIdRef.current, {
            order,
            role: 'assistant',
            transcript: reply.reply,
            corrections: reply.corrections,
          })
          .catch(() => {});
      }
    },
    [],
  );

  // 롤플레이는 topicId에 scenario.id를 저장한다(프리토킹과 동일 tutor_sessions·캡 공유).
  const startSession = useCallback(
    async (topicId: string, scenario?: RoleplayScenario) => {
      if (startingRef.current) return; // 더블탭 가드 — 이중 세션 생성·전송 누수 방지
      startingRef.current = true;
      try {
        orderRef.current = 0;
        sessionIdRef.current = null;
        setState(startConnecting(createTutorState(topicId, scenario?.objectives ?? [])));
        try {
          sessionIdRef.current = (await getTutorRepo()?.createSession(topicId))?.id ?? null;
        } catch {
          // 세션 생성 실패 — 목 전송으로 데모는 계속(저장만 생략)
        }
        const transport = scenario
          ? createRoleplayMockTransport(scenario, { onTedReply: handleTedReply })
          : createMockTutorTransport(topicId, { onTedReply: handleTedReply });
        transportRef.current = transport;
        await transport.connect();
        startTsRef.current = Date.now();
        setState((s) => (s ? markActive(s) : s));
      } finally {
        startingRef.current = false;
      }
    },
    [handleTedReply],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || state?.phase !== 'active') return;
    setInput('');
    setState((s) => (s ? applyUserTurn(s, { transcript: text, seconds: estimateSeconds(text) }) : s));
    const order = (orderRef.current += 1);
    if (sessionIdRef.current) {
      const repo = getTutorRepo();
      void repo
        ?.appendTurn(sessionIdRef.current, { order, role: 'user', transcript: text, corrections: [] })
        .catch(() => {});
    }
    await transportRef.current?.sendUserText(text);
  }, [input, state?.phase]);

  const reset = useCallback(() => {
    transportRef.current?.close();
    transportRef.current = null;
    setState(null);
    setInput('');
    void queryClient.invalidateQueries({ queryKey: TUTOR_CAP_KEY });
  }, [queryClient]);

  // ── 렌더 ────────────────────────────────────────────────────────────────────

  const remaining = remainingDailyCap(dailyUsed);
  const capExhausted = remaining <= 0;

  if (!state) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>AI 튜터</Text>
        <Text style={styles.subtitle}>주제를 골라 Ted와 자유롭게 대화해요.</Text>

        <View style={styles.previewBanner}>
          <Text style={styles.previewText}>
            💬 지금은 텍스트 미리보기예요. 실시간 음성 대화는 곧 추가됩니다.
          </Text>
        </View>

        {loadingCap ? (
          <ActivityIndicator color={colors.ted} style={styles.capLoader} />
        ) : capExhausted ? (
          <View style={styles.lockCard}>
            <Text style={styles.lockTitle}>오늘 프리토킹을 다 했어요 🌙</Text>
            <Text style={styles.lockSub}>무료 플랜은 하루 {Math.round(DAILY_CAP_SECONDS / 60)}분까지 대화할 수 있어요. 내일 또 만나요.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.capNote}>오늘 남은 대화 시간 약 {clock(remaining)}</Text>

            <Text style={styles.groupLabel}>자유 대화</Text>
            <View style={styles.topicList}>
              {TUTOR_TOPICS.map((t) => (
                <Pressable
                  key={t.id}
                  style={styles.topicCard}
                  onPress={() => void startSession(t.id)}>
                  <Text style={styles.topicTitle}>{t.title}</Text>
                  <Text style={styles.topicEn}>{t.titleEn}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.groupLabel}>롤플레이</Text>
            <Text style={styles.groupSub}>역할을 맡아 상황 속에서 목표를 달성해 봐요.</Text>
            <View style={styles.topicList}>
              {roleplayScenarios.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.topicCard}
                  onPress={() => void startSession(s.id, s)}>
                  <View style={styles.scenarioHead}>
                    <Text style={styles.topicTitle}>{s.title}</Text>
                    <Text style={styles.roleBadge}>{s.tedRole}</Text>
                  </View>
                  <Text style={styles.scenarioSetting}>{s.setting}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  if (state.phase === 'connecting') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.ted} size="large" />
        <Text style={styles.connectingText}>Ted를 연결하고 있어요…</Text>
      </View>
    );
  }

  if (state.phase === 'summary') {
    const sum = summarizeTutor(state);
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>대화 요약</Text>
        <View style={styles.summaryRow}>
          <Stat value={clock(state.elapsedSeconds)} label="대화 시간" />
          <Stat value={`${state.turnCount}`} label="주고받은 턴" />
        </View>

        {sum.goal && (
          <View style={[styles.goalCard, sum.goal.achieved && styles.goalCardDone]}>
            <Text style={styles.goalTitle}>
              {sum.goal.achieved
                ? `목표 ${sum.goal.met}/${sum.goal.total} 달성 🎉`
                : `목표 ${sum.goal.met}/${sum.goal.total} 달성`}
            </Text>
            {sum.goal.checklist.map((c) => (
              <Text key={c.id} style={[styles.goalItem, c.met && styles.goalItemDone]}>
                {c.met ? '✓' : '○'} {c.label}
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.sectionLabel}>잘한 점</Text>
        {sum.strengths.map((s, i) => (
          <Text key={`s-${i}`} style={styles.bullet}>· {s}</Text>
        ))}

        {sum.improvements.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>다음엔 이렇게</Text>
            {sum.improvements.map((s, i) => (
              <Text key={`i-${i}`} style={styles.bullet}>· {s}</Text>
            ))}
          </>
        )}

        <Pressable style={styles.primaryBtn} onPress={reset}>
          <Text style={styles.primaryBtnText}>새 대화 시작</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // active / ending — 대화 화면
  const remainingInSession = Math.max(0, SESSION_MAX_SECONDS - state.elapsedSeconds);
  const lastTed = state.history.findLast((h) => h.role === 'assistant');
  const scenario = findScenario(state.topicId);
  const topic = findTopic(state.topicId);
  const isRoleplay = state.objectives.length > 0;
  const metIds = new Set(state.metObjectiveIds);
  // 롤플레이 첫 발화: Ted 응답 전이면 시나리오 openingLine을 첫 버블로 노출(카운트 안 함)
  const openingBubble = isRoleplay && !lastTed ? scenario?.openingLine : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionTopic}>{scenario?.title ?? topic?.title ?? '프리토킹'}</Text>
        <Text style={styles.timer}>{clock(remainingInSession)}</Text>
      </View>
      {isRoleplay && scenario && (
        <Text style={styles.roleHint}>
          Ted는 {scenario.tedRole} · 나는 {scenario.learnerRole}
        </Text>
      )}

      <ScrollView style={styles.convo} contentContainerStyle={styles.convoContent}>
        {lastTed || openingBubble ? (
          <View style={styles.tedBubble}>
            <Text style={styles.tedLabel}>Ted</Text>
            <Text style={styles.tedText}>{lastTed?.text ?? openingBubble}</Text>
          </View>
        ) : (
          <Text style={styles.hint}>{topic?.titleEn} — 편하게 한 문장 말해 보세요.</Text>
        )}

        {isRoleplay && (
          <View style={styles.objectives}>
            <Text style={styles.objectivesLabel}>목표 {metIds.size}/{state.objectives.length}</Text>
            {state.objectives.map((o) => {
              const done = metIds.has(o.id);
              return (
                <Text key={o.id} style={[styles.objectiveItem, done && styles.objectiveDone]}>
                  {done ? '✓' : '○'} {o.label}
                </Text>
              );
            })}
          </View>
        )}

        {state.corrections.length > 0 && (
          <View style={styles.corrections}>
            <Text style={styles.correctionsLabel}>교정</Text>
            {state.corrections.slice(-3).map((c: Correction, i) => (
              <Text key={`c-${i}`} style={styles.correctionChip}>
                {c.original} → <Text style={styles.correctionSuggest}>{c.suggested}</Text>
              </Text>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="영어로 입력…"
          placeholderTextColor={colors.ink40}
          editable={state.phase === 'active'}
          onSubmitEditing={() => void send()}
          returnKeyType="send"
        />
        <Pressable style={styles.sendBtn} onPress={() => void send()}>
          <Text style={styles.sendBtnText}>전송</Text>
        </Pressable>
      </View>

      <Pressable style={styles.endBtn} onPress={() => setState((s) => (s ? endSession(s, 'user_ended') : s))}>
        <Text style={styles.endBtnText}>대화 끝내기</Text>
      </Pressable>
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
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 24, paddingTop: 72, paddingBottom: 48 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.ink60, fontSize: 14, marginTop: 6 },

  previewBanner: { backgroundColor: colors.goldSoft, borderRadius: radius.card, padding: 14, marginTop: 18 },
  previewText: { color: colors.goldText, fontSize: 13, fontWeight: '600', lineHeight: 20 },

  capLoader: { marginTop: 32 },
  capNote: { color: colors.ink60, fontSize: 13, marginTop: 22, marginBottom: 10, fontWeight: '600' },
  lockCard: { backgroundColor: colors.ink06, borderRadius: radius.card, padding: 20, marginTop: 22 },
  lockTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  lockSub: { color: colors.ink60, fontSize: 13, marginTop: 8, lineHeight: 19 },

  groupLabel: { color: colors.ink, fontSize: 16, fontWeight: '800', marginTop: 24, marginBottom: 10 },
  groupSub: { color: colors.ink60, fontSize: 13, marginTop: -4, marginBottom: 12, lineHeight: 19 },
  topicList: { gap: 12 },
  topicCard: { backgroundColor: colors.paper, borderRadius: radius.card, padding: 18, borderWidth: 1, borderColor: colors.ink12 },
  topicTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  topicEn: { color: colors.ink40, fontSize: 13, marginTop: 3 },
  scenarioHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roleBadge: { color: colors.tedDeep, backgroundColor: colors.tedSoft, fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
  scenarioSetting: { color: colors.ink60, fontSize: 13, marginTop: 6, lineHeight: 19 },

  connectingText: { color: colors.ink60, fontSize: 14, marginTop: 16 },

  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 64, paddingBottom: 12 },
  sessionTopic: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  timer: { color: colors.ted, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  roleHint: { color: colors.ink60, fontSize: 13, fontWeight: '600', paddingHorizontal: 24, paddingBottom: 4 },

  objectives: { backgroundColor: colors.paper, borderRadius: radius.card, padding: 14, borderWidth: 1, borderColor: colors.ink12, gap: 6 },
  objectivesLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  objectiveItem: { color: colors.ink60, fontSize: 14, lineHeight: 21 },
  objectiveDone: { color: colors.mint, fontWeight: '700' },

  convo: { flex: 1 },
  convoContent: { padding: 24, gap: 16 },
  hint: { color: colors.ink40, fontSize: 14, lineHeight: 21 },
  tedBubble: { backgroundColor: colors.tedSoft, borderRadius: radius.card, padding: 16 },
  tedLabel: { color: colors.tedDeep, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  tedText: { color: colors.ink, fontSize: 16, lineHeight: 23 },

  corrections: { backgroundColor: colors.paper, borderRadius: radius.card, padding: 14, borderWidth: 1, borderColor: colors.ink12, gap: 6 },
  correctionsLabel: { color: colors.goldDeep, fontSize: 12, fontWeight: '800' },
  correctionChip: { color: colors.ink60, fontSize: 14 },
  correctionSuggest: { color: colors.mint, fontWeight: '700' },

  inputRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingVertical: 8 },
  input: { flex: 1, backgroundColor: colors.paper, borderRadius: radius.button, borderWidth: 1, borderColor: colors.ink12, paddingHorizontal: 16, paddingVertical: 12, color: colors.ink, fontSize: 15 },
  sendBtn: { backgroundColor: colors.ted, borderRadius: radius.button, paddingHorizontal: 18, justifyContent: 'center' },
  sendBtnText: { color: colors.paper, fontSize: 15, fontWeight: '700' },

  endBtn: { alignItems: 'center', paddingVertical: 16, paddingBottom: 28 },
  endBtnText: { color: colors.ink40, fontSize: 14, fontWeight: '600' },

  goalCard: { backgroundColor: colors.goldSoft, borderRadius: radius.card, padding: 18, marginTop: 18, gap: 6 },
  goalCardDone: { backgroundColor: colors.mintSoft },
  goalTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', marginBottom: 4 },
  goalItem: { color: colors.ink60, fontSize: 14, lineHeight: 22 },
  goalItemDone: { color: colors.mint, fontWeight: '700' },

  summaryRow: { flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 8 },
  stat: { flex: 1, backgroundColor: colors.paper, borderRadius: radius.card, padding: 16, borderWidth: 1, borderColor: colors.ink12 },
  statValue: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  statLabel: { color: colors.ink60, fontSize: 12, marginTop: 4 },
  sectionLabel: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 22, marginBottom: 8 },
  bullet: { color: colors.ink60, fontSize: 14, lineHeight: 22 },
  primaryBtn: { backgroundColor: colors.ted, borderRadius: radius.button, padding: 16, alignItems: 'center', marginTop: 28 },
  primaryBtnText: { color: colors.paper, fontSize: 16, fontWeight: '700' },
});
