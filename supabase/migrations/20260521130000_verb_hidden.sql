-- Add hidden flag to user_verb_progress so verbs can be hidden from sessions.
ALTER TABLE user_verb_progress ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
