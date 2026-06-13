-- 이 파일은 generated 파일입니다 — 직접 편집하지 마세요.
-- 생성: npm run generate:seed (scripts/generate-seed.mts)
-- 출처: content/*.json (CourseSchema 검증 후 buildSeedSql로 직렬화)
-- 멱등(on conflict do update) upsert이므로 supabase db reset에 안전합니다.

insert into public.courses (id, title, level, description, "order") values
  ('course-daily-001', '일상 회화 첫걸음', 'A2', '인사, 자기소개, 취미 — 매일 쓰는 표현부터 입을 풀어요.', 1)
on conflict (id) do update set
  title = excluded.title,
  level = excluded.level,
  description = excluded.description;

insert into public.lessons (id, course_id, title, title_en, estimated_minutes, key_phrases, drills, conversation, "order") values
  (
    'lesson-001',
    'course-daily-001',
    '인사와 자기소개',
    'Hi, I''m ...',
    5,
    '[{"en":"Hi, I''m Minji. Nice to meet you.","ko":"안녕하세요, 저는 민지예요. 만나서 반가워요."},{"en":"I''m from Seoul.","ko":"저는 서울에서 왔어요."},{"en":"What''s your name?","ko":"이름이 어떻게 되세요?"}]'::jsonb,
    '[{"text":"Nice to meet you.","ko":"만나서 반가워요.","keyWords":["nice","meet","you"]},{"text":"I''m from Seoul.","ko":"저는 서울에서 왔어요.","keyWords":["from","Seoul"]},{"text":"What''s your name?","ko":"이름이 어떻게 되세요?","keyWords":["what","your","name"]}]'::jsonb,
    '{"topic":"First-time introductions. Greet the user, ask their name and where they''re from. Keep it warm and simple (A1~A2).","openingLine":"Hi there! It''s so nice to meet you. I''m Alex. What''s your name?","targetTurns":3,"hints":["이름을 말해보세요 — Hi, I''m ...","어디서 왔는지 말해보세요 — I''m from ...","상대에게 되물어보세요 — How about you?"]}'::jsonb,
    1
  ),
  (
    'lesson-002',
    'course-daily-001',
    '음식 주문하기',
    'Ordering food',
    6,
    '[{"en":"Can I have a coffee, please?","ko":"커피 한 잔 주시겠어요?"},{"en":"I''d like the chicken sandwich.","ko":"치킨 샌드위치로 할게요."},{"en":"How much is it?","ko":"얼마예요?"}]'::jsonb,
    '[{"text":"Can I have a coffee, please?","ko":"커피 한 잔 주시겠어요?","keyWords":["can","have","coffee"]},{"text":"I''d like the chicken sandwich.","ko":"치킨 샌드위치로 할게요.","keyWords":["like","chicken","sandwich"]},{"text":"How much is it?","ko":"얼마예요?","keyWords":["how","much"]}]'::jsonb,
    '{"topic":"The user is a customer at a cafe. Play a friendly server taking their order. Ask what they''d like and confirm the order.","openingLine":"Hi, welcome in! What can I get for you today?","targetTurns":4,"hints":["주문해보세요 — Can I have ... / I''d like ...","가격을 물어보세요 — How much is it?","고맙다고 말해보세요 — Thank you!"]}'::jsonb,
    2
  ),
  (
    'lesson-003',
    'course-daily-001',
    '취미 말하기',
    'Talking about what you love',
    5,
    '[{"en":"I''m really into hiking.","ko":"저는 등산에 푹 빠져 있어요."},{"en":"In my free time, I like listening to music.","ko":"여가 시간에는 음악 듣는 걸 좋아해요."},{"en":"How about you?","ko":"당신은 어때요? — 대화를 이어가는 마법의 한마디"}]'::jsonb,
    '[{"text":"I''m really into hiking.","ko":"저는 등산에 푹 빠져 있어요.","keyWords":["really","into","hiking"]},{"text":"How about you?","ko":"당신은 어때요?","keyWords":["how","about","you"]},{"text":"I like listening to music.","ko":"저는 음악 듣는 걸 좋아해요.","keyWords":["like","listening","music"]}]'::jsonb,
    '{"topic":"The user just learned hobby expressions. Ask about their hobbies and free time. Encourage them to use ''really into'' and ''I like ~ing''.","openingLine":"Hi! Great drills today. So, what are you into these days?","targetTurns":4,"hints":["요즘 빠져 있는 취미를 말해보세요 — I''m really into ...","다른 취미도 말해보세요 — I like ..."]}'::jsonb,
    3
  ),
  (
    'lesson-004',
    'course-daily-001',
    '길 묻기',
    'Asking for directions',
    6,
    '[{"en":"Excuse me, where is the station?","ko":"실례합니다, 역이 어디에 있나요?"},{"en":"How do I get to the museum?","ko":"박물관에 어떻게 가나요?"},{"en":"Is it far from here?","ko":"여기서 먼가요?"}]'::jsonb,
    '[{"text":"Where is the station?","ko":"역이 어디에 있나요?","keyWords":["where","station"]},{"text":"How do I get to the museum?","ko":"박물관에 어떻게 가나요?","keyWords":["how","get","museum"]},{"text":"Is it far from here?","ko":"여기서 먼가요?","keyWords":["far","here"]}]'::jsonb,
    '{"topic":"The user is lost in a city and asking a local for directions. Give simple directions and ask if they need more help.","openingLine":"You look a little lost! Are you trying to find somewhere?","targetTurns":4,"hints":["장소를 물어보세요 — Where is ... / How do I get to ...","거리를 확인하세요 — Is it far from here?","고맙다고 인사하세요 — Thanks for your help!"]}'::jsonb,
    4
  ),
  (
    'lesson-005',
    'course-daily-001',
    '주말 계획 말하기',
    'Weekend plans',
    6,
    '[{"en":"This weekend, I''m going to visit my family.","ko":"이번 주말에 가족을 보러 갈 거예요."},{"en":"Do you have any plans?","ko":"무슨 계획 있어요?"},{"en":"Maybe we can hang out together.","ko":"같이 놀면 좋을 것 같아요."}]'::jsonb,
    '[{"text":"I''m going to visit my family.","ko":"가족을 보러 갈 거예요.","keyWords":["going","visit","family"]},{"text":"Do you have any plans?","ko":"무슨 계획 있어요?","keyWords":["have","any","plans"]},{"text":"Maybe we can hang out together.","ko":"같이 놀면 좋을 것 같아요.","keyWords":["hang","out","together"]}]'::jsonb,
    '{"topic":"It''s Friday. Chat with the user about their weekend plans and share simple plans of your own.","openingLine":"It''s almost the weekend! Do you have any fun plans?","targetTurns":4,"hints":["계획을 말해보세요 — This weekend, I''m going to ...","상대의 계획을 물어보세요 — Do you have any plans?","함께 하자고 제안해보세요 — Maybe we can ..."]}'::jsonb,
    5
  ),
  (
    'lesson-006',
    'course-daily-001',
    '날씨로 스몰토크',
    'Weather small talk',
    5,
    '[{"en":"It''s such a nice day today.","ko":"오늘 날씨 정말 좋네요."},{"en":"It looks like it''s going to rain.","ko":"비가 올 것 같아요."},{"en":"I love this kind of weather.","ko":"저는 이런 날씨를 좋아해요."}]'::jsonb,
    '[{"text":"It''s such a nice day today.","ko":"오늘 날씨 정말 좋네요.","keyWords":["nice","day","today"]},{"text":"It looks like it''s going to rain.","ko":"비가 올 것 같아요.","keyWords":["looks","going","rain"]},{"text":"I love this kind of weather.","ko":"저는 이런 날씨를 좋아해요.","keyWords":["love","weather"]}]'::jsonb,
    '{"topic":"Make light small talk about the weather, the way strangers chat while waiting. Comment on the weather and ask what the user prefers.","openingLine":"Wow, can you believe this weather? It''s so lovely out today!","targetTurns":3,"hints":["날씨를 말해보세요 — It''s such a nice day. / It looks like rain.","좋아하는 날씨를 말해보세요 — I love this kind of weather."]}'::jsonb,
    6
  )
on conflict (id) do update set
  course_id = excluded.course_id,
  title = excluded.title,
  title_en = excluded.title_en,
  estimated_minutes = excluded.estimated_minutes,
  key_phrases = excluded.key_phrases,
  drills = excluded.drills,
  conversation = excluded.conversation;
