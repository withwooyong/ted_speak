/**
 * 레슨 플레이어 (U5/U6/U7) — lesson-core 상태 머신 + progress-repo로 전체 3단계 루프.
 * Learn → Drill → Conversation → Complete. 모든 단계 전이는 lesson-core 함수만 사용한다
 * (화면에 분기 로직 중복 금지). AI 호출은 화면 단위 AbortController로 언마운트 시 취소한다(U1).
 */
import { type ChatTurn, getTurnFeedback } from '@ted-speak/ai';
import { findLesson } from '@ted-speak/content';
import {
  assessPronunciation,
  colors,
  radius,
  type Correction,
  type Lesson,
} from '@ted-speak/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConversationStep, type ChatBubble } from '@/components/lesson/ConversationStep';
import { CompleteStep } from '@/components/lesson/CompleteStep';
import { DrillStep, type DrillResultView } from '@/components/lesson/DrillStep';
import { LearnStep } from '@/components/lesson/LearnStep';
import { useRecorder } from '@/hooks/use-recorder';
import { useSaveExpression } from '@/hooks/use-save-expression';
import { useTts } from '@/hooks/use-tts';
import { getAiConfig, transcribeUri, transcribeUriDetailed } from '@/lib/ai';
import {
  applyConversationTurn,
  applyDrillResult,
  completeLearn,
  createLessonState,
  fromSnapshot,
  type LessonState,
  type LessonSummary,
  skipDrill,
  summarize,
  toSnapshot,
} from '@/lib/lesson-core';
import { getProgressRepo } from '@/lib/progress';
import type { TurnInput } from '@/lib/progress-repo';
import { useUserStore } from '@/stores/user';

/** lesson-core 단계 → progress-repo currentStep(1~4) */
const STEP_NUMBER: Record<LessonState['step'], number> = {
  learn: 1,
  drill: 2,
  conversation: 3,
  complete: 4,
};

const HISTORY_WINDOW = 6;

/**
 * 저장된 대화 턴 → 화면 버블 재구성 (이어하기 복원용).
 * 라이브 UI와 동일하게: assistant 턴은 ted 버블, user 턴은 me 버블이며
 * user 발화 직후의 assistant 턴에 저장된 corrections를 me 버블에 부착한다.
 * assistant 턴에는 그 차례(turnCount) 힌트를 부착한다.
 */
function turnsToBubbles(turns: TurnInput[], lesson: Lesson): ChatBubble[] {
  const hints = lesson.conversation.hints ?? [];
  const bubbles: ChatBubble[] = [];
  let tedSeen = 0;
  turns.forEach((t, i) => {
    if (t.role === 'assistant') {
      bubbles.push({
        role: 'ted',
        text: t.transcript,
        hint: hints[tedSeen],
      });
      tedSeen += 1;
    } else {
      const nextAssistant = turns[i + 1];
      const corrections =
        nextAssistant && nextAssistant.role === 'assistant'
          ? (nextAssistant.corrections as Correction[] | undefined)
          : undefined;
      bubbles.push({ role: 'me', text: t.transcript, corrections });
    }
  });
  return bubbles;
}

export default function LessonPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const found = useMemo(() => (id ? findLesson(id) : null), [id]);
  const lesson = found?.lesson ?? null;

  if (!lesson) {
    return <FullMessage text="레슨을 찾을 수 없어요." onBack={() => router.back()} />;
  }
  return <LessonRunner lesson={lesson} />;
}

