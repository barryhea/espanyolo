-- Rename stage score columns in user_verb_progress from S-prefix to L-prefix.
-- Columns s1_score, s2_score, s3_score do not exist in this schema (not applicable).
-- Only s4_score exists and is renamed here.
-- Paste into Supabase SQL editor and run.

ALTER TABLE user_verb_progress
  RENAME COLUMN s4_score TO l4_score;
