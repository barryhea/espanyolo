-- Create saved_quizzes table for persisting user-defined quiz configurations.
-- quiz_type: 'vocab' | 'verb'
-- configuration: jsonb storing selected words/verbs and levels

CREATE TABLE IF NOT EXISTS saved_quizzes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  quiz_type    TEXT        NOT NULL CHECK (quiz_type IN ('vocab', 'verb')),
  configuration JSONB      NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users can only access their own saved quizzes
ALTER TABLE saved_quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own saved quizzes"
  ON saved_quizzes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved quizzes"
  ON saved_quizzes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved quizzes"
  ON saved_quizzes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved quizzes"
  ON saved_quizzes FOR DELETE
  USING (auth.uid() = user_id);
