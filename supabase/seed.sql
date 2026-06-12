-- 시드 콘텐츠 — content/courses/daily-conversation.json과 동기 유지
-- TODO(P1): content JSON → seed SQL 생성 스크립트로 자동화

insert into public.courses (id, title, level, "order", description) values
  ('course-daily-001', '일상 회화 첫걸음', 'A2', 1, '인사, 자기소개, 취미 — 매일 쓰는 표현부터 입을 풀어요.');

insert into public.lessons (id, course_id, "order", title, title_en, estimated_minutes, key_phrases, drills, conversation) values
  (
    'lesson-003',
    'course-daily-001',
    3,
    '취미 말하기',
    'Talking about what you love',
    5,
    '[
      {"en": "I''m really into hiking.", "ko": "저는 등산에 푹 빠져 있어요."},
      {"en": "In my free time, I like listening to music.", "ko": "여가 시간에는 음악 듣는 걸 좋아해요."},
      {"en": "How about you?", "ko": "당신은 어때요? — 대화를 이어가는 마법의 한마디"}
    ]'::jsonb,
    '[
      {"text": "I''m really into hiking.", "ko": "저는 등산에 푹 빠져 있어요.", "keyWords": ["really", "into", "hiking"]},
      {"text": "How about you?", "ko": "당신은 어때요?", "keyWords": ["how", "about", "you"]},
      {"text": "I like listening to music.", "ko": "저는 음악 듣는 걸 좋아해요.", "keyWords": ["like", "listening", "music"]}
    ]'::jsonb,
    '{
      "topic": "The user just learned hobby expressions. Ask about their hobbies and free time.",
      "openingLine": "Hi! Great drills today. So, what are you into these days?",
      "targetTurns": 4,
      "hints": ["요즘 빠져 있는 취미를 말해보세요 — I''m really into ...", "다른 취미도 말해보세요 — I like ..."]
    }'::jsonb
  );
