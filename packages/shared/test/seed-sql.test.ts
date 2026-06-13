import { describe, expect, it } from 'vitest';

import { CourseSchema, type Course } from '../src/content-schema';
import { buildSeedSql } from '../src/seed-sql';

// ──────────────────────────── 픽스처 ────────────────────────────

/** CourseSchema.parse를 통과한 최소 픽스처 — 작은따옴표·한글·줄바꿈 포함 */
const COURSE_WITH_APOSTROPHE: Course = CourseSchema.parse({
  id: 'course-daily-001',
  title: '일상 회화 첫걸음',
  level: 'A2',
  order: 1,
  description: "인사, 자기소개, 취미 — 매일 쓰는 표현부터 입을 풀어요.",
  lessons: [
    {
      id: 'lesson-003',
      order: 3,
      title: '취미 말하기',
      titleEn: "Talking about what you love",
      estimatedMinutes: 5,
      keyPhrases: [
        { en: "I'm really into hiking.", ko: "저는 등산에 푹 빠져 있어요." },
        { en: "In my free time, I like listening to music.", ko: "여가 시간에는 음악 듣는 걸 좋아해요." },
        { en: "How about you?", ko: "당신은 어때요? — 대화를 이어가는 마법의 한마디" },
      ],
      drills: [
        { text: "I'm really into hiking.", ko: "저는 등산에 푹 빠져 있어요.", keyWords: ['really', 'into', 'hiking'] },
        { text: "How about you?", ko: "당신은 어때요?", keyWords: ['how', 'about', 'you'] },
        { text: 'I like listening to music.', ko: '저는 음악 듣는 걸 좋아해요.', keyWords: ['like', 'listening', 'music'] },
      ],
      conversation: {
        topic: "The user just learned hobby expressions. Ask about their hobbies and free time.",
        openingLine: "Hi! Great drills today. So, what are you into these days?",
        targetTurns: 4,
        hints: [
          "요즘 빠져 있는 취미를 말해보세요 — I'm really into ...",
          "다른 취미도 말해보세요 — I like ...",
        ],
      },
    },
  ],
});

/** 두 번째 코스 픽스처 — 순서 정렬 테스트용 */
const COURSE_ORDER_2: Course = CourseSchema.parse({
  id: 'course-travel-001',
  title: '여행 영어',
  level: 'A1',
  order: 2,
  description: '공항, 호텔, 식당에서 쓰는 기본 여행 영어.',
  lessons: [
    {
      id: 'lesson-travel-001',
      order: 1,
      title: '공항에서',
      titleEn: "At the airport",
      estimatedMinutes: 7,
      keyPhrases: [
        { en: "Where is the gate?", ko: "탑승구가 어디에 있나요?" },
      ],
      drills: [
        { text: "Where is the gate?", ko: "탑승구가 어디에 있나요?", keyWords: ['where', 'gate'] },
      ],
      conversation: {
        topic: "Practice airport vocabulary.",
        openingLine: "You've just landed. Ask for help.",
        targetTurns: 3,
      },
    },
  ],
});

// ──────────────────────────── 테스트 ────────────────────────────

