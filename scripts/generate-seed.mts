#!/usr/bin/env node
/**
 * 시드 SQL 생성기 (U9) — content/*.json(courses)을 supabase/seed.sql로 직렬화한다.
 *
 * 실행: npm run generate:seed  (또는 npx tsx scripts/generate-seed.mts)
 *
 * content/index.ts가 로드 시점에 CourseSchema.parse로 검증하므로, 스키마 위반
 * 콘텐츠는 여기서 즉시 throw된다. 출력 seed.sql은 generated 파일이며 멱등 upsert다.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSeedSql } from '../packages/shared/src/seed-sql.ts';

import { courses } from '../content/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../supabase/seed.sql');

const sql = buildSeedSql(courses);
writeFileSync(OUT, sql.endsWith('\n') ? sql : `${sql}\n`, 'utf8');

const lessonCount = courses.reduce((n, c) => n + c.lessons.length, 0);
console.log(`✅ seed.sql 생성 완료 — 코스 ${courses.length}개 / 레슨 ${lessonCount}개`);
console.log(`   → ${OUT}`);