function LessonRunner({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const aiConfig = useMemo(() => getAiConfig(), []);
  const ttsEnabled = aiConfig !== null;

  const recorder = useRecorder();
  const tts = useTts(aiConfig);
  // 대화 교정 길게 눌러 복습 목록에 저장 (P2 W5b — 튜터·히스토리와 동일 훅)
  const { saveCorrection, isSaved } = useSaveExpression();
  const applyReward = useUserStore((s) => s.applyReward);
  const level = useUserStore((s) => s.level) ?? 'A2';
  const streak = useUserStore((s) => s.streak);

  // 화면 단위 취소 — 언마운트 시 모든 AI 호출 abort (U1)
  const abortRef = useRef<AbortController>(new AbortController());
  // 드릴 통과 후 전이 타이머 — 언마운트 시 정리(누수 방지)
  const drillAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<LessonState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 드릴 채점·점수 누적
  const [drillResult, setDrillResult] = useState<DrillResultView | null>(null);
  const drillScoresRef = useRef<number[]>([]);

  // 대화 UI
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const historyRef = useRef<ChatTurn[]>([]);
  const [awaitingUser, setAwaitingUser] = useState(false);
  const [thinking, setThinking] = useState(false);
  const openedConversationRef = useRef(false);

  const [aiError, setAiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [summary, setSummary] = useState<LessonSummary | null>(null);
  const summarizedRef = useRef(false);

  // ── 마운트: 세션 로드 + 이어하기 ──────────────────────────────────────────────
  useEffect(() => {
    const ctrl = abortRef.current;
    let cancelled = false;
    let homeTimer: ReturnType<typeof setTimeout> | null = null;
    // setState는 모두 비동기 경로에서만 호출한다(렌더 직후 동기 setState 캐스케이드 회피).
    (async () => {
      const repo = getProgressRepo();
      if (!repo) {
        if (cancelled) return;
        setLoadError('로그인이 필요해요. 잠시 후 홈으로 이동합니다.');
        homeTimer = setTimeout(() => router.back(), 1500);
        return;
      }
      try {
        const session = await repo.getOrCreateSession(lesson.id);
        if (cancelled) return;
        setSessionId(session.id);
        const restored = session.snapshot
          ? fromSnapshot(session.snapshot, lesson)
          : createLessonState(lesson);

        // 대화 단계로 이어하기(turnCount > 0): 저장된 턴으로 히스토리·버블을 복원하고
        // openingLine 재발화를 막는다(openedConversationRef를 미리 true로).
        if (restored.step === 'conversation' && restored.turnCount > 0) {
          let turns: TurnInput[] = [];
          try {
            turns = await repo.getTurns(session.id);
          } catch {
            // 턴 복원 실패는 치명적이지 않음 — 빈 히스토리로 진행
          }
          if (cancelled) return;
          if (turns.length > 0) {
            openedConversationRef.current = true;
            historyRef.current = turns.map((t) => ({
              role: t.role,
              content: t.transcript,
            }));
            setBubbles(turnsToBubbles(turns, lesson));
            setAwaitingUser(true);
          }
        }
        setState(restored);
      } catch {
        if (!cancelled) setLoadError('진행 정보를 불러오지 못했어요.');
      }
    })();
    return () => {
      cancelled = true;
      if (homeTimer) clearTimeout(homeTimer);
      if (drillAdvanceTimer.current) clearTimeout(drillAdvanceTimer.current);
      ctrl.abort(); // 언마운트 시 진행 중 AI 호출 취소
      tts.stop();
    };
    // 마운트 1회만 — lesson.id 고정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(
    (next: LessonState) => {
      // 'complete'는 스냅샷으로 저장하지 않는다(M3): completeSession이 세션을 닫으므로
      // 재진입 시 새 세션이 생성되고 fromSnapshot 폴백이 안전하게 동작한다.
      // 완료 상태를 저장하면 재진입 때 summarize effect가 다시 돌아 이중 보상이 발생한다.
      if (next.step === 'complete') return;
      const repo = getProgressRepo();
      if (repo && sessionId) {
        void repo.saveStep(sessionId, STEP_NUMBER[next.step], toSnapshot(next)).catch(() => {});
      }
    },
    [sessionId],
  );

  const advance = useCallback(
    (next: LessonState) => {
      setState(next);
      persist(next);
    },
    [persist],
  );

  const isAbortError = (e: unknown) => e instanceof Error && e.name === 'AbortError';

  // ── Learn ────────────────────────────────────────────────────────────────────
  // 진입 시 keyPhrases + 드릴 모범문 + openingLine prefetch (오프라인 재진입 재생 보장)
  useEffect(() => {
    if (!state || !ttsEnabled) return;
    const texts = [
      ...lesson.keyPhrases.map((p) => p.en),
      ...lesson.drills.map((d) => d.text),
      lesson.conversation.openingLine,
    ];
    void tts.prefetch(texts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state !== null, ttsEnabled]);

  const onCompleteLearn = useCallback(() => {
    if (!state) return;
    advance(completeLearn(state));
  }, [state, advance]);

  // ── Drill ──────────────────────────────────────────────────────────────────────
  const scoreAndApply = useCallback(
    (transcript: string, speakingSeconds: number, avgLogprob?: number | null) => {
      if (!state) return;
      const drill = lesson.drills[state.drillIndex];
      // 발음 "점수"가 아니라 핵심 단어 인식률 + 또렷함(clarity) — ADR-0010 정직한 범위.
      const fb = assessPronunciation(transcript, drill.keyWords, avgLogprob);
      setDrillResult({
        score: fb.recognitionScore,
        passed: fb.passed,
        transcript,
        missing: fb.missing,
        clarity: fb.clarity,
      });

      const { state: next, outcome } = applyDrillResult(state, lesson, {
        score: fb.recognitionScore,
        missing: fb.missing,
        speakingSeconds,
      });
      if (outcome.kind === 'pass') {
        drillScoresRef.current.push(fb.recognitionScore);
        // 통과 → 다음 드릴/대화로. 결과를 잠깐 보여준 뒤 전이.
        // 타이머 핸들을 ref에 보관해 언마운트 시 정리한다(누수 방지).
        if (drillAdvanceTimer.current) clearTimeout(drillAdvanceTimer.current);
        drillAdvanceTimer.current = setTimeout(() => {
          drillAdvanceTimer.current = null;
          setDrillResult(null);
          advance(next);
        }, 1200);
      } else {
        // 실패: fails 카운트만 누적된 상태 저장. 모범 발음 재생 유도.
        advance(next);
        if (ttsEnabled) void tts.playPhrase(drill.text);
      }
    },
    [state, lesson, advance, tts, ttsEnabled],
  );

  const handleDrillRecord = useCallback(async () => {
    if (!state || !aiConfig) return;
    setAiError(null);
    if (recorder.status === 'recording') {
      const uri = await recorder.stop();
      if (!uri) return;
      const seconds = Math.round(recorder.recordedMs / 1000);
      setBusy(true);
      try {
        const { text, avgLogprob } = await transcribeUriDetailed(uri, aiConfig, {
          signal: abortRef.current.signal,
        });
        scoreAndApply(text, seconds, avgLogprob);
      } catch (e) {
        if (!isAbortError(e)) setAiError('음성을 인식하지 못했어요. 다시 시도해주세요.');
      } finally {
        setBusy(false);
        recorder.reset();
      }
    } else {
      await recorder.start();
    }
  }, [state, aiConfig, recorder, scoreAndApply]);

  const handleDrillText = useCallback(
    (text: string) => {
      // 텍스트 폴백도 동일하게 scoreDrill로 채점 (발화 시간은 0 — 음성 아님)
      scoreAndApply(text, 0);
    },
    [scoreAndApply],
  );

  const handleDrillSkip = useCallback(() => {
    if (!state) return;
    setDrillResult(null);
    advance(skipDrill(state, lesson));
  }, [state, lesson, advance]);

  const handleDrillRetry = useCallback(() => {
    setDrillResult(null);
    setAiError(null);
    recorder.reset();
  }, [recorder]);

  // ── Conversation ───────────────────────────────────────────────────────────────
  // 진입 시 Ted openingLine 재생 + assistant 턴 기록 (1회)
  useEffect(() => {
    if (!state || state.step !== 'conversation' || openedConversationRef.current) return;
    openedConversationRef.current = true;
    const opening = lesson.conversation.openingLine;
    const repo = getProgressRepo();
    setBubbles([{ role: 'ted', text: opening, hint: lesson.conversation.hints?.[0] }]);
    historyRef.current.push({ role: 'assistant', content: opening });
    if (repo && sessionId) {
      void repo
        .recordTurn(sessionId, { order: 0, role: 'assistant', transcript: opening })
        .catch(() => {});
    }
    if (ttsEnabled) void tts.playReply(opening);
    setAwaitingUser(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.step]);

  const submitUserTurn = useCallback(
    async (transcript: string, speakingSeconds: number) => {
      if (!state || !aiConfig || state.step !== 'conversation') return;
      setAwaitingUser(false);
      setAiError(null);
      setBubbles((b) => [...b, { role: 'me', text: transcript }]);
      historyRef.current.push({ role: 'user', content: transcript });

      const repo = getProgressRepo();
      // 사용자 턴 order. recordTurn은 AI 응답이 성공한 뒤에야 user/assistant 턴을
      // 함께 기록한다 — 실패한 턴을 DB에 남기지 않아 재시도 시 order 중복을 막는다(L5).
      const userOrder = historyRef.current.length - 1;

      setThinking(true);
      try {
        const feedback = await getTurnFeedback(
          transcript,
          {
            level,
            scenarioTopic: lesson.conversation.topic,
            history: historyRef.current.slice(-HISTORY_WINDOW),
          },
          aiConfig,
          { signal: abortRef.current.signal },
        );

        // 다음 단계(턴 카운트·완료 판정)는 lesson-core가 결정
        const next = applyConversationTurn(state, lesson, {
          feedback,
          speakingSeconds,
        });

        // me 버블에 교정 칩 부착(불변 교체) + Ted reply 버블 추가
        setBubbles((b) => {
          const copy = [...b];
          // 마지막 me 버블 인덱스를 찾아 새 객체로 교체(직접 변이 금지)
          let lastMeIdx = -1;
          for (let i = copy.length - 1; i >= 0; i -= 1) {
            if (copy[i].role === 'me') {
              lastMeIdx = i;
              break;
            }
          }
          if (lastMeIdx >= 0) {
            copy[lastMeIdx] = { ...copy[lastMeIdx], corrections: feedback.corrections };
          }
          const nextHint = lesson.conversation.hints?.[next.turnCount];
          copy.push({
            role: 'ted',
            text: feedback.reply,
            encouragement: feedback.encouragement || undefined,
            hint: next.step === 'conversation' ? nextHint : undefined,
          });
          return copy;
        });
        historyRef.current.push({ role: 'assistant', content: feedback.reply });
        if (repo && sessionId) {
          // 성공 시에만 user·assistant 턴을 순서대로 기록한다.
          void repo
            .recordTurn(sessionId, { order: userOrder, role: 'user', transcript })
            .catch(() => {});
          void repo
            .recordTurn(sessionId, {
              order: historyRef.current.length - 1,
              role: 'assistant',
              transcript: feedback.reply,
              corrections: feedback.corrections,
            })
            .catch(() => {});
        }

        setThinking(false);
        if (ttsEnabled) void tts.playReply(feedback.reply);

        advance(next);
        if (next.step === 'conversation') setAwaitingUser(true);
      } catch (e) {
        setThinking(false);
        if (!isAbortError(e)) {
          // 실패한 user 턴을 historyRef·버블에서 제거 — 재제출 시 중복·order 불일치 방지(L5).
          if (
            historyRef.current.length > 0 &&
            historyRef.current[historyRef.current.length - 1].role === 'user'
          ) {
            historyRef.current.pop();
          }
          setBubbles((b) => {
            const copy = [...b];
            for (let i = copy.length - 1; i >= 0; i -= 1) {
              if (copy[i].role === 'me') {
                copy.splice(i, 1);
                break;
              }
            }
            return copy;
          });
          setAiError('Ted의 답을 받지 못했어요. 다시 시도해주세요.');
          setAwaitingUser(true);
        }
      }
    },
    [state, aiConfig, sessionId, level, lesson, tts, ttsEnabled, advance],
  );

  const handleConvRecord = useCallback(async () => {
    if (!aiConfig) return;
    setAiError(null);
    if (recorder.status === 'recording') {
      const uri = await recorder.stop();
      if (!uri) return;
      const seconds = Math.round(recorder.recordedMs / 1000);
      setBusy(true);
      try {
        const transcript = await transcribeUri(uri, aiConfig, { signal: abortRef.current.signal });
        await submitUserTurn(transcript, seconds);
      } catch (e) {
        if (!isAbortError(e)) {
          setAiError('음성을 인식하지 못했어요. 다시 시도해주세요.');
          setAwaitingUser(true);
        }
      } finally {
        setBusy(false);
        recorder.reset();
      }
    } else {
      await recorder.start();
    }
  }, [aiConfig, recorder, submitUserTurn]);

  const handleConvText = useCallback(
    (text: string) => {
      void submitUserTurn(text, 0);
    },
    [submitUserTurn],
  );

  const handleConvRetry = useCallback(() => {
    setAiError(null);
    setAwaitingUser(true);
    recorder.reset();
  }, [recorder]);

  // ── Complete ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state || state.step !== 'complete' || summarizedRef.current) return;
    summarizedRef.current = true;
    const result = summarize(state, lesson);
    setSummary(result);

    // 드릴 평균 점수 (0~100 정수). 통과 기록이 없으면 50 (대화만으로 완주한 경우의 보수적 기본값)
    const scores = drillScoresRef.current;
    const avg =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 50;

    const speakingSeconds = Math.round(state.speakingSeconds);
    const repo = getProgressRepo();
    if (repo && sessionId) {
      // 단일 async 흐름으로 순서 보장: completeSession → recordProgress → applyReward.
      // applyReward(낙관적 UI 보상)는 repo 기록이 성공한 뒤에만 적용해 이중 보상을 막는다.
      // recordProgress의 PK 충돌(23505)은 repo가 멱등 무시하므로 throw하지 않는다.
      void (async () => {
        try {
          await repo.completeSession(sessionId, { feedbackSummary: result });
          await repo.recordProgress({ lessonId: lesson.id, speakingSeconds, score: avg });
          applyReward({ xp: result.xp, speakingSeconds });
        } catch {
          // 기록 실패 시 보상을 적용하지 않는다(서버 권위 통계와의 정합 유지)
        }
      })();
    } else {
      // repo 없음(mock 미로그인 등) — 로컬 보상만 적용
      applyReward({ xp: result.xp, speakingSeconds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.step]);

  // ── 렌더 ─────────────────────────────────────────────────────────────────────────
  if (loadError) return <FullMessage text={loadError} onBack={() => router.back()} />;
  if (!state) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.ted} />
      </View>
    );
  }

  const stepNum = STEP_NUMBER[state.step];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="레슨 닫기">
          <Text style={styles.close}>✕</Text>
        </Pressable>
        <View style={styles.progress}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={[styles.seg, n <= Math.min(stepNum, 3) && styles.segFill]} />
          ))}
        </View>
        <Text style={styles.stepTag}>STEP {Math.min(stepNum, 3)}</Text>
      </View>

      <View style={styles.body}>
        {!ttsEnabled && state.step !== 'complete' && (
          <Text style={styles.aiNotice}>
            AI 기능을 사용하려면 개발 환경에서 키를 설정하세요.
          </Text>
        )}

        {state.step === 'learn' && (
          <LearnStep
            keyPhrases={lesson.keyPhrases}
            ttsEnabled={ttsEnabled}
            onPlay={(t) => void tts.playPhrase(t)}
            onContinue={onCompleteLearn}
          />
        )}

        {state.step === 'drill' && (
          <DrillStep
            drill={lesson.drills[state.drillIndex]}
            index={state.drillIndex}
            total={lesson.drills.length}
            ttsEnabled={ttsEnabled}
            micDenied={recorder.status === 'denied' || !ttsEnabled}
            recording={recorder.status === 'recording'}
            processing={busy || recorder.status === 'processing'}
            result={drillResult}
            canSkip={state.canSkipDrill}
            error={aiError}
            onToggleRecord={() => void handleDrillRecord()}
            onSubmitText={handleDrillText}
            onPlayModel={() => void tts.playPhrase(lesson.drills[state.drillIndex].text)}
            onSkip={handleDrillSkip}
            onRetry={handleDrillRetry}
          />
        )}

        {state.step === 'conversation' && (
          <ConversationStep
            bubbles={bubbles}
            micDenied={recorder.status === 'denied' || !ttsEnabled}
            recording={recorder.status === 'recording'}
            processing={busy || recorder.status === 'processing'}
            awaitingUser={awaitingUser}
            thinking={thinking}
            error={aiError}
            onToggleRecord={() => void handleConvRecord()}
            onSubmitText={handleConvText}
            onRetry={handleConvRetry}
            onSaveCorrection={(c, context) => void saveCorrection(c, context)}
            isSaved={isSaved}
          />
        )}

        {state.step === 'complete' && summary && (
          <CompleteStep
            summary={summary}
            streak={streak}
            onHome={() => router.replace('/(tabs)/home')}
          />
        )}
      </View>
    </View>
  );
}

function FullMessage({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <View style={[styles.container, styles.center]}>
      <Text style={styles.message}>{text}</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>돌아가기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, padding: 24, paddingTop: 64 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  close: { color: colors.ink40, fontSize: 18 },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  seg: { flex: 1, height: 7, borderRadius: radius.pill, backgroundColor: colors.ink12 },
  segFill: { backgroundColor: colors.ted },
  stepTag: { color: colors.ted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  body: { flex: 1, marginTop: 18 },
  aiNotice: {
    color: colors.ink60,
    fontSize: 12.5,
    backgroundColor: colors.goldSoft,
    padding: 12,
    borderRadius: radius.button,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: { color: colors.ink, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  backBtn: {
    backgroundColor: colors.ted,
    borderRadius: radius.button,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  backText: { color: colors.paper, fontSize: 15, fontWeight: '700' },
});
