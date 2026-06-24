-- Track the last 10 quiz results per word as a jsonb array of 1s (correct) and 0s (incorrect).
ALTER TABLE user_word_progress ADD COLUMN IF NOT EXISTS recent_attempts JSONB NOT NULL DEFAULT '[]'::jsonb;
