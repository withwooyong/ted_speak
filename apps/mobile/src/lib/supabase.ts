import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { resolveAuthMode } from './auth-config';

// 세션 저장소: 네이티브는 AsyncStorage, 웹은 supabase-js 기본(localStorage, SSR 시 메모리).
// AsyncStorage 웹 구현이 SSR(정적 export)에서 window를 참조해 깨지므로 네이티브에서만 로드한다.
const nativeStorage =
  Platform.OS === 'web'
    ? undefined
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('@react-native-async-storage/async-storage').default as typeof import('@react-native-async-storage/async-storage').default);

export const authMode = resolveAuthMode(
  {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
  { isProd: !__DEV__ },
);

/**
 * Supabase 클라이언트 — 환경변수 완전 설정 시에만 생성.
 * null이면 Dev Mock Auth 모드 (앱은 항상 부팅 가능, p0 리스크 대응).
 * anon key는 RLS 전제의 공개 키 — service_role 키는 절대 앱에 두지 않는다.
 */
export const supabase: SupabaseClient | null =
  authMode.mode === 'supabase'
    ? createClient(authMode.url, authMode.anonKey, {
        auth: {
          storage: nativeStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
