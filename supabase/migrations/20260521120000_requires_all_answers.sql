-- Add requires_all_answers flag to verbs table.
-- When true, L3 shows multiple input fields — one per slash-separated meaning.

ALTER TABLE verbs ADD COLUMN IF NOT EXISTS requires_all_answers BOOLEAN NOT NULL DEFAULT false;

UPDATE verbs
SET requires_all_answers = true
WHERE spanish_infinitive IN (
  'hacer', 'poder', 'querer', 'decir', 'hablar',
  'llevar', 'tomar', 'tratar', 'llamar', 'salir',
  'esperar', 'conseguir', 'deber'
);
