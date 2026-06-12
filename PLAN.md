# Ted Speak — 프로젝트 계획서

> Speak(스픽) 스타일의 AI 영어 스피킹 앱  
> v0.3 (결정 사항 반영) | 2026-06-12

---

## 1. 프로젝트 개요

### 1.1 한 줄 정의

**AI 튜터와 실제로 영어로 말하며 스피킹 실력을 키우는 모바일 앱 — 짧은 레슨 + 실시간 대화 + 발음 교정**

문법·독해 중심이 아니라 **발화량(Output)** 을 극대화한다.  
원어민과 대화할 기회가 없는 사용자에게 **24시간 AI 회화 파트너**를 제공한다.

### 1.2 Ted 생태계 내 위치

| 앱 | 역할 |
|---|---|
| **Ted Voca** | 어휘·문법·리스닝·SRS (입력 중심) |
| **Ted Duolingo** | 게임화 다국어 레슨 (균형) |
| **Ted Speak** | **스피킹·회화·발음 (출력 중심)** |

> v1은 독립 앱으로 출시. Phase 3+에서 Ted Voca와 학습 데이터(약점 어휘·레벨) 연동 검토.

### 1.3 확정 / 미확정 방향 (Decision Log)

| # | 항목 | 상태 | 내용 |
|---|---|---|---|
| D1 | 앱 종류 | ✅ | AI 영어 스피킹 (Speak 유사) |
| D2 | 학습 방향 | ✅ | **영어 스피킹 단일** (MVP) → 다국어 확장은 Phase 4 |
| D3 | 타겟 | ✅ | **초·중급 (A1~B1)** — MVP 검증 후 B2·비즈니스 확장 |
| D4 | 콘텐츠 | ✅ | **하이브리드** — 시드 커리큘럼(수동) + AI 동적 대화 |
| D5 | 플랫폼 | ✅ | **Mobile first** (iOS/Android, Expo) |
| D6 | 게임화 | ✅ | **Light** — streak, 일일 목표, XP, 레슨 완료 연출 |
| D7 | AI | ✅ | **Hybrid** — 레슨: Whisper+GPT+OpenAI TTS / AI 튜터: Realtime (Phase 2) |
| D8 | 기술 스택 | ✅ | **React Native (Expo) + Supabase only** |
| D9 | 수익 모델 | ✅ | **소프트 제한** — MVP부터 일 1레슨 등 제한, 과금 UI는 Phase 3 |
| D13 | TTS | ✅ | **OpenAI TTS** |
| D14 | STT | ✅ | **OpenAI Whisper** |
| D15 | Phase 0 | ✅ | **AI 스파이크 먼저** → 앱 스캐폴딩 |
| D16 | 앱 이름 | ✅ | **TalkTed** (repo: `ted_speak`) |
| D11 | 시드 코스 | ✅ | **일상 회화** (인사, 자기소개, 취미) |
| D12 | 저장소 | ✅ | **독립 repo** (`ted_speak`) — Ted Voca와 분리, 패턴만 참고 |
| D10 | 일정 | ✅ | **유연 — 품질 우선** (ted-run 파이프라인 호환) |

### 1.4 목표

- **MVP**: "오늘의 레슨 → 스피킹 연습 → AI 실전 대화" 3단계 루프를 **음성 중심 UX**로 완성
- **Phase 2**: AI 튜터(프리토킹·롤플레이), 발음 코치(음소 단위 피드백)
- **Phase 3**: Freemium·구독, 커리큘럼 확장, 학습 리포트
- **Phase 4**: Ted Voca 연동, Web/PWA, 다국어

---

## 2. Speak 벤치마크 & 차별화

### 2.1 Speak 핵심 기능 매핑

| Speak 기능 | Ted Speak 대응 | MVP |
|---|---|---|
| 오늘의 수업 | 커리큘럼 레슨 (핵심 표현·패턴) | ✅ |
| 스피킹 연습 | 따라 말하기, 문장 완성 말하기 | ✅ |
| 실전 대화 | AI와 상황별 3~5턴 대화 | ✅ |
| AI 튜터 | 주제/롤플레이 자유 대화 | Phase 2 |
| 발음 코치 | 음소·강세·억양 피드백 | Phase 2 |
| 실시간 교정 | 문법·표현 즉시 피드백 | ✅ (기본) |
| 커리큘럼 | 2,000+ 콘텐츠 | Phase 3 (MVP는 1 코스·20레슨) |

