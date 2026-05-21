-- Add drag_match_score column to user_verb_progress
-- Tracks cumulative S1 drag-and-match completions per verb (0–5).
-- Kept separate from consecutive_correct, which is for S2/S3/S4 streak tracking.
-- Paste into Supabase SQL editor and run.

ALTER TABLE user_verb_progress
  ADD COLUMN IF NOT EXISTS drag_match_score INTEGER NOT NULL DEFAULT 0;
