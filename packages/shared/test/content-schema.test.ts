import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CourseSchema } from '../src/content-schema';

const coursesDir = join(__dirname, '../../../content/courses');
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
