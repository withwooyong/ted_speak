import type { CEFRLevel, LearningGoal } from '@ted-speak/shared';
import { colors, radius } from '@ted-speak/shared';
import { useRouter } from 'expo-router';
import { AudioModule } from 'expo-audio';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { authMode, supabase } from '@/lib/supabase';
import { buildProfileUpdate } from '@/stores/user-core';
import { useAuthStore } from '@/stores/auth';
import { useUserStore } from '@/stores/user';

type Choice<T> = { value: T; icon: string; title: string; sub: string };

const GOALS: Choice<LearningGoal>[] = [
  { value: 'daily', icon: '☕️', title: '일상 회화', sub: '친구처럼 자연스럽게 대화하기' },
  { value: 'business', icon: '💼', title: '비즈니스', sub: '회의·이메일·발표 영어' },
  { value: 'travel', icon: '✈️', title: '여행', sub: '공항·호텔·식당에서 당황하지 않기' },
];

// 프로토타입은 초급(A1~A2)/중급(B1) 2단계 + "잘 모르겠어요"를 제시한다.
// CEFRLevel은 A1·A2·B1·B2 — 진단은 Phase 이후이므로 "잘 모르겠어요"는 보수적으로 A2로 둔다.
const LEVELS: Choice<CEFRLevel>[] = [
  { value: 'A2', icon: '🌱', title: '초급 (A1~A2)', sub: '단어 위주, 문장이 잘 안 나와요' },
  { value: 'B1', icon: '🌿', title: '중급 (B1)', sub: '간단한 대화는 가능하지만 막혀요' },
  { value: 'A2', icon: '🧭', title: '잘 모르겠어요', sub: '우선 초급으로 시작해요 (나중에 변경 가능)' },
];

const DAILY: Choice<number>[] = [
  { value: 5, icon: '⚡️', title: '5분', sub: '가볍게 습관 만들기' },
  { value: 10, icon: '🔥', title: '10분', sub: '가장 많이 선택해요' },
  { value: 15, icon: '🚀', title: '15분', sub: '빠르게 실력 올리기' },
];

const TOTAL_STEPS = 4;

