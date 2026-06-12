# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 상태

**그린필드 — 아직 코드가 없다.** 현재 `PLAN.md`(프로젝트 계획서 v0.3)만 존재하며, git 저장소도 초기화되지 않았다. 모든 구현 작업 전에 반드시 `PLAN.md`를 읽고 확정된 결정(Decision Log)을 따른다.

## 프로젝트 개요

**TalkTed** (repo: `ted_speak`) — Speak(스픽) 스타일의 AI 영어 스피킹 모바일 앱. 짧은 레슨 + 실시간 AI 대화 + 발음 교정으로 발화량(Output)을 극대화한다. 타겟은 초·중급(A1~B1), MVP는 영어 단일.

Ted 생태계의 일부이지만 **독립 repo**로 운영한다 — `ted_voca`와 코드를 공유하지 않고 패턴만 참고한다.

## 확정된 기술 스택 (변경 시 사용자 확인 필요)

- **Mobile**: React Native (Expo) + Expo Router + NativeWind + Reanimated/Lottie
- **Audio**: expo-av + expo-speech (MVP), OpenAI Realtime API는 Phase 2 AI 튜터 전용
- **AI**: OpenAI Whisper (STT) + GPT-4o (LLM) + OpenAI TTS — MVP는 turn-based 파이프라인 (녹음 → STT → LLM → TTS → 재생)
- **State**: Zustand + TanStack Query
- **Backend**: Supabase only (Auth, PostgreSQL, Storage) + Prisma ORM
- **배포**: EAS Build + Submit

## 계획된 Monorepo 구조

```
apps/mobile/      # Expo React Native 앱
apps/admin/       # Next.js Admin (Phase 3)
packages/shared/  # 타입, 상수, 레슨 스키마
packages/ai/      # STT/TTS/LLM 클라이언트, 프롬프트
content/          # 시드 레슨 JSON
supabase/         # 마이그레이션, RLS
docs/plans/       # phase별 작업계획서 (/ted-run 파이프라인용)
docs/adr/         # 아키텍처 결정 기록
```

## 핵심 아키텍처 개념

- **레슨 3단계 루프**: ① Learn(표현 학습) → ② Drill(따라 말하기, STT 유사도 체크) → ③ Conversation(AI와 3~5턴 대화). 이 루프가 MVP의 핵심이며 상태 머신으로 구현한다.
- **Hybrid 음성 전략**: 레슨은 turn-based(비용 예측 가능, 2~4초 지연 허용), Phase 2 AI 튜터(프리토킹·롤플레이)만 Realtime API. 레슨을 Realtime으로 바꾸지 않는다.
- **콘텐츠**: 시드 커리큘럼은 JSON으로 수동 제작(`content/`), AI는 동적 대화·교정 담당. 첫 시드 코스는 "일상 회화".
- **비용 관리 제약**: 녹음 턴당 최대 30초 + VAD, LLM 히스토리 슬라이딩 윈도우(최근 6턴), 레슨 고정 문장 TTS는 사전 생성·캐시, 일일 API 호출 상한.
- **Fallback 필수**: 마이크 권한 거부 시 텍스트 입력, 네트워크 불안정 시 재시도·로컬 녹음 보존.
- **소프트 제한**: MVP부터 일 1레슨 제한을 두되 과금 UI는 Phase 3까지 없음.

## 개발 프로세스

- **Phase 0 착수 순서** (PLAN.md §14.2): ① AI 스파이크(Whisper→GPT→TTS 1턴 E2E) → ② Expo+Supabase 스캐폴딩 → ③ 와이어프레임 → ④ 시드 레슨 1개 → ⑤ `docs/plans/p0-foundation.md` 작성 후 `/ted-run` 착수
- 구현 작업은 `docs/plans/`의 작업계획서를 기반으로 `/ted-run` 파이프라인(TDD → 구현 → 리뷰 → 검증)을 사용한다.
- 주요 아키텍처 결정은 `docs/adr/`에 ADR로 기록한다.
- 일정보다 품질 우선 (D10).

## 데이터 모델 핵심 (PLAN.md §8)

User → Course → Lesson → LessonSession → ConversationTurn 계층. 진행 추적은 UserProgress(완료·발화 시간·점수), Phase 2에 SavedExpression·PronunciationAttempt 추가.
