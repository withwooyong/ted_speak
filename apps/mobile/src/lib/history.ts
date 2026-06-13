/**
 * history.ts — 대화 기록 통합 집계 (P2 W5b).
 * 튜터 세션(TutorSessionSummary)과 레슨 세션(LessonSessionSummary)을 한 목록으로 합쳐
 * 최신순(started_at desc)으로 정렬한다. 저장소·콘텐츠 의존이 없는 순수 함수라 단위 테스트가 쉽다.
 *
 * 제목 해석(레슨 title·튜터 topic)은 콘텐츠 의존이라 화면 레이어가 담당한다(여기는 데이터만).
 */
import type { LessonSessionSummary } from './progress-repo';
import type { TutorSessionSummary } from './tutor-repo';

/** 대화 기록 1건 — 종류로 판별되는 합집합(상세 라우팅·메타 표시에 사용) */
export type HistoryItem =
  | { kind: 'tutor'; session: TutorSessionSummary }
  | { kind: 'lesson'; session: LessonSessionSummary };

/**
 * 튜터·레슨 세션 요약을 종류 태깅 후 started_at 내림차순(최신 먼저)으로 병합한다.
 * 입력 배열은 변형하지 않는다(불변).
 */
export function mergeHistory(
  tutor: TutorSessionSummary[],
  lesson: LessonSessionSummary[],
): HistoryItem[] {
  const items: HistoryItem[] = [
    ...tutor.map((session): HistoryItem => ({ kind: 'tutor', session })),
    ...lesson.map((session): HistoryItem => ({ kind: 'lesson', session })),
  ];
  // ISO 8601 문자열은 사전순 비교가 곧 시간순 비교라 안전하다.
  return items.sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt));
}
