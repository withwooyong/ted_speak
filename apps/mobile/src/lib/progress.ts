/**
 * progress.ts — ProgressRepo 팩토리 (앱 연결 지점).
 * 모드 분기(supabase/mock)는 lib/supabase.ts의 authMode를 단일 출처로 따른다.
 */
import { Platform } from 'react-native';

import { useAuthStore } from '@/stores/auth';

import {
  createMockProgressRepo,
  createSupabaseProgressRepo,
  type KeyValueStorage,
  type ProgressRepo,
} from './progress-repo';
import { supabase } from './supabase';

// mock 모드 영속 저장소: 네이티브는 AsyncStorage, 웹은 메모리 폴백 (stores/user.ts와 동일 패턴)
const memoryStore = new Map<string, string>();
const mockStorage: KeyValueStorage =
  Platform.OS === 'web'
    ? {
        getItem: async (k) => memoryStore.get(k) ?? null,
        setItem: async (k, v) => void memoryStore.set(k, v),
      }
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('@react-native-async-storage/async-storage')
        .default as typeof import('@react-native-async-storage/async-storage').default);

let cached: { userId: string; repo: ProgressRepo } | null = null;

/**
 * 현재 로그인 사용자의 ProgressRepo를 반환한다.
 * supabase 모드인데 미로그인이면 null — 호출 화면은 로그인으로 유도해야 한다.
 */
export function getProgressRepo(): ProgressRepo | null {
  const user = useAuthStore.getState().user;
  if (!user) return null;

  if (cached?.userId === user.id) return cached.repo;

  // SupabaseLike는 테스트 fake와 공유하는 최소 구조 타입 — 실제 클라이언트의 제네릭
  // 시그니처와 구조적으로 호환되지 않아 이 경계에서만 명시적으로 좁힌다.
  const repo =
    supabase && !user.isMock
      ? createSupabaseProgressRepo(
          supabase as unknown as Parameters<typeof createSupabaseProgressRepo>[0],
          user.id,
        )
      : // mock 저장소는 user.id로 네임스페이스 — 공유 단말에서 사용자 간 데이터 격리(PII)
        createMockProgressRepo(mockStorage, { namespace: user.id });
  cached = { userId: user.id, repo };
  return repo;
}

// 로그아웃 시 캐시 정리 — 이전 사용자의 repo 인스턴스를 버린다.
// userId 키 검사 덕에 캐시가 다른 사용자에게 잘못 서빙될 수는 없지만, 메모리 잔존을 막는다.
// auth.ts에서 직접 호출하지 않고 여기서 구독하는 이유: auth ↔ progress require cycle 방지.
useAuthStore.subscribe((s) => {
  if (!s.user) cached = null;
});
