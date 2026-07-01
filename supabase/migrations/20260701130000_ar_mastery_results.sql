-- Persistent storage for AR Mastery quiz session results.
--
-- The Mastery quiz is a practice quiz that does NOT change tense progression;
-- it only records results so a future overview screen can analyse weakness by
-- tense and by pronoun. We keep the 5 most recent sessions per user.
--
-- Shape choice: a per-user single row (PK = user_id, like user_settings) holding
-- a JSONB array capped at 5. This matches the existing "keep the last N results"
-- convention (user_word_progress.recent_attempts is a capped JSONB array), keeps
-- each session's rich nested breakdown as a natural JSONB payload (like
-- saved_quizzes.configuration), and lets the overview read one row and aggregate
-- the <=5 sessions client-side. The <=5 cap is enforced by a CHECK; retention is
-- a simple array trim on write (no trigger needed).
--
-- Each element of recent_sessions is one Mastery quiz session:
--   {
--     "at":      "<ISO-8601 timestamp>",
--     "correct": <int>, "total": <int>,                     -- overall score
--     "tense":   { "1": { "correct": <int>, "incorrect": <int> },   -- 1 = Present
--                  "2": { "correct": <int>, "incorrect": <int> },   -- 2 = Past
--                  "3": { "correct": <int>, "incorrect": <int> } }, -- 3 = Future
--     "pronoun": { "yo":       { "correct": <int>, "incorrect": <int> },
--                  "tu":       { "correct": <int>, "incorrect": <int> },
--                  "el":       { "correct": <int>, "incorrect": <int> },
--                  "nosotros": { "correct": <int>, "incorrect": <int> },
--                  "ellos":    { "correct": <int>, "incorrect": <int> } }
--   }
-- The array holds at most the 5 most recent sessions (writer trims on insert).

CREATE TABLE IF NOT EXISTS user_verb_mastery_results (
  user_id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  recent_sessions JSONB       NOT NULL DEFAULT '[]'::jsonb
                              CHECK (jsonb_typeof(recent_sessions) = 'array'
                                     AND jsonb_array_length(recent_sessions) <= 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users can only access their own Mastery quiz results
ALTER TABLE user_verb_mastery_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own mastery results"
  ON user_verb_mastery_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own mastery results"
  ON user_verb_mastery_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mastery results"
  ON user_verb_mastery_results FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mastery results"
  ON user_verb_mastery_results FOR DELETE
  USING (auth.uid() = user_id);
