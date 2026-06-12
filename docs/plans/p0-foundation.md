# P0 — Foundation 작업계획서

> Ted Speak (TalkTed) Phase 0 기반 작업 | 2026-06-12
> 근거: PLAN.md §10 Phase 0, §14.2 킥오프 순서
> 파이프라인: /ted-run (TDD → 구현 → 이중 리뷰 → Verification → 커밋)

---

## 0. 현재 상태 (이미 완료된 선행 작업)

| 항목 | 상태 | 산출물 |
|---|---|---|
| HTML 프로토타입 (동선·UI 검증) | ✅ | `prototype/index.html` |
| AI 스파이크 1턴 E2E | ✅ | `packages/ai/spike/one-turn.mjs`, `out/result.json` |
| Expo 모노레포 스캐폴딩 | ✅ | `apps/mobile` (SDK 56), `packages/shared`, `packages/ai` |
| 시드 레슨 콘텐츠 1개 | ✅ | `content/courses/daily-conversation.json` |
| git 초기화 | ✅ | main 브랜치, 3커밋 |

### 스파이크 실측 결과 (2회)

- Whisper STT 1.7~2.3s · GPT-4o 1.5~1.8s · tts-1 1.7~2.2s → **턴 합계 5.4~5.9s (목표 ≤4s 초과)**
- 피드백 JSON 스키마(PLAN §7.2)는 `response_format: json_object`로 안정 반환 확인
- Whisper는 학습자의 문법 오류("like listen")를 교정 없이 그대로 전사함 → 교정 책임은 LLM에 있음 (의도대로)

### 확정된 기술 편차 (PLAN.md 대비)

| PLAN | 실제 | 사유 |
|---|---|---|
| expo-av | **expo-audio** | SDK 56에서 expo-av deprecated |
| NativeWind | **미정 (T6에서 ADR로 결정)** | RN 0.85/React 19.2 호환 미검증 — 스캐폴딩은 StyleSheet+토큰 |

---

## 1. 목표

Phase 1(MVP 핵심 루프)을 시작할 수 있는 **기반**을 완성한다:
녹음→재생이 실기기에서 동작하고, AI 파이프라인이 앱 코드로 모듈화되고, 콘텐츠 로딩·테스트·CI가 갖춰진 상태.

**비목표**: 레슨 3단계 실제 UI/로직(Phase 1), Supabase 연동 화면(로그인 UI는 Phase 1), 발음 점수.

---

## 2. 작업 목록 (T1~T7)

### T1. `packages/ai` 모듈화 — 스파이크를 클라이언트 라이브러리로

- `packages/ai/src/stt.ts` — `transcribe(audio: Blob|Uint8Array): Promise<string>`
- `packages/ai/src/tutor.ts` — `getTurnFeedback(transcript, context): Promise<TurnFeedback>` (shared의 `TurnFeedback` 타입 사용, 시스템 프롬프트는 `prompts/` 분리)
- `packages/ai/src/tts.ts` — `synthesize(text): Promise<ArrayBuffer>`
- API 키는 호출자 주입 (앱에 키 내장 금지 — 추후 Supabase Edge Function 프록시 전제, 주석으로 명시)
- **테스트**: fetch mock 단위 테스트 (성공/4xx/네트워크 오류/JSON 파싱 실패)
- **완료 기준**: `node --test packages/ai` 통과, spike가 새 모듈을 import하도록 리팩토링

### T2. 턴 지연 최적화 (5.5s → 체감 ≤4s)

- TTS `tts-1` 스트리밍 응답으로 첫 바이트 도달 시 재생 시작 (체감 지연 = STT+LLM+TTFB)
- LLM 응답 `max_tokens` 제한 + "max 2 sentences" 프롬프트 유지
- (측정 후 판단) drill 채점은 LLM 불필요 — 로컬 keyWords 매칭으로 0ms 처리
- **완료 기준**: spike 재실행 시 "재생 시작까지" 측정치 ≤4s, 결과를 계획서/ADR에 기록

