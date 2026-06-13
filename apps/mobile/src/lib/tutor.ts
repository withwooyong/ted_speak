/**
 * tutor.ts — TutorRepo 팩토리 (앱 연결 지점). progress.ts와 동일 패턴.
 * 모드 분기(supabase/mock)는 lib/supabase.ts의 authMode를 단일 출처로 따른다.
 */
import { Platform } from 'react-native';

import { useAuthStore } from '@/stores/auth';

import { supabase } from './supabase';
import {
  createMockTutorRepo,
  createSupabaseTutorRepo,
  type KeyValueStorage,
  type TutorRepo,
} from './tutor-repo';

// mock 모드 영속 저장소: 네이티브는 AsyncStorage, 웹은 메모리 폴백 (progress.ts와 동일 패턴)
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

let cached: { userId: string; repo: TutorRepo } | null = null;

/**
 * 현재 로그인 사용자의 TutorRepo를 반환한다.
 * supabase 모드인데 미로그인이면 null — 호출 화면은 로그인으로 유도해야 한다.
 */
export function getTutorRepo(): TutorRepo | null {
  const user = useAuthStore.getState().user;
  if (!user) return null;

  if (cached?.userId === user.id) return cached.repo;

  const repo =
    supabase && !user.isMock
      ? createSupabaseTutorRepo(
          supabase as unknown as Parameters<typeof createSupabaseTutorRepo>[0],
          user.id,
        )
      : // mock 저장소는 user.id로 네임스페이스 — 공유 단말에서 사용자 간 데이터 격리(PII)
        createMockTutorRepo(mockStorage, { namespace: user.id });
  cached = { userId: user.id, repo };
  return repo;
}

// 로그아웃 시 캐시 정리 (progress.ts와 동일 — auth ↔ tutor require cycle 방지)
useAuthStore.subscribe((s) => {
  if (!s.user) cached = null;
});