### 2.2 Ted Speak만의 차별화 (제안)

1. **Ted 페르소나** — AI 튜터를 "Ted"로 통일 (Ted Voca와 브랜드 일관성)
2. **투명한 스피킹 리포트** — 발화 시간, 자주 틀리는 발음·표현, 주간 그래프를 사용자에게 공개
3. **Voca 연동 준비** — 약점 어휘를 Speak 레슨에 자연스럽게 녹이는 구조 (Phase 3)
4. **오픈 커리큘럼** — JSON/DB 시드로 시나리오·레슨 추가 가능 (운영·확장 용이)

---

## 3. 타겟 사용자

### 3.1 Primary Persona — "말은 못 하는 영어 학습자"

- 20~40세, 문법·독해는 어느 정도지만 **입 밖으로 영어가 잘 안 나옴**
- 원어민·화상영어는 비용·시간 부담
- 출퇴근·점심·자투리 **5~15분** 스피킹 습관 원함

### 3.2 Secondary Persona — "실무·여행 직전 준비자"

- 면접, 프레젠테이션, 해외 출장 등 **상황별 롤플레이** 필요
- 비즈니스·여행 시나리오에 높은 지불 의사

---

## 4. 핵심 기능 정의

### 4.1 MVP Must-Have (P0)

| 기능 | 설명 |
|---|---|
| **회원가입/로그인** | 이메일 + OAuth (Google, Apple) — Supabase Auth |
| **온보딩** | 영어 레벨(자가·간단 진단), 학습 목표(일상/비즈/시험), 일일 목표(분) |
| **홈** | 오늘의 레슨, streak, 발화 시간, 이어하기 |
| **레슨 3단계** | ① 표현 학습 ② 스피킹 연습 ③ 실전 대화 |
| **음성 입력 (STT)** | 사용자 발화 → 텍스트 변환 |
| **음성 출력 (TTS)** | AI·모범 발음 재생 |
| **실시간 피드백** | 문법·표현 교정 (텍스트 + 간단 음성) |
| **진행 저장** | 레슨·코스별 완료, 중단 지점 복원 |
| **마이크 권한 UX** | 최초 안내, 권한 거부 시 대체(텍스트 입력) |
| **기본 통계** | 총 발화 시간, 완료 레슨 수, streak |

### 4.2 레슨 3단계 상세 (Speak 구조)

```
[Step 1] 오늘의 수업 (Learn)
  → 핵심 표현 3~5개 소개 (TTS 재생)
  → 예문 듣기 + 따라 말하기 (선택)

[Step 2] 스피킹 연습 (Drill)
  → AI가 문장 제시 → 사용자 따라 말하기
  → STT로 유사도·핵심 단어 체크
  → 틀리면 모범 발음 재생 + 재시도

[Step 3] 실전 대화 (Conversation)
  → 레슨 주제 기반 3~5턴 대화
  → AI가 자연스럽게 유도·교정
  → 완료 시 요약 피드백 (잘한 점 / 개선점)
```

### 4.3 Phase 2 — AI 튜터 & 발음 코치

| 기능 | 설명 |
|---|---|
| **프리토킹** | 주제 선택 후 AI와 자유 대화 (시간 제한) |
| **롤플레이** | 레스토랑, 공항, 면접, 호텔 등 시나리오 |
| **발음 코치** | 단어·음소 단위 점수, 강세·리듬 피드백 |
| **대화 히스토리** | 과거 대화 복습, 표현 저장 |

### 4.4 Phase 3 — 수익화 & 콘텐츠

| 기능 | 설명 |
|---|---|
| **Freemium** | Free: 일 1레슨 + AI 5분 / Premium: 무제한 |
| **구독** | RevenueCat + App Store / Play IAP |
| **커리큘럼 확장** | 초급→중급→비즈니스 코스 |
| **주간 리포트** | 발화량, 약점 TOP5, 추천 레슨 |
| **Admin** | 레슨·시나리오 CRUD, AI 생성 초안 검수 |

### 4.5 비목표 (MVP)

- 다국어 학습 (영어 단일)
- 문법·독해 전용 모듈 (Ted Voca 역할)
- Duolingo급 리그·하트·배지 풀 게임화
- App Store 유료 구독 (Phase 3까지 무료 또는 소프트 런치)
- 웹 버전 (Expo Web은 개발용만)

