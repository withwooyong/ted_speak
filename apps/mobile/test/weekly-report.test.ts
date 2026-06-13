/**
 * weekly-report.test.ts — TDD red 단계 (P2 W6)
 * 대상(미존재): apps/mobile/src/lib/weekly-report.ts
 *
 * 주간 스피킹 리포트 집계 — 저장소 의존 없는 순수 함수.
 * - 발화 시간: 레슨(user_progress.speaking_seconds, 완료분) + 튜터(완료 세션 duration_seconds)
 * - 완료 레슨 수: 기간 내 user_progress 행 수
 * - 교정 TOP5: 기간 내 대화 턴 corrections 빈도순
 * 기간은 rolling 7일(now - 7d), now 주입으로 결정적 테스트.
 */
import type { Correction } from '@ted-speak/shared';
import { describe, expect, it, vi } from 'vitest';

import type { LessonSessionSummary, ProgressRecord } from '../src/lib/progress-repo';
import type { TutorSessionSummary } from '../src/lib/tutor-repo';
import {
  WEEK_MS,
  buildWeeklyReport,
  collectWeeklyReport,
  countCompletedLessons,
  isWithinWeek,
  sumSpeakingSeconds,
  topCorrections,
  weekStartMs,
} from '../src/lib/weekly-report';

const NOW = new Date('2026-06-13T12:00:00Z');
const nowMs = NOW.getTime();

/** 기준 시각에서 daysAgo일 전의 ISO */
function daysAgo(days: number, hours = 0): string {
  return new Date(nowMs - days * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000).toISOString();
}

function progress(lessonId: string, completedAt: string, speakingSeconds: number, score = 80): ProgressRecord {
  return { lessonId, completedAt, speakingSeconds, score };
}

function tutor(
  id: string,
  startedAt: string,
  durationSeconds: number,
  status: TutorSessionSummary['status'] = 'completed',
): TutorSessionSummary {
  return { id, topic: 'daily', status, startedAt, durationSeconds, turnCount: 4, summary: null };
}

function corr(original: string, suggested: string, type: Correction['type'] = 'grammar'): Correction {
  return { original, suggested, type };
}

describe('weekStartMs / isWithinWeek', () => {
  it('weekStartMs는 now에서 7일 전이다', () => {
    expect(weekStartMs(NOW)).toBe(nowMs - WEEK_MS);
  });

  it('기간 시작 경계(정확히 7일 전)는 포함된다', () => {
    expect(isWithinWeek(new Date(nowMs - WEEK_MS).toISOString(), NOW)).toBe(true);
  });

  it('6일 전은 포함, 8일 전은 제외', () => {
    expect(isWithinWeek(daysAgo(6), NOW)).toBe(true);
    expect(isWithinWeek(daysAgo(8), NOW)).toBe(false);
  });

  it('미래 시각은 제외한다', () => {
    expect(isWithinWeek(new Date(nowMs + 60 * 60 * 1000).toISOString(), NOW)).toBe(false);
  });

  it('파싱 불가 문자열은 제외한다', () => {
    expect(isWithinWeek('not-a-date', NOW)).toBe(false);
    expect(isWithinWeek('', NOW)).toBe(false);
  });
});

describe('sumSpeakingSeconds', () => {
  it('기간 내 레슨 발화 + 완료 튜터 발화를 합산한다', () => {
    const p = [progress('l1', daysAgo(1), 60), progress('l2', daysAgo(3), 120)];
    const t = [tutor('t1', daysAgo(2), 90)];
    expect(sumSpeakingSeconds(p, t, NOW)).toBe(60 + 120 + 90);
  });

  it('기간 밖 레슨·튜터는 제외한다', () => {
    const p = [progress('l1', daysAgo(1), 60), progress('l-old', daysAgo(10), 999)];
    const t = [tutor('t1', daysAgo(2), 90), tutor('t-old', daysAgo(9), 999)];
    expect(sumSpeakingSeconds(p, t, NOW)).toBe(60 + 90);
  });

  it('진행 중·중단 튜터 세션은 발화에 포함하지 않는다(완료분만)', () => {
    const t = [
      tutor('t1', daysAgo(1), 100, 'completed'),
      tutor('t2', daysAgo(1), 200, 'in_progress'),
      tutor('t3', daysAgo(1), 300, 'aborted'),
    ];
    expect(sumSpeakingSeconds([], t, NOW)).toBe(100);
  });

  it('빈 입력은 0이다', () => {
    expect(sumSpeakingSeconds([], [], NOW)).toBe(0);
  });
});

describe('countCompletedLessons', () => {
  it('기간 내 완료 레슨 행 수를 센다', () => {
    const p = [progress('l1', daysAgo(1), 60), progress('l2', daysAgo(6), 60), progress('l-old', daysAgo(8), 60)];
    expect(countCompletedLessons(p, NOW)).toBe(2);
  });

  it('빈 입력은 0이다', () => {
    expect(countCompletedLessons([], NOW)).toBe(0);
  });
});

