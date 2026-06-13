/**
 * history.test.ts — TDD red 단계
 * 대상(미존재): apps/mobile/src/lib/history.ts
 *
 * mergeHistory: 튜터 세션 요약 + 레슨 세션 요약을 종류 태깅 후
 * startedAt 내림차순(최신 먼저)으로 병합한다. 저장소 의존 없는 순수 함수.
 */
import { describe, expect, it } from 'vitest';

import { mergeHistory, type HistoryItem } from '../src/lib/history';
import type { LessonSessionSummary } from '../src/lib/progress-repo';
import type { TutorSessionSummary } from '../src/lib/tutor-repo';

function tutor(id: string, startedAt: string): TutorSessionSummary {
  return {
    id,
    topic: 'daily',
    status: 'completed',
    startedAt,
    durationSeconds: 120,
    turnCount: 4,
    summary: null,
  };
}

function lesson(id: string, startedAt: string): LessonSessionSummary {
  return {
    id,
    lessonId: 'lesson-001',
    status: 'completed',
    startedAt,
    completedAt: startedAt,
    summary: null,
  };
}

describe('mergeHistory', () => {
  it('빈 입력은 빈 배열을 반환한다', () => {
    expect(mergeHistory([], [])).toEqual([]);
  });

  it('각 세션에 kind를 태깅한다', () => {
    const merged = mergeHistory([tutor('t1', '2026-06-13T03:00:00Z')], [lesson('l1', '2026-06-13T01:00:00Z')]);
    const byId = Object.fromEntries(merged.map((m) => [m.session.id, m.kind]));
    expect(byId.t1).toBe('tutor');
    expect(byId.l1).toBe('lesson');
  });

  it('startedAt 내림차순(최신 먼저)으로 정렬한다', () => {
    const merged: HistoryItem[] = mergeHistory(
      [tutor('t-old', '2026-06-13T01:00:00Z'), tutor('t-new', '2026-06-13T05:00:00Z')],
      [lesson('l-mid', '2026-06-13T03:00:00Z')],
    );
    expect(merged.map((m) => m.session.id)).toEqual(['t-new', 'l-mid', 't-old']);
  });

  it('레슨·튜터를 시간순으로 교차 병합한다', () => {
    const merged = mergeHistory(
      [tutor('t1', '2026-06-13T04:00:00Z')],
      [lesson('l1', '2026-06-13T06:00:00Z'), lesson('l2', '2026-06-13T02:00:00Z')],
    );
    expect(merged.map((m) => `${m.kind}:${m.session.id}`)).toEqual([
      'lesson:l1',
      'tutor:t1',
      'lesson:l2',
    ]);
  });

  it('한쪽이 비어도 다른 쪽을 모두 포함한다', () => {
    expect(mergeHistory([tutor('t1', '2026-06-13T01:00:00Z')], [])).toHaveLength(1);
    expect(mergeHistory([], [lesson('l1', '2026-06-13T01:00:00Z')])).toHaveLength(1);
  });

  it('입력 배열을 변형하지 않는다 (불변)', () => {
    const t = [tutor('t1', '2026-06-13T01:00:00Z')];
    const l = [lesson('l1', '2026-06-13T02:00:00Z')];
    mergeHistory(t, l);
    expect(t).toHaveLength(1);
    expect(l).toHaveLength(1);
  });
});