### T3. 마이크 녹음/재생 POC (expo-audio)

- `apps/mobile`에 녹음 시작→정지→파일 재생 화면 (`/dev/audio-poc` 라우트, dev 전용)
- 권한 요청 + 거부 시 안내 UX 스텁
- **완료 기준**: iOS 시뮬레이터(또는 실기기)에서 녹음→재생 동작, wav/m4a 포맷이 Whisper 업로드 형식과 호환됨을 spike로 확인

### T4. Supabase 프로젝트 + Auth + 스키마

- Supabase 프로젝트 생성 (사용자 액션 필요 — 환경변수 `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`)
- Prisma 스키마: User, Course, Lesson, LessonSession, ConversationTurn, UserProgress (PLAN §8)
- RLS: 본인 row만 읽기/쓰기, Course/Lesson은 public read
- 이메일 Auth 연결 (Google/Apple OAuth는 Phase 1)
- Dev Mock Auth (ted_voca 패턴 참고) — Supabase 미설정 시에도 앱 구동
- **완료 기준**: `supabase/migrations/` 생성, 마이그레이션 적용, mock auth로 앱 부팅

### T5. 콘텐츠 파이프라인

- `content/*.json` → shared `Course` 타입 검증 스크립트 (`npm run validate:content`)
- 앱에서 시드 코스 로딩 (MVP: 번들 import, DB 시딩은 Phase 1)
- **테스트**: 스키마 위반 JSON이 CI에서 실패하는지
- **완료 기준**: 홈 화면 레슨 카드가 하드코딩 대신 content에서 로딩

### T6. 스타일링 전략 ADR

- NativeWind v4의 RN 0.85/React 19.2/SDK 56 호환성 검증 (별도 브랜치 POC)
- 결정: NativeWind 도입 or StyleSheet+토큰 유지 → `docs/adr/0001-styling.md`
- **완료 기준**: ADR 작성, 결정 사항이 CLAUDE.md에 반영

### T7. CI

- GitHub Actions: typecheck + lint + test (ai/shared 단위 테스트, content 검증)
- **완료 기준**: 로컬 `npm run ci` 스크립트로 동일 검사 실행 가능 (Actions는 remote 생성 후)

---

## 3. 순서·의존성

```
T1 (ai 모듈화) ─→ T2 (지연 최적화)
T3 (오디오 POC) ─→ (T1+T3 합류) Phase 1의 turn-based 대화
T4 (Supabase)   독립
T5 (콘텐츠)     독립
T6 (스타일 ADR) 독립
T7 (CI)         T1·T5 테스트가 생긴 뒤
```

권장 실행 순서: **T1 → T2 → T5 → T3 → T6 → T4 → T7**
(T3는 시뮬레이터 필요, T4는 사용자의 Supabase 프로젝트 생성 대기 가능성 — 블로킹 시 다음 과제 선진행)

## 4. 완료 정의 (Phase 0 Definition of Done)

- [ ] PLAN.md §10 Phase 0 체크리스트 전 항목 완료
- [ ] `npm run ci` 그린
- [ ] 시뮬레이터에서: 온보딩 → 홈(시드 콘텐츠) → 녹음 POC 동작
- [ ] spike 체감 지연 ≤4s 입증
- [ ] ADR 0001(스타일링) 기록
- [ ] 모든 커밋 메시지 한글, 푸시는 사용자 요청 시에만

## 5. 리스크

| 리스크 | 대응 |
|---|---|
| expo-audio 녹음 포맷이 Whisper와 비호환 | T3에서 즉시 검증, 필요 시 변환 (PLAN §13 연계) |
| NativeWind 비호환 | StyleSheet 유지로 폴백 (T6 ADR) |
| Supabase 프로젝트 미생성 (사용자 액션) | Mock Auth로 개발 지속, T4만 보류 |
| OPENAI_API_KEY 미설정 | `.env.example` 제공, ai 테스트는 mock이라 키 불필요 |