describe('topCorrections', () => {
  it('빈도순으로 정렬하고 limit(기본 5)만큼 반환한다', () => {
    const c = [
      corr('i go', 'I went'),
      corr('i go', 'I went'),
      corr('i go', 'I went'),
      corr('he go', 'he goes'),
      corr('he go', 'he goes'),
      corr('a apple', 'an apple'),
      corr('much people', 'many people'),
      corr('more good', 'better'),
      corr('very like', 'really like'),
      corr('how to say', 'how do you say'),
    ];
    const top = topCorrections(c);
    expect(top).toHaveLength(5);
    expect(top[0]).toMatchObject({ original: 'i go', suggested: 'I went', count: 3 });
    expect(top[1]).toMatchObject({ original: 'he go', suggested: 'he goes', count: 2 });
  });

  it('대소문자·공백 차이는 같은 교정으로 집계한다(정규화 dedupe)', () => {
    const c = [corr('I Go', 'I went'), corr('  i go ', 'I  went '), corr('i go', 'I went')];
    const top = topCorrections(c);
    expect(top).toHaveLength(1);
    expect(top[0].count).toBe(3);
    // 대표 표기는 첫 등장의 원문 casing
    expect(top[0].original).toBe('I Go');
    expect(top[0].suggested).toBe('I went');
  });

  it('동률은 첫 등장 순서를 안정적으로 유지한다', () => {
    const c = [corr('alpha', 'A'), corr('beta', 'B'), corr('beta', 'B'), corr('alpha', 'A')];
    const top = topCorrections(c);
    expect(top.map((t) => t.original)).toEqual(['alpha', 'beta']);
  });

  it('type을 첫 등장 기준으로 보존한다', () => {
    const top = topCorrections([corr('teh', 'the', 'vocab')]);
    expect(top[0].type).toBe('vocab');
  });

  it('limit 인자를 존중한다', () => {
    const c = [corr('a', 'A'), corr('b', 'B'), corr('c', 'C')];
    expect(topCorrections(c, 2)).toHaveLength(2);
  });

  it('빈 입력은 빈 배열이다', () => {
    expect(topCorrections([])).toEqual([]);
  });
});

describe('buildWeeklyReport', () => {
  it('발화·완료·교정을 한 리포트로 조립한다', () => {
    const report = buildWeeklyReport({
      progress: [progress('l1', daysAgo(1), 60), progress('l2', daysAgo(2), 120)],
      tutor: [tutor('t1', daysAgo(1), 90)],
      corrections: [corr('i go', 'I went'), corr('i go', 'I went'), corr('he go', 'he goes')],
      now: NOW,
    });
    expect(report.speakingSeconds).toBe(60 + 120 + 90);
    expect(report.completedLessons).toBe(2);
    expect(report.topCorrections).toHaveLength(2);
    expect(report.topCorrections[0]).toMatchObject({ original: 'i go', count: 2 });
  });

  it('활동이 없으면 0·빈 배열 리포트를 반환한다', () => {
    const report = buildWeeklyReport({ progress: [], tutor: [], corrections: [], now: NOW });
    expect(report).toEqual({ speakingSeconds: 0, completedLessons: 0, topCorrections: [] });
  });
});

describe('collectWeeklyReport', () => {
  function lessonSession(id: string, startedAt: string): LessonSessionSummary {
    return { id, lessonId: 'l', status: 'completed', startedAt, completedAt: startedAt, summary: null };
  }

  it('repo가 둘 다 null이면 빈 리포트를 반환한다(미로그인)', async () => {
    const report = await collectWeeklyReport({ progressRepo: null, tutorRepo: null, now: NOW });
    expect(report).toEqual({ speakingSeconds: 0, completedLessons: 0, topCorrections: [] });
  });

  it('기간 내 세션의 턴만 조회한다(N+1 가드) + 교정을 빈도 집계한다', async () => {
    const progressRepo = {
      listProgress: vi.fn(async (): Promise<ProgressRecord[]> => [progress('l1', daysAgo(1), 60)]),
      listSessions: vi.fn(async (): Promise<LessonSessionSummary[]> => [
        lessonSession('s-in', daysAgo(1)),
        lessonSession('s-old', daysAgo(10)), // 기간 밖 — 턴 조회 안 함
      ]),
      getSessionTurns: vi.fn(async (id: string) =>
        id === 's-in'
          ? [{ order: 0, role: 'user' as const, transcript: 'x', corrections: [corr('i go', 'I went')] }]
          : [],
      ),
    };
    const tutorRepo = {
      listSessions: vi.fn(async (): Promise<TutorSessionSummary[]> => [tutor('t-in', daysAgo(2), 90)]),
      getSessionTurns: vi.fn(async () => [
        { order: 0, role: 'user' as const, transcript: 'y', corrections: [corr('i go', 'I went')] },
      ]),
    };

    const report = await collectWeeklyReport({ progressRepo, tutorRepo, now: NOW });

    // 기간 밖 세션(s-old)은 턴 조회하지 않는다
    expect(progressRepo.getSessionTurns).toHaveBeenCalledTimes(1);
    expect(progressRepo.getSessionTurns).toHaveBeenCalledWith('s-in');
    expect(tutorRepo.getSessionTurns).toHaveBeenCalledTimes(1);

    expect(report.speakingSeconds).toBe(60 + 90);
    expect(report.completedLessons).toBe(1);
    // 레슨·튜터 양쪽 'i go→I went' 교정이 합쳐져 2회
    expect(report.topCorrections).toEqual([
      { original: 'i go', suggested: 'I went', type: 'grammar', count: 2 },
    ]);
  });
});
