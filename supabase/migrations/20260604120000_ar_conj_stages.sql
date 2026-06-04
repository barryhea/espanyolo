-- Add per-tense conjugation sub-stage tracking for the Verbs -AR 4-stage flow.
-- t{n}_cj_stage encodes which of the 4 sub-stages the user has completed:
--   0 = sub-stage 1 (drag & match) in progress
--   1 = sub-stage 2 (MC) in progress  (drag done)
--   2 = sub-stage 3 (typed conj→EN) in progress
--   3 = sub-stage 4 (typed EN→conj) in progress
--   4 = all 4 sub-stages done (tense mastered)
-- The existing t{n}_score column is repurposed as the score within the
-- current sub-stage for Verbs -AR verbs; other categories are unaffected.

ALTER TABLE user_verb_progress
  ADD COLUMN IF NOT EXISTS t1_cj_stage INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS t2_cj_stage INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS t3_cj_stage INTEGER NOT NULL DEFAULT 0;
