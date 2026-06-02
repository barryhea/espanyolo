-- Regroup all 70 verbs into new category structure by id.
-- Only the category column is updated.
-- Existing user progress is wiped as the restructure makes it invalid.

UPDATE verbs SET category = 'Verbs -AR'
  WHERE id IN (69, 41, 48, 33, 67, 20, 30, 44, 54, 50, 51, 13, 28, 19, 27, 53, 17, 66, 59, 24, 34, 26, 40);

UPDATE verbs SET category = 'Core Verbs'
  WHERE id IN (1, 2, 3, 5, 4, 6, 7, 8, 9, 12, 32, 31);

UPDATE verbs SET category = 'Stem-Changing O→UE'
  WHERE id IN (70, 43, 36, 55);

UPDATE verbs SET category = 'Stem-Changing E→IE'
  WHERE id IN (39, 56, 22, 49, 25);

UPDATE verbs SET category = 'Stem-Changing E→I'
  WHERE id IN (63, 57, 62);

UPDATE verbs SET category = 'Spelling Change'
  WHERE id IN (42, 14, 45, 64);

UPDATE verbs SET category = '-Go Verbs'
  WHERE id IN (65, 15, 29, 46, 21);

UPDATE verbs SET category = 'Regular -ER/-IR'
  WHERE id IN (37, 52, 60, 58, 47);

UPDATE verbs SET category = 'True Irregulars'
  WHERE id IN (38, 61, 23, 18, 11, 35, 68, 16, 10);

-- Wipe all user progress — category restructure makes prior records meaningless.
DELETE FROM user_verb_progress;
