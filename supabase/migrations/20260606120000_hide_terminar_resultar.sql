-- Hide 'terminar' (id 59) and 'resultar' (id 66) for user barryhea@gmail.com.
-- Uses ON CONFLICT so it works whether or not a progress row already exists.
INSERT INTO user_verb_progress (user_id, verb_id, hidden)
VALUES
  ('327c9b59-1f76-4afc-aa8b-d75f9671cb6f', 59, true),
  ('327c9b59-1f76-4afc-aa8b-d75f9671cb6f', 66, true)
ON CONFLICT (user_id, verb_id) DO UPDATE SET hidden = true;
