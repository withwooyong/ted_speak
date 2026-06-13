import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CourseSchema, RoleplayCollectionSchema, RoleplayScenarioSchema } from '../src/content-schema';

const coursesDir = join(__dirname, '../../../content/courses');
const roleplayDir = join(__dirname, '../../../content/roleplay');
// 모듈 평가 시점이 아닌 테스트 실행 시점에 읽어, 파일 문제가 개별 테스트 실패로 드러나게 한다
const loadSeed = () =>
  JSON.parse(readFileSync(join(coursesDir, 'daily-conversation.json'), 'utf8'));

describe('CourseSchema — content/*.json 계약 (T5)', () => {
  it('content/courses의 모든 JSON이 스키마를 통과한다', () => {
    const files = readdirSync(coursesDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const data = JSON.parse(readFileSync(join(coursesDir, f), 'utf8'));
      const r = CourseSchema.safeParse(data);
      expect(r.success, `${f}: ${JSON.stringify(r.success ? '' : r.error.issues)}`).toBe(true);
    }
  });

  it('drill에 keyWords가 없으면 실패한다', () => {
    const broken = loadSeed();
    delete broken.lessons[0].drills[0].keyWords;
    expect(CourseSchema.safeParse(broken).success).toBe(false);
  });

  it('레벨이 CEFR 범위(A1~B2) 밖이면 실패한다', () => {
    const broken = loadSeed();
    broken.level = 'C2';
    expect(CourseSchema.safeParse(broken).success).toBe(false);
  });

  it('conversation.targetTurns는 3~5 범위만 허용한다 (PLAN §4.2)', () => {
    const broken = loadSeed();
    broken.lessons[0].conversation.targetTurns = 12;
    expect(CourseSchema.safeParse(broken).success).toBe(false);
  });

  it('keyPhrases가 비어 있으면 실패한다 (레슨은 표현 3~5개)', () => {
    const broken = loadSeed();
    broken.lessons[0].keyPhrases = [];
    expect(CourseSchema.safeParse(broken).success).toBe(false);
  });

  it('keyPhrases가 5개를 넘으면 실패한다 (레슨은 표현 3~5개)', () => {
    const broken = loadSeed();
    const phrase = broken.lessons[0].keyPhrases[0];
    broken.lessons[0].keyPhrases = Array.from({ length: 6 }, () => ({ ...phrase }));
    expect(CourseSchema.safeParse(broken).success).toBe(false);
  });
});

// ── 롤플레이 시나리오 (P2 W3) ────────────────────────────────────────────────

const loadRoleplay = () =>
  JSON.parse(readFileSync(join(roleplayDir, 'scenarios.json'), 'utf8'));

/** 스키마 통과용 최소 유효 시나리오 픽스처 */
const validScenario = () => ({
  id: 'restaurant',
  title: '레스토랑 주문',
  titleEn: 'At the Restaurant',
  level: 'A2',
  order: 1,
  setting: '식당에서 음식을 주문하는 상황이에요.',
  learnerRole: '손님',
  tedRole: '웨이터',
  tedPersona: 'You are a friendly waiter at a cozy restaurant. Keep replies short.',
  openingLine: 'Hi, welcome! Are you ready to order?',
  objectives: [
    { id: 'greet', label: '인사하고 자리 확인하기', labelEn: 'Greet and ask about a table' },
    { id: 'order', label: '메뉴 주문하기', labelEn: 'Order a dish' },
  ],
});

describe('RoleplayScenarioSchema — content/roleplay/*.json 계약 (W3)', () => {
  it('content/roleplay의 모든 JSON이 컬렉션 스키마를 통과한다', () => {
    const files = readdirSync(roleplayDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const data = JSON.parse(readFileSync(join(roleplayDir, f), 'utf8'));
      const r = RoleplayCollectionSchema.safeParse(data);
      expect(r.success, `${f}: ${JSON.stringify(r.success ? '' : r.error.issues)}`).toBe(true);
    }
  });

  it('시드 시나리오는 4종이고 id가 고유하다 (레스토랑·공항·면접·호텔)', () => {
    const data = RoleplayCollectionSchema.parse(loadRoleplay());
    expect(data.scenarios.length).toBe(4);
    const ids = data.scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('유효한 최소 시나리오는 통과한다', () => {
    expect(RoleplayScenarioSchema.safeParse(validScenario()).success).toBe(true);
  });

  it('objectives가 2개 미만이면 실패한다 (목표 최소 2)', () => {
    const broken = validScenario();
    broken.objectives = broken.objectives.slice(0, 1);
    expect(RoleplayScenarioSchema.safeParse(broken).success).toBe(false);
  });

  it('objectives가 4개를 넘으면 실패한다 (목표 최대 4)', () => {
    const broken = validScenario();
    const o = broken.objectives[0];
    broken.objectives = Array.from({ length: 5 }, (_, i) => ({ ...o, id: `o${i}` }));
    expect(RoleplayScenarioSchema.safeParse(broken).success).toBe(false);
  });

  it('objective id가 시나리오 안에서 중복이면 실패한다', () => {
    const broken = validScenario();
    broken.objectives = [broken.objectives[0], { ...broken.objectives[0] }];
    expect(RoleplayScenarioSchema.safeParse(broken).success).toBe(false);
  });

  it('레벨이 CEFR 범위 밖이면 실패한다', () => {
    const broken = validScenario();
    (broken as { level: string }).level = 'C2';
    expect(RoleplayScenarioSchema.safeParse(broken).success).toBe(false);
  });

  it('openingLine이 비면 실패한다 (Ted 첫 발화 필수)', () => {
    const broken = validScenario();
    broken.openingLine = '';
    expect(RoleplayScenarioSchema.safeParse(broken).success).toBe(false);
  });

  it('컬렉션 안에서 시나리오 id가 중복이면 실패한다', () => {
    const broken = { scenarios: [validScenario(), validScenario()] };
    expect(RoleplayCollectionSchema.safeParse(broken).success).toBe(false);
  });
});
