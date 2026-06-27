-- Create user_settings table for per-user app preferences.
-- One row per user, keyed by auth.users id.
-- vocab_question_count: configurable number of questions per vocab quiz session (1-100).

CREATE TABLE IF NOT EXISTS user_settings (
  user_id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  vocab_question_count INTEGER     NOT NULL DEFAULT 5 CHECK (vocab_question_count BETWEEN 1 AND 100),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users can only access their own settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);
