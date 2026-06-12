import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

import { createAuthSlice, type AuthSlice } from './auth-core';

export const useAuthStore = create<AuthSlice>((set) => createAuthSlice(set));

/**
 * 앱 루트에서 1회 호출 — Supabase 세션 변화를 스토어에 반영.
 * 반환된 함수로 구독 해제 (hot reload 시 리스너 중복 방지).
 */
export function initAuthListener(): () => void {
  if (!supabase) return () => {}; // mock 모드 — 리스너 불필요
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore
      .getState()
      .setSession(
        session?.user ? { userId: session.user.id, email: session.user.email ?? '' } : null,
      );
  });
  return () => subscription.unsubscribe();
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) throw new Error('Supabase 미설정 — Dev Mock 로그인을 사용하세요');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithEmail(email: string, password: string) {
  if (!supabase) throw new Error('Supabase 미설정 — Dev Mock 로그인을 사용하세요');
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  useAuthStore.getState().signOut();
}
