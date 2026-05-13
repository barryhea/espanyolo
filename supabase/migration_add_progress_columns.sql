-- Run this in Supabase SQL Editor before using the quiz feature.
ALTER TABLE user_word_progress
  ADD COLUMN IF NOT EXISTS stage               INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS consecutive_correct INT NOT NULL DEFAULT 0;
