/** PLAN.md §8 데이터 모델 — MVP 범위 타입 정의 */

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2';
export type LearningGoal = 'daily' | 'business' | 'travel';

export interface Course {
  id: string;
  title: string;
  level: CEFRLevel;
  order: number;
  description: string;
  lessons: Lesson[];
}

/** 레슨 3단계 (Learn → Drill → Conversation) 콘텐츠 스키마 — content/*.json과 1:1 */
export interface Lesson {
  id: string;
  order: number;
  title: string;
  titleEn: string;
  estimatedMinutes: number;
  /** Step 1: 핵심 표현 */
  keyPhrases: KeyPhrase[];
  /** Step 2: 따라 말하기 */
  drills: Drill[];
  /** Step 3: 실전 대화 시나리오 */
  conversation: ConversationScenario;
}

export interface KeyPhrase {
  en: string;
  ko: string;
}

export interface Drill {
  text: string;
  ko: string;
  /** STT 유사도 판정 시 반드시 포함돼야 하는 핵심 단어 */
  keyWords: string[];
}

export interface ConversationScenario {
  /** AI 시스템 프롬프트에 주입되는 상황 설명 */
  topic: string;
  openingLine: string;
  /** 목표 턴 수 (3~5) */
  targetTurns: number;
  /** 사용자에게 보여줄 한국어 힌트 (턴별, 선택) */
  hints?: string[];
}

/** PLAN.md §7.2 — 턴 피드백 JSON (스파이크에서 검증 완료) */
export interface TurnFeedback {
  corrections: Correction[];
  reply: string;
  encouragement: string;
}

export interface Correction {
  original: string;
  suggested: string;
  type: 'grammar' | 'vocab' | 'pronunciation';
}

export type LessonStep = 1 | 2 | 3;
export type SessionStatus = 'in_progress' | 'completed';

export interface LessonSession {
  id: string;
  userId: string;
  lessonId: string;
  currentStep: LessonStep;
  status: SessionStatus;
  startedAt: string;
  completedAt?: string;
  feedbackSummary?: { strengths: string[]; improvements: string[] };
}
