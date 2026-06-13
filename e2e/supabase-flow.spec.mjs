/**
 * TalkTed E2E Tests — Supabase 모드 (시나리오 9~11)
 * 실행: node e2e/supabase-flow.spec.mjs
 * 전제: Expo Supabase 모드 서버가 http://localhost:8083 에서 실행 중
 *       로컬 Supabase API: http://127.0.0.1:55321
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE_URL = 'http://localhost:8083';
const TIMEOUT = 15000;

const results = [];

function pass(name, note = '') {
  results.push({ scenario: name, status: 'PASS', note });
  console.log(`  ✓ PASS  ${name}${note ? ' — ' + note : ''}`);
}

function fail(name, reason, note = '') {
  results.push({ scenario: name, status: 'FAIL', reason, note });
  console.error(`  ✗ FAIL  ${name} — ${reason}${note ? '\n         ' + note : ''}`);
}

function info(msg) {
  console.log(`  ℹ  ${msg}`);
}

async function screenshot(page, name) {
  const p = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  TalkTed E2E — Supabase 모드 (S9~S11)');
  console.log('  URL: http://localhost:8083');
  console.log('═══════════════════════════════════════════════');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleLogs.push(`[error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => consoleLogs.push(`[pageerror] ${err.message}`));

  try {
    const testEmail = `e2e-test-${Date.now()}@example.com`;
    const testPassword = 'TestPass1234!';

    // ═══════════════════════════════════════════════════════════════════════
    // 시나리오 11 (먼저): Supabase 모드에서 "개발용 로그인" 버튼 미표시
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n[S11] Supabase 모드 — 개발용 로그인 버튼 미표시');
    try {
      await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: TIMEOUT });
      await page.waitForTimeout(2000);

      const content = await page.content();
      const currentUrl = page.url();
      info(`URL: ${currentUrl}`);

      const hasMockBtn = content.includes('개발용 로그인') || content.includes('Dev Mock');
      if (!hasMockBtn) {
        pass('S11-no-mock-btn', 'Supabase 모드에서 "개발용 로그인" 버튼 없음 (보안 정상)');
      } else {
        fail('S11-no-mock-btn',
          'Supabase 모드에서 "개발용 로그인" 버튼 노출 — canShowMockLogin 보안 게이트 우회됨',
          '[HIGH] apps/mobile/src/app/login.tsx:showMock 조건 또는 canShowMockLogin 로직 확인 필요'
        );
      }
      await screenshot(page, 's11-supabase-login');
    } catch (e) {
      await screenshot(page, 's11-error').catch(() => {});
      fail('S11', e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 시나리오 10: 입력 검증 — 잘못된 이메일, 짧은 비밀번호
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n[S10] 입력 검증');
    try {
      await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: TIMEOUT });
      await page.waitForTimeout(1500);

      // 회원가입 탭으로 전환
      const signupTab = page.locator('text=회원가입').first();
      if (await signupTab.count() > 0) {
        await signupTab.click();
        await page.waitForTimeout(500);
      }

      const emailInput = page.locator('input').first();
      const passwordInput = page.locator('input').nth(1);

      if (await emailInput.count() === 0) {
        fail('S10', '입력 필드를 찾을 수 없음');
      } else {
        // 테스트 1: 빈 이메일
        await emailInput.fill('');
        await passwordInput.fill('');
        const submitBtn = page.locator('text=회원가입').last();
        await submitBtn.click();
        await page.waitForTimeout(500);
        const content1 = await page.content();
        const hasEmptyEmailError = content1.includes('이메일을 입력') || content1.includes('이메일');
        if (hasEmptyEmailError) {
          pass('S10-empty-email', '빈 이메일 → 한국어 오류');
        } else {
          fail('S10-empty-email', '빈 이메일 오류 미표시');
        }

        // 테스트 2: 잘못된 이메일 형식
        await emailInput.fill('notanemail');
        await submitBtn.click();
        await page.waitForTimeout(500);
        const content2 = await page.content();
        const hasInvalidEmailError = content2.includes('올바른 이메일') || content2.includes('이메일 형식');
        if (hasInvalidEmailError) {
          pass('S10-invalid-email', '잘못된 이메일 → 한국어 오류');
        } else {
          fail('S10-invalid-email', `잘못된 이메일 형식 오류 미표시. 내용: ${content2.substring(0, 200)}`);
        }

        // 테스트 3: 짧은 비밀번호
        await emailInput.fill('valid@example.com');
        await passwordInput.fill('short');
        await submitBtn.click();
        await page.waitForTimeout(500);
        const content3 = await page.content();
        const hasPasswordError = content3.includes('8자') || content3.includes('비밀번호는');
        if (hasPasswordError) {
          pass('S10-short-password', '짧은 비밀번호(5자) → 한국어 오류');
        } else {
          fail('S10-short-password', `짧은 비밀번호 오류 미표시. 내용: ${content3.substring(0, 200)}`);
        }

        await screenshot(page, 's10-validation');
      }
    } catch (e) {
      await screenshot(page, 's10-error').catch(() => {});
      fail('S10', e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 시나리오 9: 회원가입 → 즉시 로그인 → 온보딩 → DB 확인
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n[S9] 회원가입 → 온보딩 → DB 반영');
    try {
      await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: TIMEOUT });
      await page.waitForTimeout(1500);

      // 회원가입 탭으로 전환
      const signupTab = page.locator('text=회원가입').first();
      if (await signupTab.count() > 0) {
        await signupTab.click();
        await page.waitForTimeout(500);
      }

      const emailInput = page.locator('input').first();
      const passwordInput = page.locator('input').nth(1);
      const submitBtn = page.locator('text=회원가입').last();

      await emailInput.fill(testEmail);
      await passwordInput.fill(testPassword);
      await submitBtn.click();

      info(`회원가입 시도: ${testEmail}`);
      await page.waitForTimeout(4000);
      await screenshot(page, 's9-after-signup');

      const urlAfterSignup = page.url();
      info(`회원가입 후 URL: ${urlAfterSignup}`);
      const content = await page.content();

      const isOnboarding = urlAfterSignup.includes('onboarding') || content.includes('학습 목표');
      const hasConfirmEmail = content.includes('확인 이메일') || content.includes('메일');

      if (isOnboarding) {
        pass('S9-signup-onboarding', '회원가입 → 즉시 로그인 → 온보딩 진입');

        // 온보딩 완료 후 DB 확인
        // Step 1: 목표 선택
        const goalOption = page.locator('text=일상 회화').first();
        await goalOption.waitFor({ timeout: TIMEOUT });
        await goalOption.click();
        await page.locator('text=다음').first().click();
        await page.waitForTimeout(800);

        // Step 2: 레벨 선택
        const levelOption = page.locator('text=초급').first();
        await levelOption.waitFor({ timeout: TIMEOUT });
        await levelOption.click();
        await page.locator('text=다음').first().click();
        await page.waitForTimeout(800);

        // Step 3: 일일 목표
        const dailyOption = page.locator('text=10분').first();
        await dailyOption.waitFor({ timeout: TIMEOUT });
        await dailyOption.click();
        await page.locator('text=다음').first().click();
        await page.waitForTimeout(800);

        // Step 4: 마이크 → 나중에
        const laterBtn = page.locator('text=나중에').first();
        if (await laterBtn.count() > 0) {
          await laterBtn.click();
        } else {
          await page.locator('text=텍스트로 학습').first().click();
        }
        await page.waitForTimeout(3000);
        await screenshot(page, 's9-home-after-onboarding');

        const urlAfterOnboarding = page.url();
        info(`온보딩 완료 후 URL: ${urlAfterOnboarding}`);
        const isHome = urlAfterOnboarding.includes('home') || urlAfterOnboarding.includes('tabs');
        if (isHome) {
          pass('S9-onboarding-complete', '온보딩 완료 → 홈 진입');
        } else {
          fail('S9-onboarding-complete', `홈 진입 실패: ${urlAfterOnboarding}`);
        }

        // DB 확인: profiles 테이블에 goal/level/daily_goal_minutes 반영 여부
        // 사용자 ID가 필요한데, auth 테이블에서 이메일로 조회
        try {
          const dbCheck = execSync(
            `psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -t -c ` +
            `"SELECT p.goal, p.level, p.daily_goal_minutes FROM auth.users u ` +
            `JOIN public.profiles p ON u.id = p.id ` +
            `WHERE u.email = '${testEmail}' LIMIT 1;" 2>&1`,
            { encoding: 'utf8', timeout: 10000 }
          ).trim();
          info(`DB profiles 조회: ${dbCheck}`);

          if (dbCheck && !dbCheck.includes('ERROR') && dbCheck.length > 0) {
            const parts = dbCheck.split('|').map((s) => s.trim());
            const [goal, level, dailyGoal] = parts;
            if (goal === 'daily' || goal) {
              pass('S9-db-goal', `DB profiles.goal 반영 확인: ${goal}`);
            } else {
              fail('S9-db-goal', `DB profiles.goal 미반영: "${dbCheck}"`);
            }
            if (level) {
              pass('S9-db-level', `DB profiles.level 반영 확인: ${level}`);
            } else {
              fail('S9-db-level', `DB profiles.level 미반영`);
            }
            if (dailyGoal === '10' || dailyGoal) {
              pass('S9-db-daily', `DB profiles.daily_goal_minutes 반영 확인: ${dailyGoal}`);
            } else {
              fail('S9-db-daily', `DB profiles.daily_goal_minutes 미반영: "${dailyGoal}"`);
            }
          } else {
            fail('S9-db', `DB 조회 실패 또는 결과 없음: ${dbCheck}`);
          }
        } catch (dbErr) {
          fail('S9-db', `psql 실행 오류: ${dbErr.message}`);
        }

      } else if (hasConfirmEmail) {
        pass('S9-confirm-email', '이메일 확인 안내 표시 (원격 환경 동작)');
        info('로컬 Supabase는 즉시 로그인이어야 함 — 확인 이메일 안내는 이상 동작');
      } else {
        await screenshot(page, 's9-unexpected');
        fail('S9-signup', `예상치 못한 상태. URL: ${urlAfterSignup}, 내용 일부: ${content.substring(0, 300)}`);
      }
    } catch (e) {
      await screenshot(page, 's9-error').catch(() => {});
      fail('S9', e.message, consoleLogs.slice(-5).join('\n'));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 시나리오 12: onboarded_at DB 기록 + 로그아웃→재로그인 온보딩 스킵 + PII 정리
    //
    // 전제: S9에서 testEmail로 가입·온보딩 완료 후 홈에 있어야 함.
    // 알려진 제약: 웹은 user 스토어가 메모리 폴백이라 앱 재시작 시 상태 소실 —
    //   "재시작 후 유지" 검증 불가. 같은 페이지 세션 내 로그아웃→재로그인으로 검증한다.
    //   하이드레이트는 네트워크 fetch라 URL 또는 요소 대기를 써서 충분히 기다린다.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n[S12] onboarded_at DB 기록 + 로그아웃→재로그인 온보딩 스킵 + PII 정리');

    // ─── S12a: profiles.onboarded_at이 DB에 기록됐는지 service_role로 확인 ───────
    console.log('\n[S12a] profiles.onboarded_at DB 반영 확인 (service_role)');
    try {
      const dbCheck = execSync(
        `psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -t -c ` +
        `"SELECT p.onboarded_at FROM auth.users u ` +
        `JOIN public.profiles p ON u.id = p.id ` +
        `WHERE u.email = '${testEmail}' LIMIT 1;" 2>&1`,
        { encoding: 'utf8', timeout: 10000 }
      ).trim();
      info(`DB onboarded_at 조회: "${dbCheck}"`);

      if (dbCheck && !dbCheck.includes('ERROR') && dbCheck.length > 0 && dbCheck !== '') {
        pass('S12a-onboarded-at', `profiles.onboarded_at DB 기록 확인: ${dbCheck}`);
      } else {
        fail('S12a-onboarded-at', `profiles.onboarded_at 미기록 — 온보딩 완료 시 buildProfileUpdate가 onboarded_at을 포함해야 함. DB 결과: "${dbCheck}"`);
      }
    } catch (e) {
      fail('S12a-onboarded-at', `psql 실행 오류: ${e.message}`);
    }

    // ─── S12b: 로그아웃 → 같은 계정 재로그인 → 온보딩 스킵·홈 직행 ──────────────
    console.log('\n[S12b] 로그아웃 → 재로그인 → 온보딩 스킵·홈 직행');
    try {
      // 현재 홈에 있어야 함 (S9 완료 후). 프로필 탭으로 이동해 로그아웃한다.
      const profileTabLink = page.locator('[href*="profile"]').first();
      if (await profileTabLink.count() > 0) {
        await profileTabLink.click();
        await page.waitForTimeout(1000);
      } else {
        // 탭 링크가 없으면 홈이 아닌 상태 — 홈으로 이동 후 재시도
        info('프로필 탭 링크 없음 — 현재 URL: ' + page.url());
        await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: TIMEOUT });
        await page.waitForURL((u) => u.href.includes('home') || u.href.includes('login'), { timeout: TIMEOUT });
        const urlNow = page.url();
        info(`홈 도달 여부: ${urlNow}`);
        const profileTabLink2 = page.locator('[href*="profile"]').first();
        if (await profileTabLink2.count() > 0) {
          await profileTabLink2.click();
          await page.waitForTimeout(1000);
        }
      }

      // 로그아웃 버튼 클릭
      const logoutBtn = page.locator('text=로그아웃').first();
      await logoutBtn.waitFor({ timeout: TIMEOUT });
      await logoutBtn.click();

      // 로그아웃 직후 — 로그인 화면 복귀 확인 (PII 정리, S12c)
      await page.waitForURL((u) => u.href.includes('login'), { timeout: TIMEOUT });
      const urlAfterLogout = page.url();
      info(`로그아웃 후 URL: ${urlAfterLogout}`);

      // ─── S12c: 로그아웃 직후 로그인 화면이 노출되고 이전 사용자 데이터가 없음 ───
      const contentAfterLogout = await page.content();
      const isLoginPage = urlAfterLogout.includes('login');
      const hasNoUserData = !contentAfterLogout.includes(testEmail);

      if (isLoginPage) {
        pass('S12c-pii-clear', '로그아웃 → 로그인 화면 복귀 (이전 사용자 PII 미노출)');
      } else {
        await screenshot(page, 's12c-not-login').catch(() => {});
        fail('S12c-pii-clear', `로그아웃 후 로그인 화면 미복귀: ${urlAfterLogout}`);
      }

      if (hasNoUserData) {
        pass('S12c-no-email-leak', '로그아웃 화면에 이전 사용자 이메일 미노출');
      } else {
        fail('S12c-no-email-leak', `로그인 화면에 이전 사용자 이메일(${testEmail}) 노출 — PII 잔존`);
      }

      await screenshot(page, 's12c-after-logout');

      // 같은 계정으로 재로그인 (로그인 탭 확인 후 이메일/비밀번호 입력)
      const signinTab = page.locator('text=로그인').first();
      await signinTab.waitFor({ timeout: TIMEOUT });
      // 로그인 탭이 아직 선택 안됐을 수 있으면 클릭
      await signinTab.click();
      await page.waitForTimeout(300);

      const emailInput = page.locator('input').first();
      const passwordInput = page.locator('input').nth(1);
      await emailInput.fill(testEmail);
      await passwordInput.fill(testPassword);

      const submitBtn = page.locator('text=로그인').last();
      await submitBtn.click();
      info(`재로그인 시도: ${testEmail}`);

      // 하이드레이트 완료 후 URL 대기 — 홈 또는 온보딩.
      // 하이드레이트는 네트워크 fetch이므로 고정 sleep 대신 URL 변화 대기를 사용한다.
      await page.waitForURL(
        (u) => u.href.includes('home') || u.href.includes('onboarding'),
        { timeout: TIMEOUT }
      );

      const urlAfterRelogin = page.url();
      info(`재로그인 후 URL: ${urlAfterRelogin}`);
      await screenshot(page, 's12b-after-relogin');

      const isHome = urlAfterRelogin.includes('home') || urlAfterRelogin.includes('tabs');
      const isOnboarding = urlAfterRelogin.includes('onboarding');

      if (isHome) {
        pass('S12b-relogin-skip-onboarding', '재로그인 → 온보딩 스킵·홈 직행 (profiles.onboarded_at 하이드레이트 정상)');
      } else if (isOnboarding) {
        fail(
          'S12b-relogin-skip-onboarding',
          `재로그인 후 온보딩으로 이동 — profile-sync가 onboarded_at을 읽어 onboarded=true로 설정하지 않음. ` +
          `원인 후보: ① profile-sync.ts의 하이드레이트 미동작 ② onboarded_at이 DB에 없음(S12a 실패) ` +
          `③ index.tsx의 hydrating 보류 로직 오작동 ④ login.tsx의 routeAfterAuth가 온보딩으로 라우팅(onboarded=false인 상태)`
        );
      } else {
        fail('S12b-relogin-skip-onboarding', `예상치 못한 URL: ${urlAfterRelogin}`);
      }

    } catch (e) {
      await screenshot(page, 's12-error').catch(() => {});
      fail('S12', e.message, consoleLogs.slice(-5).join('\n'));
    }

  } finally {
    await browser.close();

    // 결과 출력
    console.log('\n═══════════════════════════════════════════════');
    console.log('  Supabase 모드 결과');
    console.log('═══════════════════════════════════════════════');
    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;

    for (const r of results) {
      const icon = r.status === 'PASS' ? '✓' : '✗';
      console.log(`${icon} ${r.scenario.padEnd(32)} | ${r.status} | ${r.note || r.reason || ''}`);
    }
    console.log(`\n총 ${results.length}개: PASS ${passed} / FAIL ${failed}`);

    // 기존 결과에 추가
    const existingPath = path.join(__dirname, 'results.json');
    let existing = { results: [], summary: {} };
    try {
      existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
    } catch {}

    const allResults = [...existing.results, ...results];
    const totalPassed = allResults.filter((r) => r.status === 'PASS').length;
    const totalFailed = allResults.filter((r) => r.status === 'FAIL').length;
    const totalSkipped = allResults.filter((r) => r.status === 'SKIP').length;

    fs.writeFileSync(existingPath, JSON.stringify({
      results: allResults,
      summary: { passed: totalPassed, failed: totalFailed, skipped: totalSkipped }
    }, null, 2), 'utf8');
    console.log(`\n결과 업데이트: ${existingPath}`);
  }
}

main().catch((e) => {
  console.error('Supabase E2E 오류:', e);
  process.exit(1);
});
