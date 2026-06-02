-- Rename verb categories from Spanish to English display names.
-- Verbos -AR → Verbs -AR
-- Verbos -ER → Verbs -ER
-- Verbos -IR → Verbs -IR
-- Verbos Irregulares → Irregular Verbs

UPDATE verbs SET category = 'Verbs -AR'       WHERE category = 'Verbos -AR';
UPDATE verbs SET category = 'Verbs -ER'       WHERE category = 'Verbos -ER';
UPDATE verbs SET category = 'Verbs -IR'       WHERE category = 'Verbos -IR';
UPDATE verbs SET category = 'Irregular Verbs' WHERE category = 'Verbos Irregulares';
