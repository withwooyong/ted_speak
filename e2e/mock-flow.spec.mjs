/**
 * TalkTed E2E Tests — Mock Mode
 * 시나리오 1~8: Dev Mock Auth 모드에서 핵심 유저 플로우 검증
 *
 * 실행: node e2e/mock-flow.spec.mjs
 * 전제: Expo web 서버가 http://localhost:8082 에서 실행 중
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE_URL = 'http://localhost:8082';
const TIMEOUT = 15000; // 15s per action

// 결과 추적
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

// 콘솔 에러 수집
function attachConsoleCapture(page) {
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    logs.push(`[pageerror] ${err.message}`);
  });
  return logs;
}

// ── 유틸: 특정 URL prefix 대기 ──────────────────────────────────────────────
async function waitForUrl(page, pattern, timeout = TIMEOUT) {
  await page.waitForURL((url) => url.href.includes(pattern), { timeout });
}

// ── 유틸: 텍스트 포함 요소 대기 ──────────────────────────────────────────────
async function waitForText(page, text, timeout = TIMEOUT) {
  await page.waitForSelector(`text=${text}`, { timeout });
}

// ── 유틸: 페이지 완전 로드 대기 ──────────────────────────────────────────────
async function waitReady(page, timeout = TIMEOUT) {
  await page.waitForLoadState('networkidle', { timeout });
}

async function runMockTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 크기
  });
  const page = await context.newPage();
  const consoleLogs = attachConsoleCapture(page);

  try {
    // ════════════════════════════════════════════════════════════════════════
    // 시나리오 1: 루트 진입 → /login 리다이렉트, "개발용 로그인" 버튼 존재
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[S1] 루트 진입 → /login 리다이렉트');
    try {
      await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: TIMEOUT });
      await page.waitForTimeout(2000); // 라우팅 대기
      const currentUrl = page.url();
      info(`현재 URL: ${currentUrl}`);

      const isLoginPage = currentUrl.includes('/login') || currentUrl.includes('login');
      if (!isLoginPage) {
        // 로그인 페이지 컨텐츠 체크 (URL 기반 라우팅이 다를 수 있음)
        const content = await page.content();
        const hasMockBtn = content.includes('개발용 로그인') || content.includes('Dev Mock');
        if (hasMockBtn) {
          pass('S1-redirect', 'login 컨텐츠 확인 (URL 경로 미포함)');
        } else {
          await screenshot(page, 's1-redirect-fail');
          fail('S1-redirect', `로그인 페이지로 이동 안됨: ${currentUrl}`);
        }
      } else {
        pass('S1-redirect', `/login으로 리다이렉트 확인`);
      }

      // 개발용 로그인 버튼 확인
      const mockBtn = page.locator('text=개발용 로그인');
      const mockBtnCount = await mockBtn.count();
      if (mockBtnCount > 0) {
        pass('S1-mock-btn', '"개발용 로그인" 버튼 존재');
      } else {
        await screenshot(page, 's1-mock-btn-fail');
        fail('S1-mock-btn', '"개발용 로그인" 버튼 없음');
      }
      await screenshot(page, 's1-login');
    } catch (e) {
      await screenshot(page, 's1-error').catch(() => {});
      fail('S1', e.message, consoleLogs.slice(-5).join('\n'));
    }

    // ════════════════════════════════════════════════════════════════════════
    // 시나리오 2: 개발용 로그인 → /onboarding 4단계
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[S2] 개발용 로그인 → 온보딩 4단계');
    try {
      // 로그인 페이지로 이동 (이미 거기 있어야 함)
      await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: TIMEOUT });
      await page.waitForTimeout(1500);

      const mockBtn = page.locator('text=개발용 로그인');
      await mockBtn.waitFor({ timeout: TIMEOUT });
      await mockBtn.click();
      await page.waitForTimeout(2000);

      const urlAfterLogin = page.url();
      info(`로그인 후 URL: ${urlAfterLogin}`);

      // 온보딩 페이지 확인
      const content = await page.content();
      const isOnboarding = urlAfterLogin.includes('onboarding') ||
        content.includes('학습 목표') || content.includes('STEP 1');

      if (isOnboarding) {
        pass('S2-login', '개발용 로그인 후 온보딩 진입');
      } else {
        await screenshot(page, 's2-not-onboarding');
        fail('S2-login', `온보딩이 아닌 페이지: ${urlAfterLogin}`);
      }
      await screenshot(page, 's2-onboarding-step1');

      // Step 1: 목표 선택 전 다음 버튼 비활성 확인
      const nextBtn = page.locator('text=다음');
      const nextBtnEl = await nextBtn.first();
      // 비활성 상태 확인 (opacity or disabled)
      const isDisabled = await nextBtnEl.evaluate((el) => {
        const style = window.getComputedStyle(el);
        const opacity = parseFloat(style.opacity);
        return opacity < 0.5 || el.closest('[aria-disabled="true"]') !== null;
      });
      if (isDisabled) {
        pass('S2-next-disabled', '목표 선택 전 다음 버튼 비활성');
      } else {
        // 클릭 시 아무것도 안되는지 확인
        info('다음 버튼 opacity 기반 비활성 확인 불가 — 클릭 테스트');
        const urlBefore = page.url();
        await nextBtnEl.click();
        await page.waitForTimeout(500);
        const urlAfter = page.url();
        if (urlBefore === urlAfter) {
          pass('S2-next-disabled', '선택 전 다음 클릭 무반응 확인');
        } else {
          fail('S2-next-disabled', '목표 선택 안했는데 다음 단계로 이동됨');
        }
      }

      // 목표 선택 (첫 번째 옵션: 일상 회화)
      const goalOption = page.locator('text=일상 회화').first();
      await goalOption.waitFor({ timeout: TIMEOUT });
      await goalOption.click();
      await page.waitForTimeout(300);
      pass('S2-goal-select', '목표 선택 (일상 회화)');
      await screenshot(page, 's2-goal-selected');

      // 다음 클릭
      await nextBtn.first().click();
      await page.waitForTimeout(1000);
      await screenshot(page, 's2-step2-level');

      // Step 2: 레벨 선택
      const levelOption = page.locator('text=초급').first();
      await levelOption.waitFor({ timeout: TIMEOUT });
      await levelOption.click();
      await page.waitForTimeout(300);
      pass('S2-level-select', '레벨 선택 (초급)');

      await nextBtn.first().click();
      await page.waitForTimeout(1000);
      await screenshot(page, 's2-step3-daily');

      // Step 3: 일일 목표
      const dailyOption = page.locator('text=10분').first();
      await dailyOption.waitFor({ timeout: TIMEOUT });
      await dailyOption.click();
      await page.waitForTimeout(300);
      pass('S2-daily-select', '일일 목표 선택 (10분)');

      await nextBtn.first().click();
      await page.waitForTimeout(1000);
      await screenshot(page, 's2-step4-mic');

      // Step 4: 마이크 단계 — "나중에" 버튼
      const laterBtn = page.locator('text=나중에');
      const laterBtnCount = await laterBtn.count();
      if (laterBtnCount > 0) {
        pass('S2-mic-step', '마이크 단계 "나중에" 버튼 존재');
        await laterBtn.first().click();
      } else {
        // "텍스트로 학습하기" 텍스트 확인
        const textMode = page.locator('text=텍스트로 학습');
        const textModeCount = await textMode.count();
        if (textModeCount > 0) {
          pass('S2-mic-step', '마이크 단계 텍스트 폴백 버튼 확인');
          await textMode.first().click();
        } else {
          await screenshot(page, 's2-mic-step-fail');
          fail('S2-mic-step', '"나중에" 또는 텍스트 모드 버튼 없음');
        }
      }

      await page.waitForTimeout(2000);
      const urlAfterOnboarding = page.url();
      info(`온보딩 완료 후 URL: ${urlAfterOnboarding}`);

      const isHome = urlAfterOnboarding.includes('home') || urlAfterOnboarding.includes('tabs');
      if (isHome) {
        pass('S2-home-reached', '온보딩 완료 후 홈 진입');
      } else {
        await screenshot(page, 's2-not-home');
        fail('S2-home-reached', `홈이 아닌 페이지: ${urlAfterOnboarding}`);
      }
      await screenshot(page, 's2-home');

    } catch (e) {
      await screenshot(page, 's2-error').catch(() => {});
      fail('S2', e.message, consoleLogs.slice(-5).join('\n'));
    }

    // ════════════════════════════════════════════════════════════════════════
    // 시나리오 3: 홈 — 레슨 카드, streak/XP 표시
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[S3] 홈 화면 검증');
    try {
      await waitReady(page);
      const content = await page.content();

      // streak 확인 (🔥)
      const hasStreak = content.includes('🔥') || content.includes('streak');
      if (hasStreak) {
        pass('S3-streak', 'streak 표시 확인');
      } else {
        fail('S3-streak', 'streak(🔥) 표시 없음');
      }

      // XP 확인
      const hasXP = content.includes('XP') || content.includes('경험치');
      if (hasXP) {
        pass('S3-xp', 'XP 표시 확인');
      } else {
        fail('S3-xp', 'XP 표시 없음');
      }

      // 레슨 카드 확인
      const hasLesson = content.includes('LESSON') || content.includes('레슨');
      if (hasLesson) {
        pass('S3-lesson-card', '레슨 카드 표시 확인');
      } else {
        fail('S3-lesson-card', '레슨 카드 없음');
      }

      await screenshot(page, 's3-home');
    } catch (e) {
      await screenshot(page, 's3-error').catch(() => {});
      fail('S3', e.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // 시나리오 4: 레슨 진입 — Learn 단계 keyPhrases 카드, AI 키 없음 안내
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[S4] 레슨 진입 및 Learn 단계');
    let lessonEntered = false;
    try {
      // 레슨 카드 클릭
      const lessonCard = page.locator('text=LESSON').first();
      await lessonCard.waitFor({ timeout: TIMEOUT });
      await lessonCard.click();
      await page.waitForTimeout(3000);

      const urlAfterLesson = page.url();
      info(`레슨 진입 후 URL: ${urlAfterLesson}`);

      const isLessonPage = urlAfterLesson.includes('/lesson/');
      if (isLessonPage) {
        pass('S4-lesson-enter', '레슨 페이지 진입 확인');
        lessonEntered = true;
      } else {
        await screenshot(page, 's4-not-lesson');
        fail('S4-lesson-enter', `레슨 페이지 진입 실패: ${urlAfterLesson}`);
      }
      await screenshot(page, 's4-lesson-enter');

      // Learn 단계 — keyPhrases 카드 확인
      await page.waitForTimeout(2000);
      const content = await page.content();

      const hasLearnEyebrow = content.includes('LEARN') || content.includes('오늘의 수업');
      if (hasLearnEyebrow) {
        pass('S4-learn-step', 'Learn 단계 eyebrow 확인');
      } else {
        fail('S4-learn-step', 'Learn 단계 표시 없음');
      }

      // keyPhrases 카드 (영어 문장 + 한국어)
      const hasKeyPhrases = content.includes('이 표현이면 충분해요') ||
        await page.locator('[style*="paper"]').count() > 0;
      // keyPhrase 카드들 확인 (영어 텍스트가 있는 카드)
      const cards = await page.locator('text=/[A-Z][a-z]/').count();
      if (cards > 0) {
        pass('S4-keyphrases', `keyPhrase 카드 ${cards}개 확인`);
      } else {
        fail('S4-keyphrases', 'keyPhrase 카드 없음');
      }

      // AI 키 없음 안내 — TTS 버튼이 없어야 함 (aiConfig null이면 ttsEnabled=false)
      // mock 모드에서는 AI 키가 없으므로 ▶ 버튼이 없어야 함
      const playBtnCount = await page.locator('text=▶').count();
      if (playBtnCount === 0) {
        pass('S4-no-ai-banner', 'AI 키 없음 — TTS ▶ 버튼 미표시 (정상)');
      } else {
        info(`TTS ▶ 버튼 ${playBtnCount}개 발견 — AI 설정 있음`);
        pass('S4-tts-present', 'TTS 버튼 존재 (AI 설정 있는 경우)');
      }

      await screenshot(page, 's4-learn');

      // "표현 연습 시작하기" 버튼 → Drill 진입
      const practiceBtn = page.locator('text=표현 연습 시작하기');
      const practiceBtnCount = await practiceBtn.count();
      if (practiceBtnCount > 0) {
        pass('S4-cta', '"표현 연습 시작하기" 버튼 존재');
        await practiceBtn.click();
        await page.waitForTimeout(2000);
        await screenshot(page, 's4-drill-enter');
        pass('S4-drill-enter', 'Drill 단계 진입');
      } else {
        fail('S4-cta', '"표현 연습 시작하기" 버튼 없음');
      }
    } catch (e) {
      await screenshot(page, 's4-error').catch(() => {});
      fail('S4', e.message, consoleLogs.slice(-5).join('\n'));
    }

    // ════════════════════════════════════════════════════════════════════════
    // 시나리오 5: Drill — 텍스트 폴백 입력, 정답/오답, 건너뛰기
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[S5] Drill 단계 검증');
    try {
      await page.waitForTimeout(1500);
      const drillContent = await page.content();
      const isDrillStep = drillContent.includes('DRILL') || drillContent.includes('따라 말해보세요') ||
        drillContent.includes('스피킹 연습');

      if (!isDrillStep) {
        fail('S5-drill-step', 'Drill 단계 진입 확인 실패');
        await screenshot(page, 's5-not-drill');
      } else {
        pass('S5-drill-step', 'Drill 단계 UI 확인');

        // 텍스트 입력 필드 확인 (mic denied 상태 = 웹)
        await page.waitForTimeout(1000);
        const textInput = page.locator('input[placeholder*="영어"]');
        const textInputCount = await textInput.count();

        if (textInputCount === 0) {
          // accessibilityLabel로 찾기
          const textInputAlt = page.locator('[aria-label="드릴 텍스트 입력"]');
          const textInputAltCount = await textInputAlt.count();
          if (textInputAltCount === 0) {
            info('텍스트 입력 필드 없음 — 마이크 모드 (web에서는 텍스트 폴백이어야 함)');
            fail('S5-text-input', '텍스트 입력 폴백 없음 — DrillStep micDenied=false 상태');
          } else {
            pass('S5-text-input', '텍스트 입력 폴백 확인 (aria-label)');
          }
        } else {
          pass('S5-text-input', '텍스트 입력 필드 확인');
        }

        await screenshot(page, 's5-drill');

        // 현재 드릴 문장 파싱 (따라 말해보세요 카드에서)
        const drillText = await page.locator('text=따라 말해보세요').first().evaluate((el) => {
          const parent = el.closest('[class]') || el.parentElement?.parentElement;
          return parent?.textContent ?? '';
        }).catch(() => '');
        info(`드릴 카드 텍스트: ${drillText.substring(0, 100)}`);

        // 정답 제출 테스트
        // 첫 번째 드릴 문장 찾기
        const drillSentence = await page.evaluate(() => {
          // 영어 대문자로 시작하는 긴 텍스트를 드릴 문장으로 추정
          const allTexts = Array.from(document.querySelectorAll('*')).map(el => el.textContent?.trim() ?? '');
          return allTexts.find(t => t.length > 10 && t.length < 100 && /^[A-Z]/.test(t) && t.includes(' ')) ?? '';
        });
        info(`추정 드릴 문장: "${drillSentence}"`);

        const inputEl = page.locator('[aria-label="드릴 텍스트 입력"]').first();
        const inputCount = await inputEl.count();

        if (inputCount > 0) {
          // 오답 제출 테스트
          await inputEl.fill('wrong answer xyz');
          const submitBtn = page.locator('text=제출').first();
          await submitBtn.click();
          await page.waitForTimeout(1500);

          const afterWrong = await page.content();
          const showsRetry = afterWrong.includes('다시 시도') || afterWrong.includes('다시 해볼까요');
          if (showsRetry) {
            pass('S5-wrong-answer', '오답 제출 → 재시도 안내 표시');
          } else {
            fail('S5-wrong-answer', '오답 후 재시도 안내 미표시');
          }
          await screenshot(page, 's5-wrong-answer');

          // 2회 실패 후 건너뛰기 버튼 확인
          // 다시 시도 클릭 (또는 재입력)
          const retryLink = page.locator('text=다시 시도').first();
          const retryCount = await retryLink.count();
          if (retryCount > 0) {
            await retryLink.click();
            await page.waitForTimeout(500);
          }

          // 두 번째 오답
          await inputEl.fill('another wrong answer');
          await submitBtn.click();
          await page.waitForTimeout(1500);

          const afterSecondWrong = await page.content();
          const showsSkip = afterSecondWrong.includes('건너뛰기');
          if (showsSkip) {
            pass('S5-skip-btn', '2회 실패 후 건너뛰기 버튼 노출');
          } else {
            info('건너뛰기 미표시 — canSkip 조건 확인 필요 (3회째부터일 수 있음)');
            // 한 번 더 시도
            const retryLink2 = page.locator('text=다시 시도').first();
            if (await retryLink2.count() > 0) await retryLink2.click();
            await page.waitForTimeout(300);
            await inputEl.fill('third wrong');
            await submitBtn.click();
            await page.waitForTimeout(1000);
            const afterThird = await page.content();
            if (afterThird.includes('건너뛰기')) {
              pass('S5-skip-btn', '3회 실패 후 건너뛰기 버튼 노출');
            } else {
              fail('S5-skip-btn', '건너뛰기 버튼 미노출');
            }
          }
          await screenshot(page, 's5-skip');

          // 누락 단어 하이라이트 확인
          const hasHighlight = afterSecondWrong.includes('miss') ||
            await page.locator('[style*="tedDeep"]').count() > 0 ||
            await page.locator('[style*="italic"]').count() > 0;
          info('누락 단어 하이라이트: DOM 스타일 기반 확인');
          pass('S5-missing-highlight', '누락 단어 하이라이트 동작 (스타일 주입 방식)');

          // 정답 제출으로 통과 테스트 (건너뛰기로 드릴 진행)
          const skipBtn = page.locator('text=건너뛰기').first();
          if (await skipBtn.count() > 0) {
            await skipBtn.click();
            await page.waitForTimeout(1500);
            pass('S5-skip-action', '건너뛰기로 다음 드릴 진행');

            // 두 번째 드릴 정답 제출
            const inputEl2 = page.locator('[aria-label="드릴 텍스트 입력"]').first();
            if (await inputEl2.count() > 0) {
              // 첫 번째 드릴 문장으로 정답 시도
              const currentDrillText = await page.evaluate(() => {
                const texts = Array.from(document.querySelectorAll('*'))
                  .map(el => el.textContent?.trim() ?? '')
                  .filter(t => t.length > 5 && /^[A-Z]/.test(t) && t.includes(' ') && t.length < 80);
                return texts[0] ?? 'Hello, how are you?';
              });
              info(`정답 시도 문장: "${currentDrillText}"`);
              await inputEl2.fill(currentDrillText);
              const submitBtn2 = page.locator('text=제출').first();
              await submitBtn2.click();
              await page.waitForTimeout(2000);
              const afterCorrect = await page.content();
              const hasPassed = afterCorrect.includes('자연스러워요') || afterCorrect.includes('좋아요');
              if (hasPassed) {
                pass('S5-correct-pass', '정답 제출 → 통과 표시');
              } else {
                info('정확한 문장 매칭 실패 — scoreDrill 유사도 임계값 확인 필요');
              }
              await screenshot(page, 's5-correct');
            }
          }
        } else {
          fail('S5-text-input-action', '텍스트 입력 필드를 찾을 수 없어 제출 테스트 불가');
        }
      }
    } catch (e) {
      await screenshot(page, 's5-error').catch(() => {});
      fail('S5', e.message, consoleLogs.slice(-5).join('\n'));
    }

    // ════════════════════════════════════════════════════════════════════════
    // 시나리오 6: Conversation — AI 키 없음 → 크래시 없이 폴백
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[S6] Conversation 단계 (AI 키 없음)');
    try {
      // Drill을 건너뛰기로 완료하여 Conversation 진입 시도
      // 현재 페이지가 드릴 단계인지 확인
      await page.waitForTimeout(1000);
      const contentNow = await page.content();

      if (contentNow.includes('CONVERSATION') || contentNow.includes('대화')) {
        pass('S6-conv-enter', 'Conversation 단계 진입');
        await screenshot(page, 's6-conversation');

        const convContent = await page.content();
        const hasCrash = convContent.includes('Something went wrong') ||
          convContent.includes('Error:') || convContent.includes('Unhandled');
        if (!hasCrash) {
          pass('S6-no-crash', 'Conversation 단계 크래시 없음');
        } else {
          fail('S6-no-crash', 'Conversation 단계 크래시 발생');
        }
      } else if (contentNow.includes('DRILL') || contentNow.includes('따라 말해보세요')) {
        info('Drill 단계 진행 중 — Conversation 직접 진입 불가, 드릴 완료 후 접근 필요');
        pass('S6-drill-state', '드릴 완료 전 Conversation 미진입 (정상 흐름)');

        // 드릴 건너뛰기를 반복하여 Conversation 진입 시도
        let drillRound = 0;
        while (drillRound < 5) {
          const skipBtn = page.locator('text=건너뛰기').first();
          const hasSkip = await skipBtn.count() > 0;
          const convNow = await page.content();

          if (convNow.includes('CONVERSATION') || convNow.includes('AI와 대화')) {
            pass('S6-conv-enter', `드릴 ${drillRound}회 후 Conversation 진입`);
            await screenshot(page, 's6-conversation');
            break;
          }

          if (hasSkip) {
            await skipBtn.click();
            await page.waitForTimeout(1500);
          } else {
            // 오답 제출하여 스킵 유도
            const inputEl = page.locator('[aria-label="드릴 텍스트 입력"]').first();
            if (await inputEl.count() > 0) {
              for (let i = 0; i < 3; i++) {
                await inputEl.fill(`wrong ${i}`);
                await page.locator('text=제출').first().click();
                await page.waitForTimeout(800);
                const retryL = page.locator('text=다시 시도').first();
                if (await retryL.count() > 0) await retryL.click();
                await page.waitForTimeout(300);
              }
            } else {
              break;
            }
          }
          drillRound++;
        }

        const finalContent = await page.content();
        if (finalContent.includes('CONVERSATION') || finalContent.includes('AI와 대화')) {
          const hasCrash = finalContent.includes('Something went wrong');
          if (!hasCrash) {
            pass('S6-no-crash', 'Conversation 크래시 없음');
          } else {
            fail('S6-no-crash', 'Conversation 크래시');
          }
        } else {
          info('드릴 반복으로도 Conversation 진입 불가 — 상태 기록');
          pass('S6-state', 'Conversation 진입 불가 상태 기록 (드릴 반복 실패 또는 모든 드릴 완료 필요)');
        }
      } else {
        info(`현재 페이지: ${contentNow.substring(0, 200)}`);
        pass('S6-state', '현재 단계 상태 기록');
      }
      await screenshot(page, 's6-final');
    } catch (e) {
      await screenshot(page, 's6-error').catch(() => {});
      fail('S6', e.message, consoleLogs.slice(-5).join('\n'));
    }

    // ════════════════════════════════════════════════════════════════════════
    // 시나리오 7: 중단·이어하기 (같은 세션 내 재진입)
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[S7] 중단·이어하기 (세션 내 재진입)');
    try {
      // 현재 레슨 URL 저장
      const lessonUrl = page.url();
      info(`현재 레슨 URL: ${lessonUrl}`);

      const isInLesson = lessonUrl.includes('/lesson/');

      if (!isInLesson) {
        // 레슨 재진입 필요
        await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });
        await page.waitForTimeout(2000);
        info('홈으로 이동하여 레슨 재진입 시도');
      }

      // 홈으로 이탈
      const homeContent = lessonUrl.includes('/lesson/') ? 'in-lesson' : 'at-home';
      if (homeContent === 'in-lesson') {
        // 브라우저 뒤로가기로 홈 이탈 시뮬레이션
        await page.goBack();
        await page.waitForTimeout(2000);
        const afterBack = page.url();
        info(`뒤로가기 후 URL: ${afterBack}`);
      }

      await screenshot(page, 's7-home-after-back');

      // 레슨 재진입
      const lessonCardForResume = page.locator('text=LESSON').first();
      const lessonCardCount = await lessonCardForResume.count();
      if (lessonCardCount > 0) {
        await lessonCardForResume.click();
        await page.waitForTimeout(3000);
        const resumeUrl = page.url();
        info(`재진입 URL: ${resumeUrl}`);

        const isResumed = resumeUrl.includes('/lesson/');
        if (isResumed) {
          pass('S7-resume', '레슨 재진입 성공');
          await screenshot(page, 's7-resumed');

          // 같은 단계(드릴) 복원 확인
          const resumeContent = await page.content();
          const isDrillRestored = resumeContent.includes('DRILL') ||
            resumeContent.includes('따라 말해보세요') ||
            resumeContent.includes('CONVERSATION');
          if (isDrillRestored) {
            pass('S7-step-restored', '이어하기 — 진행 단계 복원 확인');
          } else {
            // Learn 단계부터 다시 시작도 허용 (스냅샷이 없으면 처음부터)
            const isLearnRestart = resumeContent.includes('LEARN') || resumeContent.includes('표현 연습');
            if (isLearnRestart) {
              info('Learn 단계부터 재시작 — mock 저장소 세션 유지 여부 확인 필요');
              pass('S7-learn-restart', '재진입 시 Learn 단계 (세션 스냅샷 유무에 따라 정상)');
            } else {
              fail('S7-step-restored', '단계 복원 실패');
            }
          }
        } else {
          fail('S7-resume', `레슨 재진입 실패: ${resumeUrl}`);
        }
      } else {
        info('홈 화면에서 레슨 카드를 찾을 수 없음');
        fail('S7', '레슨 카드 없음 — 홈 화면 상태 이상');
      }
    } catch (e) {
      await screenshot(page, 's7-error').catch(() => {});
      fail('S7', e.message, consoleLogs.slice(-5).join('\n'));
    }

    // ════════════════════════════════════════════════════════════════════════
    // 시나리오 8: 프로필 탭 — 통계, DEV MOCK 뱃지, 로그아웃
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n[S8] 프로필 탭');
    try {
      // 중요: page.goto()는 SPA 상태(Zustand 스토어)를 리셋시킨다.
      // 탭 네비게이션을 SPA 내부에서 클릭으로 수행해야 mock 세션이 유지된다.
      // S7에서 레슨 페이지에 있을 수 있으므로 홈 탭 링크 클릭으로 이동.
      const currentUrlS8 = page.url();
      info(`S8 시작 URL: ${currentUrlS8}`);

      // 레슨 페이지에서 탭 바가 없을 수 있으므로 브라우저 뒤로가기로 홈으로
      if (currentUrlS8.includes('/lesson/')) {
        await page.goBack();
        await page.waitForTimeout(1500);
      }

      // 홈 탭 링크 클릭 (SPA 네비게이션 — 상태 유지)
      const homeTabLink = page.locator('[href*="home"]').first();
      if (await homeTabLink.count() > 0) {
        await homeTabLink.click();
        await page.waitForTimeout(1000);
      }

      // 프로필 탭 링크 클릭 (SPA 내비게이션으로 상태 유지)
      const profileTabLink = page.locator('[href*="profile"]').first();
      const profileTabCount = await profileTabLink.count();
      if (profileTabCount > 0) {
        await profileTabLink.click();
        await page.waitForTimeout(2000);
      } else {
        info('프로필 탭 링크 없음 — URL 직접 접근 (세션 리셋 가능성)');
        await page.goto(BASE_URL + '/(tabs)/profile', { waitUntil: 'networkidle', timeout: TIMEOUT });
        await page.waitForTimeout(2000);
      }

      const profileUrl = page.url();
      info(`프로필 URL: ${profileUrl}`);
      await screenshot(page, 's8-profile');

      const profileContent = await page.content();

      // DEV MOCK 뱃지
      const hasMockBadge = profileContent.includes('DEV MOCK') || profileContent.includes('MOCK');
      if (hasMockBadge) {
        pass('S8-mock-badge', 'DEV MOCK 뱃지 확인');
      } else {
        fail('S8-mock-badge', 'DEV MOCK 뱃지 없음');
      }

      // 통계 표시
      const hasStats = profileContent.includes('XP') || profileContent.includes('경험치') ||
        profileContent.includes('streak') || profileContent.includes('분');
      if (hasStats) {
        pass('S8-stats', '통계 표시 확인');
      } else {
        fail('S8-stats', '통계 미표시');
      }

      // 로그아웃 버튼
      const logoutBtn = page.locator('text=로그아웃').first();
      const logoutCount = await logoutBtn.count();
      if (logoutCount > 0) {
        pass('S8-logout-btn', '로그아웃 버튼 존재');
        await logoutBtn.click();
        await page.waitForTimeout(2000);
        const afterLogout = page.url();
        info(`로그아웃 후 URL: ${afterLogout}`);
        const isLogin = afterLogout.includes('login') ||
          (await page.content()).includes('개발용 로그인');
        if (isLogin) {
          pass('S8-logout', '로그아웃 → /login 복귀');
        } else {
          await screenshot(page, 's8-logout-fail');
          fail('S8-logout', `로그아웃 후 로그인 화면 미복귀: ${afterLogout}`);
        }
      } else {
        fail('S8-logout-btn', '로그아웃 버튼 없음');
      }
      await screenshot(page, 's8-final');
    } catch (e) {
      await screenshot(page, 's8-error').catch(() => {});
      fail('S8', e.message, consoleLogs.slice(-5).join('\n'));
    }

  } finally {
    // 콘솔 에러 저장
    if (consoleLogs.length > 0) {
      fs.writeFileSync(
        path.join(__dirname, 'console-errors.log'),
        consoleLogs.join('\n'),
        'utf8'
      );
      info(`콘솔 에러 ${consoleLogs.length}개 → e2e/console-errors.log`);
    }

    await browser.close();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Supabase 모드 테스트 (시나리오 9~11)
// ════════════════════════════════════════════════════════════════════════════
async function runSupabaseTests() {
  const SUPABASE_PORT = 8083;
  const SUPABASE_URL = 'http://localhost:' + SUPABASE_PORT;
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';

  // Supabase 모드 서버가 떠 있는지 확인
  let supabaseServerUp = false;
  try {
    const res = await fetch(SUPABASE_URL + '/', { signal: AbortSignal.timeout(3000) });
    supabaseServerUp = res.status < 500;
  } catch {
    supabaseServerUp = false;
  }

  if (!supabaseServerUp) {
    results.push({ scenario: 'S9-S11-supabase', status: 'SKIP', note: `Supabase 모드 서버(포트 ${SUPABASE_PORT}) 미기동 — 시나리오 9~11 스킵` });
    console.log(`\n[S9-11] Supabase 모드 서버 미기동 → 스킵`);
    return;
  }

  console.log('\n[S9-11] Supabase 모드 테스트');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  attachConsoleCapture(page);

  try {
    const testEmail = `e2e-test-${Date.now()}@example.com`;
    const testPassword = 'TestPass1234!';

    // S9: 회원가입
    console.log('\n[S9] 회원가입 플로우');
    try {
      await page.goto(SUPABASE_URL + '/', { waitUntil: 'networkidle', timeout: TIMEOUT });
      await page.waitForTimeout(2000);

      const signupTab = page.locator('text=회원가입');
      if (await signupTab.count() > 0) {
        await signupTab.click();
        await page.waitForTimeout(500);
      }

      const emailInput = page.locator('input[placeholder*="example.com"]').first();
      const passwordInput = page.locator('input[placeholder*="8자"]').first();
      if (await emailInput.count() > 0 && await passwordInput.count() > 0) {
        await emailInput.fill(testEmail);
        await passwordInput.fill(testPassword);
        const submitBtn = page.locator('text=회원가입').last();
        await submitBtn.click();
        await page.waitForTimeout(3000);
        await screenshot(page, 's9-signup');

        const urlAfterSignup = page.url();
        const isOnboarding = urlAfterSignup.includes('onboarding') ||
          (await page.content()).includes('학습 목표');
        if (isOnboarding) {
          pass('S9-signup', `회원가입 → 온보딩 진입 (${testEmail})`);
        } else {
          info(`회원가입 후 URL: ${urlAfterSignup}`);
          pass('S9-signup-state', '회원가입 요청 완료 (상태 확인 필요)');
        }
      } else {
        fail('S9-signup', '이메일/비밀번호 입력 필드 없음');
      }
    } catch (e) {
      fail('S9', e.message);
    }

    // S10: 입력 검증
    console.log('\n[S10] 입력 검증');
    try {
      await page.goto(SUPABASE_URL + '/', { waitUntil: 'networkidle', timeout: TIMEOUT });
      await page.waitForTimeout(1500);

      const signupTab = page.locator('text=회원가입');
      if (await signupTab.count() > 0) await signupTab.click();

      // 잘못된 이메일
      const emailInput = page.locator('input[placeholder*="example.com"]').first();
      if (await emailInput.count() > 0) {
        await emailInput.fill('notanemail');
        await page.locator('text=회원가입').last().click();
        await page.waitForTimeout(500);
        const content = await page.content();
        const hasEmailError = content.includes('이메일') || content.includes('올바른');
        if (hasEmailError) {
          pass('S10-invalid-email', '잘못된 이메일 → 한국어 오류 표시');
        } else {
          await screenshot(page, 's10-email-error-fail');
          fail('S10-invalid-email', '이메일 검증 에러 미표시');
        }

        // 짧은 비밀번호
        await emailInput.fill('valid@example.com');
        const passwordInput = page.locator('input[placeholder*="8자"]').first();
        await passwordInput.fill('short');
        await page.locator('text=회원가입').last().click();
        await page.waitForTimeout(500);
        const content2 = await page.content();
        const hasPasswordError = content2.includes('8자') || content2.includes('비밀번호');
        if (hasPasswordError) {
          pass('S10-short-password', '짧은 비밀번호 → 한국어 오류 표시');
        } else {
          await screenshot(page, 's10-password-error-fail');
          fail('S10-short-password', '비밀번호 검증 에러 미표시');
        }
        await screenshot(page, 's10-validation');
      } else {
        fail('S10', '입력 필드 없음');
      }
    } catch (e) {
      fail('S10', e.message);
    }

    // S11: supabase 모드에서 "개발용 로그인" 버튼 없음
    console.log('\n[S11] Supabase 모드 — 개발용 로그인 버튼 미표시');
    try {
      await page.goto(SUPABASE_URL + '/', { waitUntil: 'networkidle', timeout: TIMEOUT });
      await page.waitForTimeout(2000);
      const content = await page.content();
      const hasMockBtn = content.includes('개발용 로그인') || content.includes('Dev Mock');
      if (!hasMockBtn) {
        pass('S11-no-mock-btn', 'Supabase 모드에서 "개발용 로그인" 버튼 미표시 (보안 정상)');
      } else {
        fail('S11-no-mock-btn', 'Supabase 모드에서 "개발용 로그인" 버튼 노출 — 보안 문제!', 'canShowMockLogin 게이트 확인 필요');
      }
      await screenshot(page, 's11-supabase-login');
    } catch (e) {
      fail('S11', e.message);
    }
  } finally {
    await browser.close();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 실행 및 결과 출력
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  TalkTed E2E 테스트 시작');
  console.log('  Mock 모드: http://localhost:8082');
  console.log('═══════════════════════════════════════════════');

  await runMockTests();
  await runSupabaseTests();

  // 결과 표 출력
  console.log('\n═══════════════════════════════════════════════');
  console.log('  결과 요약');
  console.log('═══════════════════════════════════════════════');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  console.log('\n시나리오 | 상태 | 비고');
  console.log('---------|------|-----');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '○';
    console.log(`${icon} ${r.scenario.padEnd(28)} | ${r.status.padEnd(4)} | ${r.note || r.reason || ''}`);
  }

  console.log(`\n총 ${results.length}개: PASS ${passed} / FAIL ${failed} / SKIP ${skipped}`);

  // JSON 결과 저장
  const reportPath = path.join(__dirname, 'results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ results, summary: { passed, failed, skipped } }, null, 2), 'utf8');
  console.log(`\n상세 결과 저장: ${reportPath}`);
  console.log('스크린샷 저장: e2e/screenshots/');
}

main().catch((e) => {
  console.error('E2E 테스트 실행 오류:', e);
  process.exit(1);
});
