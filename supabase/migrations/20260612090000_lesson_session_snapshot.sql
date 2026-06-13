-- U7 중단 지점 복원: 레슨 상태 머신 스냅샷 저장 컬럼
-- 클라이언트(lesson-core.ts toSnapshot)가 만든 직렬화 문자열을 불투명하게 보관한다.
-- text인 이유: 클라이언트만 해석하는 opaque 값이라 jsonb 인덱싱·질의가 불필요하고,
-- fromSnapshot이 손상 입력을 방어하므로 서버 측 구조 검증도 필요 없다.
-- 보안: lesson_sessions는 행 단위 RLS(본인만)로 보호되며 컬럼 grant 제한이 없는 테이블이므로
-- 별도 grant 변경 없음. 스냅샷에는 전사 텍스트가 포함될 수 있어 본인 외 접근 불가가 전제다.
alter table public.lesson_sessions add column snapshot text;