---

## 5. 사용자 여정 (User Flow)

```
[온보딩]
  → 학습 목표 선택 (일상 / 비즈 / 여행)
  → 레벨 (초급 / 중급 / 간단 5문항 진단)
  → 일일 목표 (5·10·15분)
  → 마이크 권한 요청

[홈]
  → "오늘의 레슨" 카드 (Ted 인사)
  → streak, 오늘 발화 N분
  → 코스 진행률 (레슨 N/M)
  → (Phase 2) AI 튜터 바로가기

[레슨 /lesson/[id]]
  → Step 1 Learn (표현·예문)
  → Step 2 Drill (따라 말하기)
  → Step 3 Conversation (AI 대화)
  → 완료 화면: 피드백 요약 + XP/streak

[프로필]
  → 학습 통계, streak
  → 저장된 표현 (Phase 2)
  → 설정, Premium (Phase 3)

[AI 튜터] (Phase 2)
  → 프리토킹 / 롤플레이 선택
  → 실시간 음성 대화
  → 종료 시 대화 요약
```

---

## 6. 기술 스택

### 6.1 확정 / 후보

| 레이어 | 기술 | 비고 |
|---|---|---|
| Mobile | **React Native (Expo)** | Ted Voca/Duolingo와 동일 |
| Navigation | **Expo Router** | 파일 기반 라우팅 |
| UI | **NativeWind** | 음성 중심 풀스크린 UI |
| Animation | **Reanimated + Lottie** | 듣기·말하기·완료 연출 |
| Audio I/O | **expo-av** + **expo-speech** (MVP) | 녹음·재생 |
| Realtime Voice | **OpenAI Realtime API** (Phase 2) | 저지연 양방향 (U1) |
| STT | **OpenAI Whisper** | 발화 → 텍스트 |
| TTS | **OpenAI TTS** | AI·모범 발음 (레슨 문장 사전 캐시) |
| LLM | **GPT-4o** | 대화·교정·피드백 |
| State | **Zustand + TanStack Query** | |
| Backend | **Supabase** | Auth, DB, Storage (오디오 샘플) |
| DB | **PostgreSQL** | |
| ORM | **Prisma** | |
| Cache | **Upstash Redis** (선택) | 세션·rate limit |
| 결제 | **RevenueCat** (Phase 3) | |
| 배포 | **EAS Build + Submit** | |
| Admin | **Next.js** (Phase 3) | 콘텐츠 관리 |

### 6.2 음성 파이프라인 (MVP vs Phase 2)

**MVP — Turn-based (구현 단순, 비용 예측 가능)**

```
사용자 녹음 → STT → LLM(교정+다음 발화) → TTS → 재생
(턴당 2~4초 지연 허용)
```

**Phase 2 — Realtime (AI 튜터 전용, ✅ 확정)**

```
OpenAI Realtime WebSocket
  ↔ expo-av / native audio stream
(프리토킹·롤플레이만 적용. 레슨 3단계는 turn-based 유지)
```

> **Hybrid 전략 이유**: 레슨은 스크립트·교정이 예측 가능해 turn-based로 충분하고 비용이 낮음.  
> AI 튜터(자유 대화)만 Realtime으로 Speak급 체감을 제공.

### 6.3 프로젝트 구조 (Monorepo)

```
ted_speak/
├── apps/
│   ├── mobile/          # Expo React Native
│   └── admin/           # Next.js (Phase 3)
├── packages/
│   ├── shared/          # 타입, 상수, 레슨 스키마
│   └── ai/              # STT/TTS/LLM 클라이언트, 프롬프트
├── content/             # 시드 레슨 JSON
├── supabase/            # 마이그레이션, RLS
└── docs/
    ├── plans/           # phase별 작업계획서 (ted-run용)
    └── adr/             # 아키텍처 결정 기록
```

---

## 7. AI 설계 (초안)

### 7.1 대화 시스템 프롬프트 원칙

- **레벨 적응**: CEFR A1~B2에 맞춰 어휘·문장 길이 조절
- **교정 방식**: 대화 흐름을 끊지 않고, 턴 종료 후 또는 가벼운 inline correction
- **한국어 보조**: 초급 사용자에게만 선택적 힌트 (설정 가능)
- **안전**: 개인정보·부적절 주제 필터

