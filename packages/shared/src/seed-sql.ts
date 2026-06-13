import type { Course } from './content-schema';

/**
 * 시드 SQL 생성기 (U9) — content/*.json(courses)에서 결정적·멱등 seed.sql을 만든다.
 *
 * 설계 원칙:
 * - 파괴 구문(truncate/delete/drop) 없음 — `on conflict (id) do update` upsert로 멱등 보장.
 * - 작은따옴표는 ''로 이스케이프 (JSON.stringify 결과 포함). SQL 인젝션 방어.
 * - "order"는 예약어이므로 항상 따옴표로 감싸고, 컬럼 목록 끝에 둔다.
 * - jsonb 컬럼(key_phrases/drills/conversation)은 ::jsonb 캐스트.
 * - 코스·레슨은 order 기준 정렬 → 같은 입력은 항상 같은 출력(결정적).
 */

/** SQL 문자열 리터럴용 작은따옴표 이스케이프 (' → ''). */
function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

/** 값을 작은따옴표 SQL 리터럴로 감싼다. */
function sqlString(value: string): string {
  return `'${sqlEscape(value)}'`;
}

/** 객체/배열을 JSON 직렬화 후 ::jsonb 캐스트 리터럴로 만든다. */
function sqlJsonb(value: unknown): string {
  return `'${sqlEscape(JSON.stringify(value))}'::jsonb`;
}

function byOrder<T extends { order: number }>(a: T, b: T): number {
  return a.order - b.order;
}

const HEADER = [
  '-- 이 파일은 generated 파일입니다 — 직접 편집하지 마세요.',
  '-- 생성: npm run generate:seed (scripts/generate-seed.mts)',
  '-- 출처: content/*.json (CourseSchema 검증 후 buildSeedSql로 직렬화)',
  '-- 멱등(on conflict do update) upsert이므로 supabase db reset에 안전합니다.',
].join('\n');

/**
 * courses 배열에서 멱등 seed SQL을 생성한다.
 * 빈 배열을 넘기면 헤더만 있는 파괴 구문 없는 유효 문자열을 반환한다.
 *
 * 예약어 "order"는 항상 컬럼 목록의 맨 끝(`, "order")`)에 두어 SQL 식별자
 * 충돌을 피한다. do update set 절에서는 order 갱신을 생략한다 — 시드 order는
 * 콘텐츠 정의상 고정이며, 재실행 시에도 동일 값으로 insert되므로 정합성에 영향이 없다.
 */
export function buildSeedSql(courses: Course[]): string {
  const sorted = [...courses].sort(byOrder);
  const blocks: string[] = [HEADER, ''];

  if (sorted.length === 0) {
    return blocks.join('\n');
  }

  // ── courses ── ("order"를 컬럼 목록 끝에 배치)
  const courseRows = sorted
    .map(
      (c) =>
        `  (${sqlString(c.id)}, ${sqlString(c.title)}, ${sqlString(c.level)}, ${sqlString(
          c.description,
        )}, ${c.order})`,
    )
    .join(',\n');

  blocks.push(
    'insert into public.courses (id, title, level, description, "order") values',
    `${courseRows}`,
    'on conflict (id) do update set',
    '  title = excluded.title,',
    '  level = excluded.level,',
    '  description = excluded.description;',
    '',
  );

  // ── lessons ── ("order"를 컬럼 목록 끝에 배치)
  const lessonRows: string[] = [];
  for (const course of sorted) {
    const lessons = [...course.lessons].sort(byOrder);
    for (const l of lessons) {
      lessonRows.push(
        [
          '  (',
          `    ${sqlString(l.id)},`,
          `    ${sqlString(course.id)},`,
          `    ${sqlString(l.title)},`,
          `    ${sqlString(l.titleEn)},`,
          `    ${l.estimatedMinutes},`,
          `    ${sqlJsonb(l.keyPhrases)},`,
          `    ${sqlJsonb(l.drills)},`,
          `    ${sqlJsonb(l.conversation)},`,
          `    ${l.order}`,
          '  )',
        ].join('\n'),
      );
    }
  }

  if (lessonRows.length > 0) {
    blocks.push(
      'insert into public.lessons (id, course_id, title, title_en, estimated_minutes, key_phrases, drills, conversation, "order") values',
      lessonRows.join(',\n'),
      'on conflict (id) do update set',
      '  course_id = excluded.course_id,',
      '  title = excluded.title,',
      '  title_en = excluded.title_en,',
      '  estimated_minutes = excluded.estimated_minutes,',
      '  key_phrases = excluded.key_phrases,',
      '  drills = excluded.drills,',
      '  conversation = excluded.conversation;',
      '',
    );
  }

  return blocks.join('\n');
}