/** 온보딩 — 목표 → 레벨 → 일일 목표 → 마이크 권한 (U3). */
export default function Onboarding() {
  const router = useRouter();
  const completeOnboarding = useUserStore((s) => s.completeOnboarding);
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState(0); // 0:goal 1:level 2:daily 3:mic
  const [goalIdx, setGoalIdx] = useState<number | null>(null);
  const [levelIdx, setLevelIdx] = useState<number | null>(null);
  const [dailyIdx, setDailyIdx] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);

  const back = () => {
    if (step === 0) return;
    setStep(step - 1);
  };
  const next = () => setStep(Math.min(step + 1, TOTAL_STEPS - 1));

  const finish = async (micGranted: boolean) => {
    if (finishing) return;
    if (goalIdx === null || levelIdx === null || dailyIdx === null) return;
    setFinishing(true);

    const selections = {
      goal: GOALS[goalIdx].value,
      level: LEVELS[levelIdx].value,
      dailyGoalMinutes: DAILY[dailyIdx].value,
      micGranted,
    };

    // 로컬 저장은 항상 유지한다 (서버 동기화 실패해도 진행 가능).
    completeOnboarding(selections);

    // 실로그인(supabase 모드 && !isMock)일 때만 서버 profiles 동기화.
    // buildProfileUpdate 화이트리스트 컬럼만 전송 — 통계·과금 컬럼은 서버 트리거 전담.
    if (authMode.mode === 'supabase' && supabase && user && !user.isMock) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update(buildProfileUpdate(selections, new Date().toISOString()))
          .eq('id', user.id);
        if (error) {
          // 서버 원문 노출 금지 — 경고 1줄만. 로컬 저장은 유지하고 진행한다.
          console.warn('프로필 동기화에 실패했어요. 로컬에는 저장됐어요.');
        }
      } catch {
        console.warn('프로필 동기화에 실패했어요. 로컬에는 저장됐어요.');
      }
    }

    router.replace('/(tabs)/home');
  };

  const requestMic = async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      await finish(status.granted);
    } catch {
      // 권한 요청 자체가 실패해도 텍스트 모드로 진행할 수 있어야 한다 (완료 기준).
      await finish(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Pressable style={styles.backBtn} onPress={back} disabled={step === 0}>
          <Text style={[styles.backText, step === 0 && styles.backHidden]}>‹</Text>
        </Pressable>
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[styles.dot, i <= step && styles.dotOn]} />
          ))}
        </View>
      </View>

      {step === 0 && (
        <Picker
          eyebrow="STEP 1 · 학습 목표"
          title={'어떤 영어가\n필요하세요?'}
          choices={GOALS}
          selectedIndex={goalIdx}
          onSelect={setGoalIdx}
          onNext={next}
        />
      )}
      {step === 1 && (
        <Picker
          eyebrow="STEP 2 · 레벨"
          title={'지금 영어 실력은\n어느 정도인가요?'}
          choices={LEVELS}
          selectedIndex={levelIdx}
          onSelect={setLevelIdx}
          onNext={next}
        />
      )}
      {step === 2 && (
        <Picker
          eyebrow="STEP 3 · 일일 목표"
          title={'하루에 몇 분씩\n말해볼까요?'}
          choices={DAILY}
          selectedIndex={dailyIdx}
          onSelect={setDailyIdx}
          onNext={next}
        />
      )}
      {step === 3 && (
        <View style={styles.body}>
          <Text style={styles.micHero}>🎙️</Text>
          <Text style={styles.title}>{'Ted가 들을 수 있게\n마이크를 켜주세요'}</Text>
          <Text style={styles.sub}>
            스피킹 연습과 AI 대화에 사용돼요.{'\n'}녹음은 학습 피드백에만 쓰입니다.
          </Text>
          <View style={styles.foot}>
            <Pressable
              style={[styles.cta, finishing && styles.ctaDisabled]}
              onPress={requestMic}
              disabled={finishing}>
              <Text style={styles.ctaText}>마이크 허용하기</Text>
            </Pressable>
            <Pressable
              style={[styles.ghostBtn, finishing && styles.ctaDisabled]}
              onPress={() => finish(false)}
              disabled={finishing}>
              <Text style={styles.ghostText}>나중에 — 텍스트로 학습하기</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function Picker<T>({
  eyebrow,
  title,
  choices,
  selectedIndex,
  onSelect,
  onNext,
}: {
  eyebrow: string;
  title: string;
  choices: Choice<T>[];
  selectedIndex: number | null;
  onSelect: (i: number) => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.body}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        {choices.map((c, i) => {
          const on = selectedIndex === i;
          return (
            <Pressable
              key={i}
              style={[styles.choice, on && styles.choiceOn]}
              onPress={() => onSelect(i)}>
              <Text style={styles.choiceIcon}>{c.icon}</Text>
              <View style={styles.choiceText}>
                <Text style={styles.choiceTitle}>{c.title}</Text>
                <Text style={styles.choiceSub}>{c.sub}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.foot}>
        <Pressable
          style={[styles.cta, selectedIndex === null && styles.ctaDisabled]}
          onPress={onNext}
          disabled={selectedIndex === null}>
          <Text style={styles.ctaText}>다음</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, paddingTop: 56 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: 40 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backText: { color: colors.ink, fontSize: 30, fontWeight: '600', lineHeight: 34 },
  backHidden: { opacity: 0 },
  dots: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  dot: { width: 18, height: 5, borderRadius: radius.pill, backgroundColor: colors.ink12 },
  dotOn: { backgroundColor: colors.ted },
  body: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  scroll: { paddingTop: 16, paddingBottom: 12 },
  eyebrow: { color: colors.ted, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800', lineHeight: 35, marginTop: 8, marginBottom: 20 },
  sub: { color: colors.ink60, fontSize: 14, lineHeight: 21, marginTop: 12, textAlign: 'center' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.ink06,
    padding: 16,
    marginBottom: 12,
  },
  choiceOn: { borderColor: colors.ted, backgroundColor: colors.tedSoft },
  choiceIcon: { fontSize: 26, marginRight: 14 },
  choiceText: { flex: 1 },
  choiceTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  choiceSub: { color: colors.ink60, fontSize: 13, marginTop: 3 },
  micHero: { fontSize: 64, textAlign: 'center', marginTop: 48 },
  foot: { marginTop: 'auto', paddingTop: 16 },
  cta: {
    backgroundColor: colors.ted,
    borderRadius: radius.button,
    paddingVertical: 17,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: colors.paper, fontSize: 16, fontWeight: '700' },
  ghostBtn: { paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  ghostText: { color: colors.ink60, fontSize: 14, fontWeight: '600' },
});
