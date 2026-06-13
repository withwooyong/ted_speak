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
  for (const table of ['profiles', 'lesson_sessions', 'user_progress', 'conversation_turns', 'saved_expressions']) {
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

  console.log('\n■ tutor_sessions / tutor_turns (프리토킹 — P2 W2)');
  {
    const { data: ts, error: tsErr } = await userA.client
      .from('tutor_sessions')
      .insert({ user_id: userA.id, topic: 'hobbies' })
      .select()
      .single();
    check('본인 튜터 세션 생성 가능', !!ts && !tsErr, tsErr?.message);
    const tutorSessionId = ts!.id;

    const { error: tsSpoof } = await userB.client
      .from('tutor_sessions')
      .insert({ user_id: userA.id, topic: 'evil' });
    check('타인 명의 튜터 세션 생성 불가', !!tsSpoof);

    const { data: tsView } = await userB.client
      .from('tutor_sessions')
      .select('id')
      .eq('id', tutorSessionId);
    check('타인 튜터 세션은 보이지 않는다', (tsView?.length ?? 0) === 0);

    const { data: tsUpd } = await userB.client
      .from('tutor_sessions')
      .update({ status: 'completed' })
      .eq('id', tutorSessionId)
      .select();
    check('타인 튜터 세션 갱신 불가', (tsUpd?.length ?? 0) === 0);

    // ── 안티-파밍: 본인도 lifecycle 컬럼을 직접 위조할 수 없다 (grant 미부여) ──
    // duration_seconds/turn_count/started_at/status를 직접 쓰면 일일 캡이 무력화되므로
    // insert는 (user_id, topic)만, 완료는 complete_tutor_session RPC만 허용한다.
    const { error: durInsert } = await userA.client
      .from('tutor_sessions')
      .insert({ user_id: userA.id, topic: 'hobbies', duration_seconds: 0 });
    check('duration_seconds 직접 insert 불가 (grant)', !!durInsert, durInsert?.message);

    const { error: durForge } = await userA.client
      .from('tutor_sessions')
      .update({ duration_seconds: 0 })
      .eq('id', tutorSessionId);
    check('본인 duration_seconds 직접 update 불가 (캡 우회 차단)', !!durForge, durForge?.message);

    const { error: turnForge } = await userA.client
      .from('tutor_sessions')
      .update({ turn_count: 9999 })
      .eq('id', tutorSessionId);
    check('본인 turn_count 직접 update 불가', !!turnForge, turnForge?.message);

    const { error: statusForge } = await userA.client
      .from('tutor_sessions')
      .update({ status: 'completed' })
      .eq('id', tutorSessionId);
    check('본인 status 직접 update 불가 (RPC만 완료)', !!statusForge, statusForge?.message);

    // ── 서버 권위 완료 RPC ──
    // 타인 세션은 RPC로도 완료 불가 (함수 내 user_id = auth.uid() 가드)
    await userB.client.rpc('complete_tutor_session', {
      p_session_id: tutorSessionId,
      p_turn_count: 1,
      p_summary: {},
    });
    const { data: afterBRpc } = await userA.client
      .from('tutor_sessions')
      .select('status')
      .eq('id', tutorSessionId)
      .single();
    check('타인은 RPC로도 세션 완료 불가', afterBRpc?.status === 'in_progress', JSON.stringify(afterBRpc));

    // 본인 세션은 RPC로 완료되고 duration_seconds를 서버가 산정한다
    const { error: rpcErr } = await userA.client.rpc('complete_tutor_session', {
      p_session_id: tutorSessionId,
      p_turn_count: 3,
      p_summary: { ok: true },
    });
    const { data: afterARpc } = await userA.client
      .from('tutor_sessions')
      .select('status, duration_seconds, turn_count')
      .eq('id', tutorSessionId)
      .single();
    check(
      '본인 세션 RPC 완료 — status·서버 duration 산정',
      !rpcErr && afterARpc?.status === 'completed' && typeof afterARpc?.duration_seconds === 'number' && afterARpc?.turn_count === 3,
      JSON.stringify(afterARpc),
    );

    // 세션 삭제 차단 — cascade로 턴(불변 로그)이 우회 삭제되는 것을 막는다
    const { data: tsDel } = await userA.client
      .from('tutor_sessions')
      .delete()
      .eq('id', tutorSessionId)
      .select();
    check('본인 튜터 세션도 삭제 불가 (불변 로그 보존)', (tsDel?.length ?? 0) === 0);

    const { error: turnOk } = await userA.client
      .from('tutor_turns')
      .insert({ session_id: tutorSessionId, order: 1, role: 'user', transcript: 'hello ted' });
    check('본인 튜터 세션에 턴 추가 가능', !turnOk, turnOk?.message);

    const { error: turnSpoof } = await userB.client
      .from('tutor_turns')
      .insert({ session_id: tutorSessionId, order: 2, role: 'user', transcript: 'evil' });
    check('타인 튜터 세션에 턴 추가 불가', !!turnSpoof);

    const { data: turnLeak } = await userB.client
      .from('tutor_turns')
      .select('transcript')
      .eq('session_id', tutorSessionId);
    check('타인 튜터 대화 내용 열람 불가', (turnLeak?.length ?? 0) === 0);

    // 턴 불변성 — 본인조차 수정·삭제 불가
    const { data: turnEdit } = await userA.client
      .from('tutor_turns')
      .update({ transcript: '조작' })
      .eq('session_id', tutorSessionId)
      .select();
    check('본인도 튜터 턴 수정 불가 (불변 로그)', (turnEdit?.length ?? 0) === 0);
    const { data: turnDel } = await userA.client
      .from('tutor_turns')
      .delete()
      .eq('session_id', tutorSessionId)
      .select();
    check('본인도 튜터 턴 삭제 불가 (불변 로그)', (turnDel?.length ?? 0) === 0);
  }

  console.log('\n■ saved_expressions (저장된 표현 — P2 W5)');
  {
    const { data: se, error: seErr } = await userA.client
      .from('saved_expressions')
      .insert({ user_id: userA.id, original: 'I go yesterday', suggested: 'I went yesterday', type: 'grammar', context: 'ctx' })
      .select()
      .single();
    check('본인 표현 저장 가능', !!se && !seErr, seErr?.message);
    const savedId = se!.id;

    // 서버 권위 컬럼은 default — 직접 위조 불가(grant 미부여)
    const { error: idForge } = await userA.client
      .from('saved_expressions')
      .insert({ user_id: userA.id, original: 'a', suggested: 'b', type: 'vocab', id: '00000000-0000-0000-0000-000000000999' });
    check('id 직접 insert 불가 (grant)', !!idForge, idForge?.message);

    const { error: tsForge } = await userA.client
      .from('saved_expressions')
      .insert({ user_id: userA.id, original: 'c', suggested: 'd', type: 'vocab', created_at: '2000-01-01T00:00:00Z' });
    check('created_at 직접 insert 불가 (grant)', !!tsForge, tsForge?.message);

    // 타인 명의 저장 불가
    const { error: seSpoof } = await userB.client
      .from('saved_expressions')
      .insert({ user_id: userA.id, original: 'evil', suggested: 'x', type: 'grammar' });
    check('타인 명의 표현 저장 불가', !!seSpoof);

    // 타인 표현 열람 불가
    const { data: seView } = await userB.client
      .from('saved_expressions')
      .select('original')
      .eq('id', savedId);
    check('타인 저장 표현 열람 불가', (seView?.length ?? 0) === 0);

    // 표현은 불변 — update grant 미부여(본인도 수정 불가)
    const { error: seEdit } = await userA.client
      .from('saved_expressions')
      .update({ suggested: '조작' })
      .eq('id', savedId);
    check('본인도 저장 표현 수정 불가 (update grant 없음)', !!seEdit, seEdit?.message);

    // 타인은 삭제 불가(RLS)
    const { data: seDelB } = await userB.client
      .from('saved_expressions')
      .delete()
      .eq('id', savedId)
      .select();
    check('타인 저장 표현 삭제 불가', (seDelB?.length ?? 0) === 0);

    // 중복 저장은 unique 제약으로 거부(클라가 idempotent 처리)
    const { error: seDup } = await userA.client
      .from('saved_expressions')
      .insert({ user_id: userA.id, original: 'I go yesterday', suggested: 'I went yesterday', type: 'grammar' });
    check('같은 표현 중복 저장은 unique 제약으로 거부', !!seDup, seDup?.message);

    // type CHECK 우회 불가 (grant에 type이 있어도 enum 제약이 막는다)
    const { error: seBadType } = await userA.client
      .from('saved_expressions')
      .insert({ user_id: userA.id, original: 'x', suggested: 'y', type: 'spelling' });
    check('잘못된 type 값은 CHECK 제약으로 거부', !!seBadType, seBadType?.message);

    // 익명은 저장 불가 (revoke insert from anon)
    const { error: seAnon } = await anon
      .from('saved_expressions')
      .insert({ user_id: userA.id, original: 'a', suggested: 'b', type: 'grammar' });
    check('익명은 표현 저장 불가', !!seAnon);

    // 본인은 삭제 가능(사용자 소유 노트 — 큐레이션)
    const { data: seDelA } = await userA.client
      .from('saved_expressions')
      .delete()
      .eq('id', savedId)
      .select();
    check('본인 저장 표현 삭제 가능 (노트 큐레이션)', (seDelA?.length ?? 0) === 1);
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
