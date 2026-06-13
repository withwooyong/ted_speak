import {
  CourseSchema,
  RoleplayCollectionSchema,
  type Course,
  type RoleplayScenario,
} from '@ted-speak/shared';

import dailyConversation from './courses/daily-conversation.json';
import roleplayScenariosJson from './roleplay/scenarios.json';

/** 시드 코스 — 로드 시점에 스키마 검증 (위반 시 즉시 throw, 배포 전 CI에서도 검증) */
export const courses: Course[] = [CourseSchema.parse(dailyConversation)];

export function findLesson(lessonId: string) {
  for (const course of courses) {
    const lesson = course.lessons.find((l) => l.id === lessonId);
    if (lesson) return { course, lesson };
  }
  return null;
}

/** 시드 롤플레이 시나리오 (P2 W3) — 로드 시점에 스키마 검증, order 순으로 정렬 */
export const roleplayScenarios: RoleplayScenario[] = [
  ...RoleplayCollectionSchema.parse(roleplayScenariosJson).scenarios,
].sort((a, b) => a.order - b.order);

export function findScenario(scenarioId: string): RoleplayScenario | undefined {
  return roleplayScenarios.find((s) => s.id === scenarioId);
}
