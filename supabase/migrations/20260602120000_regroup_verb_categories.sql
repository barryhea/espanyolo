-- Regroup verb categories by verb family.
-- Old categories: Core Verbs, Everyday Verbs, Vivid & Interactive Verbs, Expressive & Emotional Verbs
-- New categories: Verbos -AR, Verbos -ER, Verbos -IR, Verbos Irregulares

UPDATE verbs SET category = 'Verbos -AR'         WHERE verb_family = 'regular-ar';
UPDATE verbs SET category = 'Verbos -ER'         WHERE verb_family = 'regular-er';
UPDATE verbs SET category = 'Verbos -IR'         WHERE verb_family = 'regular-ir';
UPDATE verbs SET category = 'Verbos Irregulares' WHERE verb_family = 'irregular';

-- Wipe all user progress — category restructure makes prior records meaningless.
DELETE FROM user_verb_progress;