### 7.2 피드백 JSON 스키마 (예시)

```json
{
  "transcript": "I go to store yesterday",
  "corrections": [
    { "original": "go", "suggested": "went", "type": "grammar" }
  ],
  "pronunciationScore": 0.72,
  "encouragement": "Good try! Past tense next time.",
  "savedExpressions": ["I went to the store yesterday"]
}
```

### 7.3 비용 관리

| 항목 | MVP 대策 |
|---|---|
| STT | 턴당 녹음 최대 30초, 침묵 VAD로 자동 종료 |
| LLM | 대화 히스토리 슬라이딩 윈도우 (최근 6턴) |
| TTS | 레슨 고정 문장은 **사전 생성·캐시** |
| Free tier | 일일 API 호출 상한 (서버 rate limit) |

---

## 8. 데이터 모델 (초안)

```
User
  ├── id, email, displayName
  ├── level (A1~B2), goal (daily|business|travel)
  ├── dailyGoalMinutes, streak, totalSpeakingSeconds
  ├── isPremium, premiumExpiresAt
  └── lastStudyDate

Course
  ├── id, title, level, order
  └── description, lessonCount

Lesson
  ├── id, courseId, order, title
  ├── keyPhrases (JSON), scenario
  ├── step1Content, step2Drills (JSON)
  └── estimatedMinutes

LessonSession
  ├── id, userId, lessonId
  ├── currentStep, status (in_progress|completed)
  ├── startedAt, completedAt
  └── feedbackSummary (JSON)

ConversationTurn
  ├── sessionId, order
  ├── role (user|assistant)
  ├── transcript, audioUrl (optional)
  └── corrections (JSON)

UserProgress
  ├── userId, lessonId, completedAt
  └── speakingSeconds, score

SavedExpression (Phase 2)
  ├── userId, phrase, context, sourceSessionId

PronunciationAttempt (Phase 2)
  ├── userId, word, phonemeScores (JSON), recordedAt
```

---

## 9. 화면 구조 (Mobile IA)

```
/onboarding              목표·레벨·마이크 권한
/(tabs)/
  home                   오늘의 레슨, streak, 발화 시간
  tutor                  AI 튜터 (Phase 2)
  profile                통계, 설정
/lesson/[id]             3단계 레슨 플레이
/lesson/[id]/complete    완료 + 피드백
/lesson/[id]/step/[n]    (선택) 스텝별 deep link
/settings                알림, 레벨, 계정
/premium                 구독 (Phase 3)
```

---

## 10. 개발 로드맵 (품질 우선)

### Phase 0 — 기반 (1~2주 목표)

- [ ] Monorepo 초기화 (Expo + shared + content)
- [ ] Supabase Auth (이메일, Google, Apple)
- [ ] Prisma 스키마 + RLS
- [ ] 마이크 녹음 / 재생 POC (expo-av)
- [ ] STT + LLM + TTS end-to-end 스파이크 (1턴 대화)
- [ ] CI (lint, typecheck, test)

### Phase 1 — MVP 핵심 루프

- [ ] 온보딩 (목표, 레벨, 일일 목표)
- [ ] 홈 (오늘의 레슨, streak)
- [ ] 레슨 Step 1~3 UI + 상태 머신
- [ ] Turn-based AI 대화 + 기본 교정
- [ ] 레슨 완료 피드백 화면
- [ ] 시드 코스 1개 · 레슨 5~10개 (수동 JSON)
- [ ] 진행 저장·이어하기

### Phase 2 — AI 튜터 & 발음

- [ ] 프리토킹 / 롤플레이 시나리오
- [ ] (선택) OpenAI Realtime 전환 POC
- [ ] 발음 점수·피드백 UI
- [ ] 대화 히스토리·표현 저장
- [ ] 주간 스피킹 리포트

### Phase 3 — 수익화 & 운영

- [ ] Freemium 게이트 (일일 제한)
- [ ] RevenueCat + IAP
- [ ] Admin: 레슨 CRUD, AI 초안 생성
- [ ] 커리큘럼 확장 (초급→중급)
- [ ] TestFlight / 내부 테스트 배포

### Phase 4 — 생태계 & 확장

- [ ] Ted Voca 연동 (약점 어휘 → Speak 레슨)
- [ ] Web/PWA (선택)
- [ ] 추가 언어 (일본어·스페인어 등)