describe('buildSeedSql — 순수 SQL 생성기 (U9)', () => {

  // ─── 기본 생성 ───────────────────────────────────────────────

  it('빈 배열을 넘기면 truncate/delete 없는 유효 SQL을 반환한다 (파괴 구문 없음)', () => {
    const sql = buildSeedSql([]);

    // 파괴 구문이 없어야 한다
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdelete\b/i);
    expect(sql).not.toMatch(/\bdrop\b/i);

    // 빈 배열이라도 문자열을 반환해야 한다
    expect(typeof sql).toBe('string');
  });

  it('헤더 주석에 "generated"가 포함된다 (수동 편집 방지 안내)', () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE]);
    const header = sql.slice(0, 500).toLowerCase();
    expect(header).toContain('generated');
  });

  // ─── courses insert ───────────────────────────────────────────

  it('courses insert에 id·title·level·"order"·description이 포함된다', () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE]);

    expect(sql).toContain("'course-daily-001'");
    expect(sql).toContain('일상 회화 첫걸음');
    expect(sql).toContain("'A2'");
    expect(sql).toContain('"order"'); // 예약어 따옴표
    expect(sql).toContain('입을 풀어요');
  });

  it('courses insert에 on conflict (id) do update가 있다 (멱등 upsert)', () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE]);

    // courses 관련 구문에 on conflict 포함
    expect(sql).toMatch(/on conflict \(id\) do update/i);
  });

  // ─── lessons insert ───────────────────────────────────────────

  it('lessons insert에 id·course_id·"order"·title·title_en·estimated_minutes·key_phrases·drills·conversation이 포함된다', () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE]);

    expect(sql).toContain("'lesson-003'");
    expect(sql).toContain("'course-daily-001'"); // course_id
    expect(sql).toContain('취미 말하기');
    expect(sql).toContain('Talking about what you love'); // title_en
    expect(sql).toContain('::jsonb'); // JSONB 캐스트
  });

  it('lessons insert에 on conflict (id) do update가 있다 (멱등 upsert)', () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE]);

    // 전체 SQL에 두 개(courses + lessons) 이상의 on conflict가 있어야 한다
    const matches = sql.match(/on conflict \(id\) do update/gi) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  // ─── SQL 인젝션 방어 (핵심 케이스) ──────────────────────────

  it("작은따옴표(')는 ''로 이스케이프된다 — I'm → I''m", () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE]);

    // 작은따옴표가 이스케이프된 형태로 존재해야 한다
    expect(sql).toContain("I''m really into hiking.");
    // 이스케이프되지 않은 raw 형태는 없어야 한다 (SQL 토큰 경계 바깥의 홑따옴표)
    // "I'm" 형태는 SQL 문자열 리터럴 안에서 절대 등장하면 안 된다
    expect(sql).not.toMatch(/'I'm/);
  });

  it("JSON.stringify 결과 안의 작은따옴표도 ''로 이스케이프된다", () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE]);

    // hints 배열 안의 "I'm really into ..." 도 이스케이프되어야 한다
    // JSON 안에서도 ' → '' 처리
    expect(sql).not.toMatch(/'[^']*I'm[^']*'/); // 이스케이프 없는 I'm이 SQL 리터럴 안에 없어야 함
  });

  it('한글 텍스트가 깨지지 않고 SQL에 포함된다', () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE]);

    expect(sql).toContain('저는 등산에 푹 빠져 있어요.');
    expect(sql).toContain('일상 회화 첫걸음');
  });

  // ─── order 예약어 처리 ────────────────────────────────────────

  it('"order" 컬럼명이 따옴표로 감싸진다 (SQL 예약어 충돌 방지)', () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE]);

    expect(sql).toContain('"order"');
    // 따옴표 없는 order는 컬럼 값이 아닌 컬럼명으로 쓰이면 안 된다
    // (lookaround로 "order"는 허용 — \b는 따옴표를 단어 경계로 보기 때문)
    expect(sql).not.toMatch(/(?<!")\border\b(?!")/);
  });

  // ─── JSONB 캐스트 ─────────────────────────────────────────────

  it('key_phrases·drills·conversation이 ::jsonb 캐스트로 삽입된다', () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE]);

    // 각 jsonb 컬럼마다 캐스트 등장
    const jsonbCasts = sql.match(/::jsonb/g) ?? [];
    // lessons 1개당 jsonb 3개 (key_phrases, drills, conversation)
    expect(jsonbCasts.length).toBeGreaterThanOrEqual(3);
  });

  // ─── 결정적 출력 ─────────────────────────────────────────────

  it('같은 입력은 항상 같은 출력을 만든다 (결정적)', () => {
    const a = buildSeedSql([COURSE_WITH_APOSTROPHE]);
    const b = buildSeedSql([COURSE_WITH_APOSTROPHE]);
    expect(a).toBe(b);
  });

  it('코스와 레슨은 order 필드 기준으로 정렬된다 (결정적 순서)', () => {
    // 역순으로 넘겨도 SQL 내 삽입 순서는 order 기준이어야 한다
    const sql = buildSeedSql([COURSE_ORDER_2, COURSE_WITH_APOSTROPHE]);

    const pos1 = sql.indexOf("'course-daily-001'"); // order: 1
    const pos2 = sql.indexOf("'course-travel-001'"); // order: 2
    expect(pos1).toBeGreaterThan(-1);
    expect(pos2).toBeGreaterThan(-1);
    expect(pos1).toBeLessThan(pos2); // order 1이 먼저
  });

  // ─── 파괴 구문 부재 (멱등성 보장) ────────────────────────────

  it('생성 SQL에 truncate/delete/drop 같은 파괴 구문이 없다', () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE, COURSE_ORDER_2]);

    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdelete\b/i);
    expect(sql).not.toMatch(/\bdrop\b/i);
    expect(sql).not.toMatch(/\btruncate table\b/i);
  });

  // ─── 다중 코스 ────────────────────────────────────────────────

  it('여러 코스가 있을 때 모든 코스·레슨이 SQL에 포함된다', () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE, COURSE_ORDER_2]);

    expect(sql).toContain("'course-daily-001'");
    expect(sql).toContain("'course-travel-001'");
    expect(sql).toContain("'lesson-003'");
    expect(sql).toContain("'lesson-travel-001'");
  });

  // ─── public 스키마 ────────────────────────────────────────────

  it('insert 대상 테이블이 public.courses와 public.lessons이다', () => {
    const sql = buildSeedSql([COURSE_WITH_APOSTROPHE]);

    expect(sql).toMatch(/into\s+public\.courses/i);
    expect(sql).toMatch(/into\s+public\.lessons/i);
  });
});
