import { beforeEach, describe, expect, it } from 'vitest';

import { createAuthSlice, type AuthSlice } from '../src/stores/auth-core';

/** zustand 없이 슬라이스 로직만 검증 — set/get을 수동 주입 */
function makeStore() {
  let state: AuthSlice;
  const set = (partial: Partial<AuthSlice>) => {
    state = { ...state, ...partial };
  };
  state = createAuthSlice(set);
  return {
    get: () => state,
  };
}

describe('auth slice — Dev Mock Auth (T4)', () => {
  let store: ReturnType<typeof makeStore>;
  beforeEach(() => {
    store = makeStore();
  });

  it('초기 상태는 미인증', () => {
    expect(store.get().user).toBeNull();
    expect(store.get().status).toBe('signed_out');
  });

  it('signInMock은 dev 사용자로 인증 상태를 만든다', () => {
    store.get().signInMock();
    const { user, status } = store.get();
    expect(status).toBe('signed_in');
    expect(user?.isMock).toBe(true);
    expect(user?.id).toBeTruthy();
    expect(user?.email).toContain('@');
  });

  it('signInMock은 중복 호출해도 동일 상태 (멱등)', () => {
    store.get().signInMock();
    const first = store.get().user;
    store.get().signInMock();
    expect(store.get().user).toEqual(first);
    expect(store.get().status).toBe('signed_in');
  });

  it('signOut은 미인증으로 되돌린다', () => {
    store.get().signInMock();
    store.get().signOut();
    expect(store.get().user).toBeNull();
    expect(store.get().status).toBe('signed_out');
  });

  it('setSession은 Supabase 세션 사용자를 반영한다 (mock 아님)', () => {
    store.get().setSession({ userId: 'uuid-1', email: 'real@user.com' });
    const { user } = store.get();
    expect(user?.isMock).toBe(false);
    expect(user?.id).toBe('uuid-1');
  });

  it('setSession(null)은 로그아웃 처리한다', () => {
    store.get().setSession({ userId: 'uuid-1', email: 'real@user.com' });
    store.get().setSession(null);
    expect(store.get().status).toBe('signed_out');
  });
});
