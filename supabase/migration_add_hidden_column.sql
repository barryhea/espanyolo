-- Run this in Supabase SQL Editor before using the hide-word feature.
ALTER TABLE user_word_progress
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
