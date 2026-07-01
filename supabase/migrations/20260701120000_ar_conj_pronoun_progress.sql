-- Persistent storage for AR tense conjugation per-pronoun progress.
--
-- These per-pronoun correct-counts currently live only in browser localStorage
-- (keys `verb-ar-cj-<userId>-<tense>-<subStage>` holding {yo,tu,el,nosotros,ellos}),
-- so they are lost across devices/browsers. This table gives them a durable home.
--
-- Grain: one row per (user, tense, sub_stage, pronoun) holding an integer
-- correct-count. It is user-level cohort progress (not per-verb), so it is a
-- dedicated table rather than a column on the per-verb user_verb_progress.
--
--   tense:     1 = Present, 2 = Past, 3 = Future           (maps to t1/t2/t3)
--   sub_stage: 1 = Multiple Choice, 2 = Pronoun, 3 = Full Conjugation
--              (Drag & Match is not persisted per-pronoun, so it is excluded)
--   pronoun:   yo | tu | el | nosotros | ellos             (no vosotros)
--
-- Graduation threshold is 5 correct per pronoun; the count is monotonic, so a
-- non-negative integer is sufficient. Follows the existing per-user table + RLS
-- convention used by user_settings and saved_quizzes.

CREATE TABLE IF NOT EXISTS user_verb_conjugation_progress (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tense         INTEGER     NOT NULL CHECK (tense IN (1, 2, 3)),
  sub_stage     INTEGER     NOT NULL CHECK (sub_stage IN (1, 2, 3)),
  pronoun       TEXT        NOT NULL CHECK (pronoun IN ('yo', 'tu', 'el', 'nosotros', 'ellos')),
  correct_count INTEGER     NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tense, sub_stage, pronoun)
);

-- Users can only access their own conjugation progress
ALTER TABLE user_verb_conjugation_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own conjugation progress"
  ON user_verb_conjugation_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conjugation progress"
  ON user_verb_conjugation_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conjugation progress"
  ON user_verb_conjugation_progress FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conjugation progress"
  ON user_verb_conjugation_progress FOR DELETE
  USING (auth.uid() = user_id);
