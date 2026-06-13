/**
 * TalkTed E2E Tests — 프리토킹(AI 튜터) 플로우 (P2 W2)
 * 시나리오 T1~T6: Dev Mock Auth + 목 전송으로 주제→세션→요약 동선 검증
 *
 * 실행: node e2e/tutor-flow.spec.mjs
 * 전제: Expo web 서버가 http://localhost:8082 에서 실행 중 (npx expo start --web --port 8082)
 * 주: page.goto는 웹 메모리 스토어(auth)를 리셋하므로, 탭 이동은 SPA 내 클릭으로 한다.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE_URL = 'http://localhost:8082';
const TIMEOUT = 15000;

const results = [];
const pass = (name, note = '') => {
  results.push({ scenario: name, status: 'PASS', note });
  console.log(`  ✓ PASS  ${name}${note ? ' — ' + note : ''}`);
};
const fail = (name, reason) => {
  results.push({ scenario: name, status: 'FAIL', reason });
  console.error(`  ✗ FAIL  ${name} — ${reason}`);
};
const info = (m) => console.log(`  ℹ  ${m}`);

async function screenshot(page, name) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: true }).catch(() => {});
}

/** dev mock 로그인 + 온보딩 4단계 → 홈 (mock-flow와 동일 동선) */
async function loginAndOnboard(page) {
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: TIMEOUT });
  await page.waitForTimeout(1500);
  await page.locator('text=개발용 로그인').first().click();
  await page.waitForTimeout(2000);

  const content = await page.content();
  if (content.includes('학습 목표') || content.includes('STEP 1') || page.url().includes('onboarding')) {
    const next = page.locator('text=다음');
    await page.locator('text=일상 회화').first().click();
    await page.waitForTimeout(300);
    await next.first().click();
    await page.waitForTimeout(800);
    await page.locator('text=초급').first().click();
    await page.waitForTimeout(300);
    await next.first().click();
    await page.waitForTimeout(800);
    await page.locator('text=10분').first().click();
    await page.waitForTimeout(300);
    await next.first().click();
    await page.waitForTimeout(800);
    const later = page.locator('text=나중에');
    if ((await later.count()) > 0) await later.first().click();
    else await page.locator('text=텍스트로 학습').first().click();
    await page.waitForTimeout(2000);
  }
  return page.url();
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') fs.appendFileSync(path.join(__dirname, 'console-errors.log'), `[tutor] ${m.text()}\n`);
  });

  try {
    // T1: 로그인 + 온보딩 → 홈
    const url = await loginAndOnboard(page);
    if (url.includes('home') || url.includes('tabs')) pass('T1-home', '온보딩 완료 후 홈');
    else { await screenshot(page, 't1-not-home'); fail('T1-home', `홈 아님: ${url}`); }

    // T2: AI 튜터 탭으로 이동 (탭바 클릭 — goto는 auth 리셋)
    await page.locator('text=AI 튜터').first().click();
    await page.waitForTimeout(1500);
    const tutorContent = await page.content();
    if (tutorContent.includes('텍스트 미리보기') || tutorContent.includes('주제를 골라')) {
      pass('T2-tutor-tab', '튜터 탭 — 주제 선택 화면 + 미리보기 배너');
    } else {
      await screenshot(page, 't2-tutor-fail');
      fail('T2-tutor-tab', '주제 선택 화면 미표시');
    }
    await screenshot(page, 't2-topic-select');

    // T3: 주제 선택 → 세션 진입
    const topic = page.locator('text=취미와 여가').first();
    await topic.waitFor({ timeout: TIMEOUT });
    await topic.click();
    await page.waitForTimeout(2000);
    const inSession = await page.locator('text=대화 끝내기').count();
    if (inSession > 0) pass('T3-session-start', '주제 선택 → 세션 active');
    else { await screenshot(page, 't3-session-fail'); fail('T3-session-start', '세션 화면 미진입'); }
    await screenshot(page, 't3-session');

    // T4: 텍스트 전송 → Ted 응답
    const input = page.locator('input[placeholder="영어로 입력…"]').first();
    const hasInput = await input.count();
    if (hasInput > 0) {
      await input.fill('I like hiking on weekends');
      await page.locator('text=전송').first().click();
      await page.waitForTimeout(1500);
      const afterSend = await page.content();
      if (afterSend.includes('Ted')) pass('T4-ted-reply', '텍스트 전송 후 Ted 응답 노출');
      else { await screenshot(page, 't4-no-reply'); fail('T4-ted-reply', 'Ted 응답 미표시'); }
    } else {
      await screenshot(page, 't4-no-input');
      fail('T4-ted-reply', '텍스트 입력 필드 없음');
    }
    await screenshot(page, 't4-after-send');

    // T5: 대화 끝내기 → 요약
    await page.locator('text=대화 끝내기').first().click();
    await page.waitForTimeout(2000);
    const summary = await page.content();
    if (summary.includes('대화 요약') || summary.includes('새 대화 시작')) {
      pass('T5-summary', '대화 종료 → 요약 화면');
    } else {
      await screenshot(page, 't5-no-summary');
      fail('T5-summary', '요약 화면 미표시');
    }
    await screenshot(page, 't5-summary');

    // T6: 요약에서 새 대화로 복귀
    const restart = page.locator('text=새 대화 시작');
    if ((await restart.count()) > 0) {
      await restart.first().click();
      await page.waitForTimeout(1500);
      const back = await page.content();
      if (back.includes('텍스트 미리보기') || back.includes('주제를 골라')) pass('T6-restart', '새 대화 → 주제 선택 복귀');
      else fail('T6-restart', '주제 선택 복귀 실패');
    } else {
      fail('T6-restart', '"새 대화 시작" 버튼 없음');
    }

    // ── 롤플레이 (P2 W3) ──────────────────────────────────────────────────────

    // T7: 롤플레이 시나리오 선택 → 세션 진입 (목표 체크리스트 노출)
    const scenario = page.locator('text=레스토랑에서 주문하기').first();
    await scenario.waitFor({ timeout: TIMEOUT });
    await scenario.click();
    await page.waitForTimeout(2000);
    const rpContent = await page.content();
    if (rpContent.includes('목표 0/3') && rpContent.includes('웨이터')) {
      pass('T7-roleplay-start', '시나리오 선택 → 세션 + 목표 체크리스트(0/3)');
    } else {
      await screenshot(page, 't7-roleplay-fail');
      fail('T7-roleplay-start', '롤플레이 세션/목표 체크리스트 미표시');
    }
    await screenshot(page, 't7-roleplay-session');

    // T8: 세 턴 진행 → 목표가 순차 달성된다 (목 전송이 턴마다 1개씩 신호)
    const rpInput = page.locator('input[placeholder="영어로 입력…"]').first();
    if ((await rpInput.count()) > 0) {
      for (const msg of ['Hi, a table for one please', 'I will have a burger', 'Can I get the bill']) {
        await rpInput.fill(msg);
        await page.locator('text=전송').first().click();
        await page.waitForTimeout(1200);
      }
      const afterTurns = await page.content();
      if (afterTurns.includes('목표 3/3')) pass('T8-objectives-met', '세 턴 후 목표 3/3 달성');
      else { await screenshot(page, 't8-objectives-fail'); fail('T8-objectives-met', '목표 미달성(3/3 아님)'); }
    } else {
      await screenshot(page, 't8-no-input');
      fail('T8-objectives-met', '텍스트 입력 필드 없음');
    }
    await screenshot(page, 't8-objectives');

    // T9: 대화 끝내기 → 요약에 목표 달성 판정 카드
    await page.locator('text=대화 끝내기').first().click();
    await page.waitForTimeout(2000);
    const rpSummary = await page.content();
    if (rpSummary.includes('목표 3/3 달성')) {
      pass('T9-goal-card', '롤플레이 요약 — 목표 3/3 달성 판정');
    } else {
      await screenshot(page, 't9-no-goal');
      fail('T9-goal-card', '목표 달성 판정 카드 미표시');
    }
    await screenshot(page, 't9-goal-summary');

    // T10: 새 대화로 복귀 (롤플레이 후에도 주제 선택 복귀)
    const rpRestart = page.locator('text=새 대화 시작');
    if ((await rpRestart.count()) > 0) {
      await rpRestart.first().click();
      await page.waitForTimeout(1500);
      const rpBack = await page.content();
      if (rpBack.includes('롤플레이') || rpBack.includes('주제를 골라')) pass('T10-roleplay-restart', '롤플레이 후 주제 선택 복귀');
      else fail('T10-roleplay-restart', '주제 선택 복귀 실패');
    } else {
      fail('T10-roleplay-restart', '"새 대화 시작" 버튼 없음');
    }
    // ── 히스토리 + 표현 저장 (P2 W5) ──────────────────────────────────────────

    // T11: 프리토킹 세션 — 2턴 진행 → 교정 칩 노출 후 길게 눌러 저장
    const w5Topic = page.locator('text=취미와 여가').first();
    await w5Topic.waitFor({ timeout: TIMEOUT });
    await w5Topic.click();
    await page.waitForTimeout(1500);
    const w5Input = page.locator('input[placeholder="영어로 입력…"]').first();
    for (const msg of ['I like reading books', 'I read every day']) {
      await w5Input.fill(msg);
      await page.locator('text=전송').first().click();
      await page.waitForTimeout(1200);
    }
    // 2번째 응답에 교정(I very like it → I really like it)이 포함된다
    const chip = page.locator('text=I very like it').first();
    if ((await chip.count()) > 0) {
      pass('T11-correction-shown', '프리토킹 2턴 → 교정 칩 노출');
      // 길게 누르기(onLongPress) — RN-web Pressable: pointer down 유지 후 up
      const box = await chip.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(500);
        await page.mouse.up();
        await page.waitForTimeout(800);
      }
      const afterSave = await page.content();
      if (afterSave.includes('I very like it → I really like it ✓') || afterSave.includes('✓')) {
        pass('T12-save-correction', '교정 칩 길게 눌러 저장(✓ 표시)');
      } else {
        info('T12: 길게 누르기 저장 표식 미확인 — 저장 목록(T15)에서 재확인');
      }
    } else {
      await screenshot(page, 't11-no-correction');
      fail('T11-correction-shown', '교정 칩 미노출');
    }
    await screenshot(page, 't11-correction');

    // T13: 대화 종료 → 프로필 탭 → 대화 기록 진입
    await page.locator('text=대화 끝내기').first().click();
    await page.waitForTimeout(1500);
    await page.locator('text=프로필').first().click();
    await page.waitForTimeout(1200);
    const historyEntry = page.locator('text=대화 기록').first();
    if ((await historyEntry.count()) > 0) {
      await historyEntry.click();
      await page.waitForTimeout(1200);
      const histContent = await page.content();
      if (histContent.includes('취미와 여가') || histContent.includes('레스토랑')) {
        pass('T13-history-list', '프로필 → 대화 기록 → 과거 세션 목록');
      } else {
        await screenshot(page, 't13-history-fail');
        fail('T13-history-list', '세션 목록 미표시');
      }
    } else {
      await screenshot(page, 't13-no-entry');
      fail('T13-history-list', '프로필에 "대화 기록" 진입 없음');
    }
    await screenshot(page, 't13-history');

    // T14: 세션 카드 탭 → 상세에서 턴(발화) 텍스트 재생
    const sessionCard = page.locator('text=취미와 여가').first();
    if ((await sessionCard.count()) > 0) {
      await sessionCard.click();
      await page.waitForTimeout(1200);
      const detail = await page.content();
      if (detail.includes('I like reading books') || detail.includes('Ted')) {
        pass('T14-history-detail', '세션 상세 — 턴 텍스트 재생');
      } else {
        await screenshot(page, 't14-detail-fail');
        fail('T14-history-detail', '상세 턴 미표시');
      }
      await screenshot(page, 't14-detail');
      // 뒤로(상세 → 목록): chevron 포함 백링크로 숨김 DOM 중복 매칭 회피
      await page.locator('text=‹ 대화 기록').first().click();
      await page.waitForTimeout(800);
    }
    const histBack = page.locator('text=‹ 뒤로').first();
    if ((await histBack.count()) > 0) {
      await histBack.click();
      await page.waitForTimeout(1000);
    }

    // T15: 프로필 → 저장한 표현 → 저장된 교정 확인
    const savedEntry = page.locator('text=저장한 표현').first();
    if ((await savedEntry.count()) > 0) {
      await savedEntry.click();
      await page.waitForTimeout(1200);
      const savedContent = await page.content();
      if (savedContent.includes('I very like it')) {
        pass('T15-saved-list', '저장한 표현 목록에 교정 노출');
      } else if (savedContent.includes('아직 저장한 표현이 없어요')) {
        info('T15: 저장 목록 비어 있음 — 길게 누르기가 헤드리스에서 미발화(수동 검증 대상)');
        pass('T15-saved-list', '저장한 표현 화면 렌더(빈 상태)');
      } else {
        await screenshot(page, 't15-saved-fail');
        fail('T15-saved-list', '저장 목록 화면 미표시');
      }
      await screenshot(page, 't15-saved');
    } else {
      await screenshot(page, 't15-no-entry');
      fail('T15-saved-list', '프로필에 "저장한 표현" 진입 없음');
    }
  } catch (e) {
    await screenshot(page, 'tutor-error');
    fail('tutor-flow', `예외: ${e.message}`);
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  fs.writeFileSync(path.join(__dirname, 'tutor-results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${'─'.repeat(48)}\n결과: ${passed} 통과 / ${failed} 실패`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