---

## 11. Freemium 모델 (안)

| | Free | Premium |
|---|---|---|
| 오늘의 레슨 | 1개/일 | 무제한 |
| AI 튜터 | 5분/일 | 무제한 |
| 발음 코치 | 기본 | 상세 리포트 |
| 대화 히스토리 | 7일 | 무제한 |
| 광고 | 없음 (초기) | — |
| 가격 | — | 월/연 구독 (Speak 참고: 연 ~1만원대/월) |

---

## 12. 성공 지표 (KPI)

| 지표 | MVP 목표 |
|---|---|
| D1 Retention | 30%+ |
| D7 Retention | 15%+ |
| 레슨 완료율 | 60%+ |
| 레슨당 평균 발화 시간 | 3분+ |
| 7일 streak 유지율 | 10%+ |
| Free → Premium (Phase 3) | 3~5% |

---

## 13. 리스크 & 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| 음성 지연·끊김 | 핵심 UX 붕괴 | MVP는 turn-based, Realtime은 Phase 2 POC 후 |
| STT 한국인 발음 오인식 | 좌절감 | Whisper fine-tune 검토, 재녹음 UX, 텍스트 fallback |
| AI API 비용 | 마진 악화 | TTS 캐시, Free tier 제한, 턴 길이 cap |
| 마이크 권한 거부 | 기능 불가 | 텍스트 입력 fallback + 권한 재요청 가이드 |
| Speak과 차별화 부족 | 유입 어려움 | Ted 브랜드·Voca 연동·투명 리포트 |
| 앱스토어 IAP 심사 | 출시 지연 | RevenueCat, 가이드라인 사전 검토 |

---

## 14. 다음 단계

### 14.1 확정된 결정 (v0.3)

| # | 항목 | 결정 |
|---|---|---|
| U1 | 음성 AI 스택 | **Hybrid** — 레슨 turn-based, AI 튜터 Realtime |
| U2 | TTS | **OpenAI TTS** |
| U3 | MVP 타겟 레벨 | **초·중급 (A1~B1)** |
| U4 | 앱 이름 | **TalkTed** (별도 브랜드, repo는 `ted_speak`) |
| U5 | 저장소 | **독립 repo** (`ted_speak`) |
| U6 | 첫 시드 코스 | **일상 회화** |
| U7 | 게임화 | **Light** — streak + 목표 + XP + 완료 연출 |
| U8 | STT | **OpenAI Whisper** |
| U9 | 백엔드 | **Supabase only** |
| D9 | MVP 과금 | **소프트 제한** (일 1레슨, 과금 UI 없음) |
| U10 | Phase 0 | **AI 스파이크 먼저** |

### 14.2 Phase 0 킥오프 순서 (✅ 확정)

1. **AI 스파이크** — turn-based 1턴 대화 E2E (Whisper → GPT → TTS)
2. **Expo + Supabase 스캐폴딩** (ted_voca 구조 참고)
3. **와이어프레임** — 홈 / 레슨 3단계 / 완료 피드백
4. **시드 레슨 1개** 수동 제작 → End-to-end 데모
5. `docs/plans/p0-foundation.md` 작성 → `/ted-run` 파이프라인 착수

---

## 부록 A — Speak 벤치마크 체크리스트

- [ ] 레슨 5~15분 이내 완료
- [ ] 한 레슨에서 **말하기 10문장 이상** 유도
- [ ] AI가 먼저 말을 걸어 대화 시작
- [ ] 틀렸을 때 모범 발음 재생
- [ ] 레슨 종료 시 "잘한 점 / 개선점" 요약
- [ ] streak·일일 목표로 재방문 유도
- [ ] 마이크 없이도 최소 기능 동작 (fallback)
- [ ] 네트워크 불안정 시 재시도·로컬 녹음 보존

## 부록 B — ted_voca 재사용 가능 모듈

| 모듈 | ted_voca | ted_speak |
|---|---|---|
| Supabase Auth | ✅ | 재사용 |
| Expo Router 구조 | ✅ | 참고 |
| Dev Mock Auth | ✅ | 재사용 |
| STT/회화 (3.6) | 계획됨 | **핵심으로 확장** |
| SRS/어휘 | ✅ | 비목표 (Voca 역할) |

---

*v0.3 — 전 항목 확정, Phase 0 착수 가능*
