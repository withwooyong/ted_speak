/**
 * profile-sync.ts — supabase 실로그인 시 서버 profiles 1회 재조회·하이드레이트 (P1.5 V1).
 *
 * 재로그인/새 기기 로그인 시 로컬 스토어는 비어 있으므로, 서버에 온보딩이 저장된 기존 사용자가
 * 온보딩을 다시 타고 서버 streak·통계가 화면에 반영되지 않는 결함을 해소한다.
 *
 * auth.ts ↔ user.ts 직접 import로 require cycle을 만들지 않기 위해, lib/progress.ts와 동일하게
 * 모듈 측에서 auth 스토어를 구독한다(앱 루트의 사이드이펙트 import로 1회 로드).
 */
import type { HydrationPatch, ProfileRow } from '@/stores/user-core';
import { profileToHydration } from '@/stores/user-core';
import { useAuthStore } from '@/stores/auth';
import { useUserStore } from '@/stores/user';

import { supabase } from './supabase';

// 직전 처리한 userId — 같은 세션에서 구독이 재발화돼도 중복 조회를 막는다.
// fetch 시작 전 동기 구간에서 세팅되므로 같은 userId 중복은 이것만으로 충분하다 —
// 별도 in-flight 플래그를 두면 사용자 전환(A 로그아웃 → B 로그인) 중 A의 fetch가 진행 중일 때
// B의 하이드레이트가 스킵되는 크로스유저 결함이 생긴다.
let lastHandledUserId: string | null = null;

async function hydrateForUser(userId: string): Promise<void> {
  // supabase null은 구독 레이어에서 이미 필터링됨 — 타입 내로잉을 위한 방어 중복.
  if (!supabase) return;

  let patch: HydrationPatch | null = null;
  let failed = false;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('goal, level, daily_goal_minutes, streak, last_study_date, onboarded_at')
      .eq('id', userId)
      .single();
    if (error || !data) failed = true;
    else patch = profileToHydration(data as ProfileRow);
  } catch {
    failed = true;
  }

  // 스테일 응답 가드 (성공·실패 공통): fetch 중 로그아웃·다른 사용자 로그인이 일어났다면
  // patch 적용·setHydrating(false) 모두 건너뛰고 폐기한다 — 타인 스토어에 PII 주입 금지.
  // hydrating 정리 책임: 로그아웃이면 reset()이, 새 사용자 흐름이면 자기 fetch가 진다.
  if (useAuthStore.getState().user?.id !== userId) return;

  if (failed) {
    // 서버 원문 노출 금지 — 경고 1줄만. 로컬 상태로 폴백(온보딩 재진입 허용, 진행 차단 금지).
    console.warn('프로필 동기화에 실패했어요. 로컬 상태로 진행해요.');
  } else if (patch) {
    useUserStore.getState().hydrateFromServer(patch);
  }
  useUserStore.getState().setHydrating(false);
}

// auth 스토어 구독 — 실로그인(존재·!isMock·새 userId) 시 1회 하이드레이트.
// auth.ts에서 직접 호출하지 않고 여기서 구독하는 이유: auth ↔ user/progress require cycle 방지(progress.ts와 동일).
useAuthStore.subscribe((s) => {
  const user = s.user;

  // 로그아웃 — 직전 처리 캐시 초기화 (다음 로그인 시 다시 하이드레이트)
  if (!user) {
    lastHandledUserId = null;
    // 리스너 경유 로그아웃(세션 만료·원격 토큰 폐기)은 auth.ts signOut()을 거치지 않아
    // PII 정리가 누락된다 — 여기서 항상 정리한다(2b 재리뷰 지적). signOut() 경로와의
    // 중복 호출은 멱등. reset이 hydrating:false도 포함하므로 in-flight 잔존 플래그도 정리된다.
    // 단, persist 재수화가 reset 이후에 늦게 끝나면 옛 값이 메모리로 부활할 수 있으므로
    // (2b LOW Q3) 재수화 완료 후에 정리한다 — 이미 완료됐으면 즉시.
    const wipe = () => {
      useUserStore.getState().reset();
      void useUserStore.persist.clearStorage();
    };
    if (useUserStore.persist.hasHydrated()) wipe();
    else useUserStore.persist.onFinishHydration(wipe);
    return;
  }

  // mock 모드는 로컬 persist가 단일 출처 — 동기화 불필요
  if (user.isMock || !supabase) return;

  // 같은 userId 중복 가드 — fetch 시작 전 이 동기 구간에서 세팅된다.
  // 같은 사용자가 로그아웃→재로그인해 중복 fetch가 둘 다 apply되는 경우는 멱등이라 허용.
  // 수용 LOW: 구 fetch가 실패 응답이면 setHydrating(false)가 신 fetch 완료 전에 조기 실행될 수
  // 있다(온보딩 flash 가능, 데이터 손상 없음) — 세대 토큰 도입은 P2 W7에서 재평가.
  if (user.id === lastHandledUserId) return;
  lastHandledUserId = user.id;

  // setHydrating(true)는 반드시 이 구독 콜백의 동기 구간(첫 await 이전)에서 호출한다 —
  // auth 갱신과 같은 동기 배치에서 user 스토어도 갱신돼야 React가 렌더를 읽기 전에 두 스토어가
  // 일관되고, index.tsx가 온보딩으로 잠깐 잘못 리다이렉트(flash)하지 않는다.
  useUserStore.getState().setHydrating(true);
  void hydrateForUser(user.id);
});
