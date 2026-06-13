#!/usr/bin/env node
/**
 * RLS 검증 스크립트 (T4 보안 게이트) — 로컬 Supabase 스택 대상 공격 시나리오 테스트.
 *
 * 실행: npx tsx scripts/verify-rls.mts
 * 전제: `supabase start` + `supabase db reset` 완료 (마이그레이션·시드 적용 상태)
 *
 * 키는 Supabase 로컬 데모 키(공개 상수). 사용자 생성·삭제를 수행하므로
 * 어떤 키가 주어져도 로컬(127.0.0.1/localhost) 외 URL은 거부한다.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// 테스트 사용자를 만들고 지우는 스크립트 — 프로덕션 오발사 방지를 위해 무조건 로컬만
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL)) {
  console.error(`❌ 이 스크립트는 로컬 스택(127.0.0.1/localhost)에서만 실행할 수 있습니다: ${URL}`);
  process.exit(1);
}

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function makeUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-1234',
    email_confirm: true,
  });
  if (error) throw new Error(`사용자 생성 실패: ${error.message}`);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password: 'test-password-1234',
  });
  if (signInErr) throw new Error(`로그인 실패: ${signInErr.message}`);
  return { id: data.user.id, client };
}

type TestUser = Awaited<ReturnType<typeof makeUser>>;
let userA: TestUser | undefined;
let userB: TestUser | undefined;

try {
  const stamp = Date.now();
  userA = await makeUser(`rls-a-${stamp}@test.local`);
  userB = await makeUser(`rls-b-${stamp}@test.local`);
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });

  console.log('\n■ 콘텐츠 (courses/lessons)');
  {
    const { data } = await anon.from('courses').select('id');
    check('익명도 코스를 읽을 수 있다', (data?.length ?? 0) > 0);
    const { error } = await anon.from('courses').insert({ id: 'evil', title: 'x', level: 'A1', order: 99 });
    check('익명은 코스를 쓸 수 없다', !!error);
    const { error: authedWrite } = await userA.client
      .from('lessons')
      .update({ title: '변조' })
      .eq('id', 'lesson-003');
    const { data: after } = await anon.from('lessons').select('title').eq('id', 'lesson-003').single();
    check('인증 사용자도 레슨을 변조할 수 없다', !!authedWrite || after?.title === '취미 말하기');
  }

  console.log('\n■ 익명의 사용자 데이터 접근');
  for (const table of ['profiles', 'lesson_sessions', 'user_progress', 'conversation_turns']) {
    const { data, error } = await anon.from(table).select('*').limit(1);
    check(`익명은 ${table}을 읽을 수 없다`, !!error || (data?.length ?? 0) === 0);
  }

  console.log('\n■ profiles');
  {
    const { data: own } = await userA.client.from('profiles').select('*').eq('id', userA.id).single();
    check('트리거로 본인 프로필이 생성되고 조회된다', !!own);
    const { data: others } = await userB.client.from('profiles').select('id').eq('id', userA.id);
    check('타인 프로필은 보이지 않는다', (others?.length ?? 0) === 0);

    // 컬럼 grant 공격 — 과금·게임화 수치는 본인이라도 위조 불가
    for (const [field, value] of [
      ['is_premium', true],
      ['streak', 99999],
      ['total_speaking_seconds', 2_000_000],
      ['last_study_date', '2030-01-01'],
    ] as const) {
      const { error } = await userA.client
        .from('profiles')
        .update({ [field]: value })
        .eq('id', userA.id);
      check(`본인이라도 ${field}는 위조 불가 (컬럼 grant)`, !!error, error?.message ?? 'update 허용됨!');
    }
    const { error: nameErr } = await userA.client
      .from('profiles')
      .update({ display_name: '우용', daily_goal_minutes: 15 })
      .eq('id', userA.id);
    check('허용 컬럼(display_name 등)은 수정 가능', !nameErr, nameErr?.message);

    // onboarded_at (P1.5 V1) — 본인 온보딩 마커는 grant 추가로 수정 가능, 타인 행은 RLS가 차단.
    const { error: onbErr } = await userA.client
      .from('profiles')
      .update({ onboarded_at: new Date().toISOString() })
      .eq('id', userA.id);
    check('본인 onboarded_at은 수정 가능 (온보딩 마커 grant)', !onbErr, onbErr?.message);

    const { data: onbSpoof } = await userB.client
      .from('profiles')
      .update({ onboarded_at: new Date().toISOString() })
      .eq('id', userA.id)
      .select();
    check('타인 onboarded_at 위조 불가 (RLS 행 차단)', (onbSpoof?.length ?? 0) === 0);

    // onboarded_at grant가 다른 민감 컬럼을 함께 열지 않았는지 명시 검증 —
    // 위 "위조 불가" 루프와 별개로, onboarded_at update가 성공한 동일 클라이언트에서 재확인한다
    // (루프 순서·구성 변경에 의존하지 않는 독립 케이스).
    const { error: stillDenied } = await userA.client
      .from('profiles')
      .update({ streak: 7, is_premium: true })
      .eq('id', userA.id);
    check('onboarded_at grant 후에도 streak·is_premium은 여전히 위조 불가', !!stillDenied);
  }

  console.log('\n■ lesson_sessions / conversation_turns');
  let sessionId: string;
  {
    const { data: session, error } = await userA.client
      .from('lesson_sessions')
      .insert({ user_id: userA.id, lesson_id: 'lesson-003' })
      .select()
      .single();
    check('본인 세션 생성 가능', !!session && !error, error?.message);
    sessionId = session!.id;

    const { error: spoofErr } = await userB.client
      .from('lesson_sessions')
      .insert({ user_id: userA.id, lesson_id: 'lesson-003' });
    check('타인 명의(user_id 위조) 세션 생성 불가', !!spoofErr);

    const { data: bView } = await userB.client.from('lesson_sessions').select('id').eq('id', sessionId);
    check('타인 세션은 보이지 않는다', (bView?.length ?? 0) === 0);

    const { data: bUpdate } = await userB.client
      .from('lesson_sessions')
      .update({ status: 'completed' })
      .eq('id', sessionId)
      .select();
    check('타인 세션 갱신 불가', (bUpdate?.length ?? 0) === 0);

    // 세션 삭제 차단 — cascade로 턴(불변 로그)이 우회 삭제되는 것을 막는다
    const { data: aDelete } = await userA.client
      .from('lesson_sessions')
      .delete()
      .eq('id', sessionId)
      .select();
    check('본인 세션도 삭제 불가 (불변 로그 보존)', (aDelete?.length ?? 0) === 0);

    const { error: turnOk } = await userA.client
      .from('conversation_turns')
      .insert({ session_id: sessionId, order: 1, role: 'user', transcript: 'hello' });
    check('본인 세션에 턴 추가 가능', !turnOk, turnOk?.message);

    const { error: turnSpoof } = await userB.client
      .from('conversation_turns')
      .insert({ session_id: sessionId, order: 2, role: 'user', transcript: 'evil' });
    check('타인 세션에 턴 추가 불가', !!turnSpoof);

    const { data: turnLeak } = await userB.client
      .from('conversation_turns')
      .select('transcript')
      .eq('session_id', sessionId);
    check('타인 대화 내용(전사) 열람 불가', (turnLeak?.length ?? 0) === 0);

    // 턴 불변성 — 본인조차 수정·삭제 불가
    const { data: turnEdit } = await userA.client
      .from('conversation_turns')
      .update({ transcript: '조작된 기록' })
      .eq('session_id', sessionId)
      .select();
    check('본인도 턴 수정 불가 (불변 로그)', (turnEdit?.length ?? 0) === 0);
    const { data: turnDel } = await userA.client
      .from('conversation_turns')
      .delete()
      .eq('session_id', sessionId)
      .select();
    check('본인도 턴 삭제 불가 (불변 로그)', (turnDel?.length ?? 0) === 0);
  }

  console.log('\n■ user_progress + 통계 트리거');
  {
    const { error } = await userA.client
      .from('user_progress')
      .insert({ user_id: userA.id, lesson_id: 'lesson-003', speaking_seconds: 240, score: 95 });
    check('본인 진행도 기록 가능', !error, error?.message);

    const { data: prof } = await userA.client
      .from('profiles')
      .select('streak, total_speaking_seconds')
      .eq('id', userA.id)
      .single();
    check('트리거가 발화 시간을 누적한다', prof?.total_speaking_seconds === 240, JSON.stringify(prof));
    check('트리거가 streak을 갱신한다', prof?.streak === 1, JSON.stringify(prof));

    const { error: spoof } = await userB.client
      .from('user_progress')
      .insert({ user_id: userA.id, lesson_id: 'lesson-003', speaking_seconds: 1, score: 1 });
    check('타인 명의 진행도 기록 불가', !!spoof);

    const { error: hugeErr } = await userB.client
      .from('user_progress')
      .insert({ user_id: userB.id, lesson_id: 'lesson-003', speaking_seconds: 999999 });
    check('발화 시간 1시간 초과 기록 불가 (CHECK)', !!hugeErr);

    // farming 우회 차단 — update로 PK(lesson_id)·speaking_seconds 변경 불가, score만 허용
    const { error: pkShift } = await userA.client
      .from('user_progress')
      .update({ lesson_id: 'lesson-004' })
      .eq('user_id', userA.id);
    check('진행도 lesson_id 변경 불가 (재삽입 farming 차단)', !!pkShift);
    const { error: secEdit } = await userA.client
      .from('user_progress')
      .update({ speaking_seconds: 3600 })
      .eq('user_id', userA.id);
    check('진행도 speaking_seconds 변경 불가 (집계 불변)', !!secEdit);
    const { error: scoreEdit } = await userA.client
      .from('user_progress')
      .update({ score: 88 })
      .eq('user_id', userA.id)
      .eq('lesson_id', 'lesson-003');
    check('허용 컬럼(score)은 수정 가능', !scoreEdit, scoreEdit?.message);

    const { data: delTry } = await userA.client
      .from('user_progress')
      .delete()
      .eq('user_id', userA.id)
      .select();
    check('진행도 삭제 불가 (삭제→재삽입 farming 차단)', (delTry?.length ?? 0) === 0);
  }
} finally {
  if (userA) await admin.auth.admin.deleteUser(userA.id).catch(() => {});
  if (userB) await admin.auth.admin.deleteUser(userB.id).catch(() => {});
}

console.log(`\n${'─'.repeat(48)}\n결과: ${passed} 통과 / ${failed} 실패`);
process.exit(failed === 0 ? 0 : 1);
