-- Add T1/T2/T3 tense-stage progress columns to user_verb_progress.
-- t1 = Present Tense, t2 = Past Tense, t3 = Future Tense.
-- Each column tracks correct-answer count per verb; mastery at 3.

ALTER TABLE user_verb_progress
  ADD COLUMN IF NOT EXISTS t1_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS t2_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS t3_score INTEGER NOT NULL DEFAULT 0;
