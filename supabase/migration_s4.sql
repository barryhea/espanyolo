-- Add s4_score column to user_verb_progress
-- Paste into Supabase SQL editor and run.

ALTER TABLE user_verb_progress
  ADD COLUMN IF NOT EXISTS s4_score INTEGER NOT NULL DEFAULT 0;
