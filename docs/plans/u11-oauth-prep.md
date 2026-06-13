# U11 — Google/Apple OAuth 설계·준비 문서

> Ted Speak (TalkTed) | 2026-06-13 작성 (세션 4 협의 결과)
> 상태: **준비 단계** — 구현은 아래 전제 충족 후 별도 /ted-run (보안 민감)
> 협의 결과: 이번 세션은 설계·준비만. Apple Developer Program은 **구매 예정** (아직 없음).

## 1. 왜 지금 구현하지 않는가

| 전제 | 상태 | 비고 |
|---|---|---|
| Apple Developer Program ($99/년) | ❌ 구매 예정 | App Store 정책: 제3자 소셜 로그인 제공 시 **Apple 로그인 필수** — Google만 먼저 넣을 수 없다 |
| 호스팅 Supabase 프로젝트 | ❌ 미연결 | OAuth redirect URL·provider 설정이 호스팅 대시보드 필요 (로컬 스택으로는 E2E 불가) |
| 번들 ID 확정 | ❌ 미정 | Apple Service ID·Google OAuth 클라이언트가 번들 ID에 묶인다 — 변경 시 재발급 |
| EAS dev build | ❌ Expo Go만 사용 중 | Google 네이티브 로그인은 Expo Go에서 동작하지 않음 (네이티브 모듈) |

MVP 검증은 이메일 + Dev Mock으로 충분하다 (P1 완료). OAuth는 **TestFlight 배포 준비 시점**에
착수하는 것이 재작업이 없다.

## 2. 확정 설계

### 인증 흐름 — 네이티브 ID 토큰 방식 (확정)

웹 리다이렉트(`signInWithOAuth` + 딥링크) 대신 **네이티브 SDK로 ID 토큰을 받아
`supabase.auth.signInWithIdToken()`으로 교환**한다.

- Apple: `expo-apple-authentication` → identityToken → `signInWithIdToken({ provider: 'apple', token })`
- Google: `@react-native-google-signin/google-signin` → idToken → `signInWithIdToken({ provider: 'google', token })`

근거: ① 인앱 네이티브 시트 UX (브라우저 왕복 없음 — Speak도 동일) ② 딥링크 세션 탈취 표면 제거
③ 기존 auth-core의 `setSession` 경로를 그대로 탄다 — onAuthStateChange 구독·profiles 생성 트리거·
P1.5 하이드레이트가 전부 재사용되고 분기 추가가 없다.

### 기존 구조와의 접점 (구현 시 변경 범위)

- `app/login.tsx`: 소셜 버튼 2개 추가 (이메일 폼 유지). Apple 버튼은 iOS에서만 노출.
- `stores/auth.ts`: `signInWithApple()` / `signInWithGoogle()` 추가 — 토큰 교환 후엔 기존
  onAuthStateChange 경로라 auth-core 변경 없음.
- 신규 사용자 판별·온보딩 라우팅: 변경 없음 — handle_new_user 트리거 + onboarded_at 하이드레이트가 처리.
- 스키마·RLS: **변경 없음** (provider 무관하게 auth.users 행은 동일).

### 보안 결정 (구현 시 ADR로 승격)

- nonce: Apple/Google 네이티브 플로우 모두 nonce 검증 사용 (라이브러리 기본 지원 확인 후 활성).
- 토큰은 메모리에서 즉시 교환·폐기 — 로깅 금지, AsyncStorage 저장 금지.
- 계정 연결(같은 이메일의 이메일 가입자가 소셜 로그인): Supabase 기본 동작(자동 link) 확인 후
  명시 정책 결정 — 구현 시 결정 항목.

## 3. 사용자 준비 절차 (코드 착수 전 완료할 것)

### 3.1 번들 ID 확정 (선행 — 모든 것이 여기 묶임)

제안: `com.withwooyong.talkted` (역도메인 + 앱명). 결정 후 `apps/mobile/app.json`의
`ios.bundleIdentifier`·`android.package`에 고정.

### 3.2 Apple (구매 후)

1. https://developer.apple.com/programs/enroll — 개인 계정으로 등록 ($99/년, 승인 1~2일)
2. Certificates, Identifiers & Profiles → Identifiers → App ID 등록 (위 번들 ID),
   **Sign In with Apple** capability 체크
3. Supabase 대시보드 → Authentication → Providers → Apple 활성화
   (네이티브 플로우는 번들 ID를 client ID로 사용 — Service ID는 웹 플로우 도입 시에만)

### 3.3 Google

1. Google Cloud Console → 프로젝트 생성 → OAuth 동의 화면 구성 (외부, 앱명 TalkTed)
2. 사용자 인증 정보 → OAuth 클라이언트 ID 생성: **iOS** (번들 ID), **Web** (Supabase 교환용)
3. Supabase 대시보드 → Providers → Google 활성화, Web 클라이언트 ID/Secret 입력 +
   iOS 클라이언트 ID를 Authorized Client IDs에 추가

### 3.4 빌드 환경

1. 호스팅 Supabase 프로젝트 생성 → `supabase link` → `supabase db push` (마이그레이션 3건)
2. `eas build --profile development --platform ios` — Google 네이티브 모듈 포함 dev build
   (Expo Go 검증 불가 — 이 시점부터 dev build가 기본 개발 루프)

## 4. 착수 조건 (Definition of Ready)

- [ ] Apple Developer Program 승인 완료
- [ ] 번들 ID 확정·app.json 반영
- [ ] 호스팅 Supabase 연결 (link + push)
- [ ] Google Cloud OAuth 클라이언트 2종 발급
- [ ] EAS dev build 1회 성공

충족 시: 본 문서 §2 설계로 작업계획서(체크리스트→테스트→구현) 작성 후 `/ted-run` (보안 민감) 착수.
