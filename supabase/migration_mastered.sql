-- Run this in Supabase SQL Editor.

-- 1. Remove duplicate rows per user/word, keeping the most advanced.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, word_id
           ORDER BY stage DESC, consecutive_correct DESC
         ) AS rn
  FROM user_word_progress
)
DELETE FROM user_word_progress
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Add mastered flag.
ALTER TABLE user_word_progress
  ADD COLUMN IF NOT EXISTS mastered BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Add unique constraint so upserts work correctly instead of inserting duplicates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_word_progress_user_word_unique'
  ) THEN
    ALTER TABLE user_word_progress
      ADD CONSTRAINT user_word_progress_user_word_unique UNIQUE (user_id, word_id);
  END IF;
END $$;
