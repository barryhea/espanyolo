-- Run this in Supabase SQL Editor.
ALTER TABLE user_word_progress
  ADD COLUMN IF NOT EXISTS polish_correct   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS polish_incorrect INT NOT NULL DEFAULT 0;
