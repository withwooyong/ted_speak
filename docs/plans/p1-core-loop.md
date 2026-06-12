# P1 — MVP 핵심 루프 작업계획서

> Ted Speak (TalkTed) Phase 1 | 2026-06-12 작성
> 근거: PLAN.md §10 Phase 1, §4.2 레슨 3단계 / UX 스펙: `prototype/index.html`
> 파이프라인: /ted-run | 선행: p0-foundation (T3 기기 검증 제외 완료)

---

## 1. 목표

"온보딩 → 홈 → 레슨 3단계 → 완료 피드백"의 **전체 루프가 실기기에서 음성으로 동작**하는 상태.
HTML 프로토타입이 화면·동선·인터랙션의 스펙이다 (디자인 토큰 동일).

**비목표**: AI 튜터 탭(Phase 2), 발음 점수(Phase 2), 과금 UI(Phase 3), OAuth(아래 U11 참고).

## 2. 작업 목록

### U1. AI 클라이언트 신뢰성 (선행 — 모든 음성 기능의 기반)

- `packages/ai` 전 함수에 타임아웃(AbortSignal) + 지수 백오프 재시도(기본 2회) 옵션
  (근거: ADR-0003 — undici HeadersTimeout 스톨 실측 2회)
- 진행 중 요청 취소 지원 (레슨 이탈 시)
- **테스트**: 타임아웃 발생→재시도→성공, 재시도 소진→AiError, 취소 시 즉시 중단

### U2. 녹음 → STT 파이프라인 (T3 연장)

- `useRecorder()` 훅: expo-audio 녹음 + 30초 cap + 권한 거부 시 텍스트 입력 폴백 (PLAN §7.3, §13)
- 녹음 파일 → `transcribe()` 연결, 실패 시 재녹음 UX
- **완료 기준**: 실기기에서 녹음→전사 동작, 거부 상태에서 텍스트 폴백 동작

### U3. 온보딩 4단계 (스텁 → 실제)

- 목표/레벨/일일 목표 선택 + 마이크 권한 요청 화면 (프로토타입 동선 그대로)
- 선택값 → profiles 저장(supabase 모드) 또는 로컬(mock 모드)
- **완료 기준**: 신규 사용자 플로우 E2E, 권한 거부 시에도 홈 진입 가능

### U4. 레슨 Step 1 — Learn

- 핵심 표현 카드 + TTS 재생 (레슨 고정 문장은 `synthesize()` 사전 캐시 — ADR-0003)
- **완료 기준**: 오프라인 재진입 시 캐시 재생

### U5. 레슨 Step 2 — Drill

- 문장 제시 → 녹음 → `transcribe()` → `scoreDrill()` 로컬 채점 → 통과/재시도
- 실패 시 모범 발음 재생 + 누락 단어 하이라이트 (프로토타입 인터랙션)
- **완료 기준**: 통과 임계 80, 2회 실패 후에도 진행 가능(좌절 방지 — 프로토타입과 동일)

### U6. 레슨 Step 3 — Conversation

- `getTurnFeedback()` turn-based 대화 (targetTurns만큼), 교정 칩 inline 노출
- Ted 발화는 `synthesizeStream()` 스트리밍 재생 (모바일 스트리밍 재생 가능성 검증 —
  불가 시 ADR-0003 폴백: 문장 단위 분할 합성)
- conversation_turns 저장 (supabase 모드)
- **완료 기준**: 4턴 대화 완주, 턴 체감 지연 실기기 측정 기록

### U7. 완료 화면 + 진행 저장

- 피드백 요약(잘한 점/개선점 — 대화 corrections 집계), XP/streak 갱신
- lesson_sessions 상태 머신(in_progress→completed), user_progress 기록, 중단 지점 복원
- 소프트 제한: 일 1레슨 (홈 카드 완료 상태 — 프로토타입 동선)
- **완료 기준**: 앱 재시작 후 이어하기·완료 상태 유지

### U8. 로그인 UI (이메일) + Dev Mock 토글

- 이메일 가입/로그인 화면, mock 모드일 때 "개발용 로그인" 버튼
- **완료 기준**: 로컬 supabase로 가입→온보딩→레슨→진행 저장 E2E

### U9. 시드 콘텐츠 확장

- 일상 회화 코스 레슨 5~10개 (PLAN §10), `validate:content` 통과
- content JSON → seed.sql 생성 스크립트 (수동 동기화 제거 — P0 TODO)

### U10. E2E + 실기기 검증

- 핵심 플로우 Playwright(웹) + 시뮬레이터 수동 체크리스트
- 부록 A(Speak 벤치마크 체크리스트) 항목 검증

### U11. (보류 결정 필요) Google/Apple OAuth

- 개발자 계정·번들 ID 필요 — 사용자와 협의 후 착수

## 3. 순서·의존성

```
U1 → U2 → U5/U6 (음성 경로)        U3, U4, U9 독립
U7은 U5+U6 이후                    U8은 U3 이후
권장: U1 → U2 → U4 → U5 → U6 → U7 → U3 → U8 → U9 → U10
```

## 4. 완료 정의

- [ ] 실기기(iOS)에서 레슨 3단계를 음성으로 완주
- [ ] 한 레슨에서 말하기 10문장 이상 유도 (부록 A)
- [ ] 턴 체감 지연 실기기 중앙값 ≤4s (ADR-0003 기준 갱신)
- [ ] mock·supabase 양 모드에서 전체 루프 동작
- [ ] `npm run ci` 그린 유지, 신규 로직 커버리지 80%+
