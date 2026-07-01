-- Persistent storage for AR "Match Tree" practice results (Mastery Stage 1).
--
-- Match Tree is a practice-only drag/tap quiz: one question per subject pronoun,
-- placing a single verb's Past/Present/Future forms into tense slots. It never
-- modifies tense progression; it only records results here (in Supabase, not
-- localStorage), consistent with the rest of the conjugation data.
--
-- Same shape as user_verb_mastery_results: one row per user, a recent_sessions
-- JSONB array capped at 5 (newest first). Each element is one completed session:
--   {
--     "at": "<ISO-8601 timestamp>",
--     "correct": <int>, "total": <int>,                     -- fully-correct questions / total
--     "tense":   { "past": {c,i}, "present": {c,i}, "future": {c,i} },   -- per-slot placement tallies
--     "pronoun": { "yo": {c,i}, "tu": {c,i}, "el": {c,i}, "nosotros": {c,i}, "ellos": {c,i} }
--   }

CREATE TABLE IF NOT EXISTS user_verb_match_tree_results (
  user_id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  recent_sessions JSONB       NOT NULL DEFAULT '[]'::jsonb
                              CHECK (jsonb_typeof(recent_sessions) = 'array'
                                     AND jsonb_array_length(recent_sessions) <= 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users can only access their own Match Tree results
ALTER TABLE user_verb_match_tree_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own match tree results"
  ON user_verb_match_tree_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own match tree results"
  ON user_verb_match_tree_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own match tree results"
  ON user_verb_match_tree_results FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own match tree results"
  ON user_verb_match_tree_results FOR DELETE
  USING (auth.uid() = user_id);
