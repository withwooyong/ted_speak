import { CourseSchema, type Course } from '@ted-speak/shared';

import dailyConversation from './courses/daily-conversation.json';

/** 시드 코스 — 로드 시점에 스키마 검증 (위반 시 즉시 throw, 배포 전 CI에서도 검증) */
export const courses: Course[] = [CourseSchema.parse(dailyConversation)];

export function findLesson(lessonId: string) {
  for (const course of courses) {
    const lesson = course.lessons.find((l) => l.id === lessonId);
    if (lesson) return { course, lesson };
  }
  return null;
}
