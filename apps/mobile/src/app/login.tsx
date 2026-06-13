import { colors, radius } from '@ted-speak/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { authMode } from '@/lib/supabase';
import { canShowMockLogin, mapAuthError, validateEmailForm } from '@/lib/login-core';
import { signInWithEmail, signUpWithEmail, useAuthStore } from '@/stores/auth';
import { useUserStore } from '@/stores/user';

type Mode = 'signin' | 'signup';

/**
 * 이메일 로그인/가입 (U8).
 *
 * 보안:
 *  - 서버 인증 에러는 절대 원문 노출하지 않는다 — mapAuthError로 정적 메시지만 표시.
 *  - Dev Mock 로그인 버튼은 canShowMockLogin 게이트로만 노출한다. 스토어(signInMock)에는
 *    별도 가드가 없으므로(HANDOFF Known Issue), 이 UI 게이트가 prod 유출을 막는 유일한 방어선이다.
 */
export default function Login() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const onboarded = useUserStore((s) => s.onboarded);
  const hydrating = useUserStore((s) => s.hydrating);
  const signInMock = useAuthStore((s) => s.signInMock);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<{ field: 'email' | 'password'; message: string } | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 로그인/가입 성공 후 라우팅은 반응형으로 처리한다 — 직접 router.replace를 호출하면
  // ① onAuthStateChange가 다음 마이크로태스크에 발화해 status가 아직 signed_out인 창에 걸리고
  // ② 스테일 클로저 onboarded(로그아웃 reset 직후 false)로 서버 하이드레이트를 우회한다.
  // status·hydrating·onboarded가 확정되면 effect가 다시 돌아 올바른 목적지로 보낸다.
  // hydrating 동안 대기해야 supabase 실로그인의 onboarded가 서버 값으로 확정된 뒤 라우팅된다.
  useEffect(() => {
    if (status !== 'signed_in' || hydrating) return;
    router.replace(onboarded ? '/(tabs)/home' : '/onboarding');
  }, [status, hydrating, onboarded, router]);

  const submit = async () => {
    if (submitting) return; // 이중 제출 방지
    setFieldError(null);
    setFormError(null);
    setInfo(null);

    const result = validateEmailForm(email, password);
    if (!result.ok) {
      setFieldError({ field: result.field, message: result.message });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        // 라우팅은 위 effect가 status/hydrating 확정 후 처리한다.
        await signInWithEmail(email.trim(), password);
      } else {
        await signUpWithEmail(email.trim(), password);
        // 로컬 supabase는 즉시 로그인됨 → onAuthStateChange가 status를 바꾸면 effect가 라우팅한다.
        // 이메일 확인이 필요한 환경(원격)에서는 세션이 없으므로 확인 안내만 표시한다.
        if (useAuthStore.getState().status !== 'signed_in') {
          setInfo('확인 이메일을 보냈어요. 메일의 링크를 눌러 가입을 완료해 주세요.');
        }
      }
    } catch (error) {
      // 서버 원문 금지 — mapAuthError 경유 정적 메시지만
      setFormError(mapAuthError(error as { message?: string; status?: number }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleMockLogin = () => {
    // mock 모드는 hydrating이 항상 false라 effect가 즉시 onboarded 기준으로 라우팅한다.
    signInMock();
  };

  const showMock = canShowMockLogin(authMode.mode, !__DEV__);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <Text style={styles.logo}>
          Talk<Text style={styles.logoAccent}>Ted</Text>
        </Text>
        <Text style={styles.tag}>매일 5분, 진짜 입으로 말하는 영어.</Text>

        <View style={styles.toggleRow}>
          <Pressable
            style={[styles.toggle, mode === 'signin' && styles.toggleOn]}
            onPress={() => setMode('signin')}>
            <Text style={[styles.toggleText, mode === 'signin' && styles.toggleTextOn]}>로그인</Text>
          </Pressable>
          <Pressable
            style={[styles.toggle, mode === 'signup' && styles.toggleOn]}
            onPress={() => setMode('signup')}>
            <Text style={[styles.toggleText, mode === 'signup' && styles.toggleTextOn]}>회원가입</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>이메일</Text>
        <TextInput
          style={[styles.input, fieldError?.field === 'email' && styles.inputError]}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.ink40}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!submitting}
        />
        {fieldError?.field === 'email' && <Text style={styles.fieldErr}>{fieldError.message}</Text>}

        <Text style={styles.label}>비밀번호</Text>
        <TextInput
          style={[styles.input, fieldError?.field === 'password' && styles.inputError]}
          value={password}
          onChangeText={setPassword}
          placeholder="8자 이상"
          placeholderTextColor={colors.ink40}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          editable={!submitting}
        />
        {fieldError?.field === 'password' && (
          <Text style={styles.fieldErr}>{fieldError.message}</Text>
        )}

        {formError && <Text style={styles.formErr}>{formError}</Text>}
        {info && <Text style={styles.info}>{info}</Text>}

        <Pressable
          style={[styles.cta, submitting && styles.ctaDisabled]}
          onPress={submit}
          disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.paper} />
          ) : (
            <Text style={styles.ctaText}>{mode === 'signin' ? '로그인' : '회원가입'}</Text>
          )}
        </Pressable>

        {showMock && (
          <Pressable style={styles.mockBtn} onPress={handleMockLogin} disabled={submitting}>
            <Text style={styles.mockText}>개발용 로그인 (Dev Mock)</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
  logo: { color: colors.ink, fontSize: 34, fontWeight: '800' },
  logoAccent: { color: colors.ted },
  tag: { color: colors.ink60, fontSize: 14, marginTop: 8, marginBottom: 28 },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.ink06,
    borderRadius: radius.button,
    padding: 4,
    marginBottom: 24,
  },
  toggle: { flex: 1, paddingVertical: 11, borderRadius: radius.button - 4, alignItems: 'center' },
  toggleOn: { backgroundColor: colors.paper },
  toggleText: { color: colors.ink60, fontSize: 14, fontWeight: '700' },
  toggleTextOn: { color: colors.ink },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: colors.paper,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.ink12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 6,
  },
  inputError: { borderColor: colors.ted },
  fieldErr: { color: colors.tedDeep, fontSize: 12.5, marginBottom: 10 },
  formErr: { color: colors.tedDeep, fontSize: 13, marginTop: 6, marginBottom: 4 },
  info: { color: colors.mint, fontSize: 13, marginTop: 6, marginBottom: 4 },
  cta: {
    backgroundColor: colors.ted,
    borderRadius: radius.button,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 18,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: colors.paper, fontSize: 16, fontWeight: '700' },
  mockBtn: {
    borderRadius: radius.button,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.ink12,
  },
  mockText: { color: colors.ink60, fontSize: 14, fontWeight: '600' },
});
