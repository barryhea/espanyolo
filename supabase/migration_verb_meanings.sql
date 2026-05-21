-- Add secondary and tertiary English meanings to verbs table.
-- Paste into Supabase SQL editor and run.

ALTER TABLE verbs ADD COLUMN IF NOT EXISTS english_alt1 TEXT;
ALTER TABLE verbs ADD COLUMN IF NOT EXISTS english_alt2 TEXT;

UPDATE verbs SET english_alt1 = 'make'     WHERE spanish_infinitive = 'hacer';
UPDATE verbs SET english_alt1 = 'can'      WHERE spanish_infinitive = 'poder';
UPDATE verbs SET english_alt1 = 'love'     WHERE spanish_infinitive = 'querer';
UPDATE verbs SET english_alt1 = 'tell'     WHERE spanish_infinitive = 'decir';
UPDATE verbs SET english_alt1 = 'talk'     WHERE spanish_infinitive = 'hablar';
UPDATE verbs SET english_alt1 = 'place'    WHERE spanish_infinitive = 'poner';
UPDATE verbs SET english_alt1 = 'remain'   WHERE spanish_infinitive = 'quedar';
UPDATE verbs SET english_alt1 = 'wear'     WHERE spanish_infinitive = 'llevar';
UPDATE verbs SET english_alt1 = 'let'      WHERE spanish_infinitive = 'dejar';
UPDATE verbs SET english_alt1 = 'drink'    WHERE spanish_infinitive = 'tomar';
UPDATE verbs SET english_alt1 = 'treat'    WHERE spanish_infinitive = 'tratar';
UPDATE verbs SET english_alt1 = 'watch'    WHERE spanish_infinitive = 'mirar';
UPDATE verbs SET english_alt1 = 'name'     WHERE spanish_infinitive = 'llamar';
UPDATE verbs SET english_alt1 = 'go out'   WHERE spanish_infinitive = 'salir';
UPDATE verbs SET english_alt1 = 'go in'    WHERE spanish_infinitive = 'entrar';
UPDATE verbs SET english_alt1 = 'look for' WHERE spanish_infinitive = 'buscar';
UPDATE verbs SET english_alt1 = 'climb'    WHERE spanish_infinitive = 'subir';
UPDATE verbs SET english_alt1 = 'descend'  WHERE spanish_infinitive = 'bajar';
UPDATE verbs SET english_alt1 = 'earn'     WHERE spanish_infinitive = 'ganar';
UPDATE verbs SET english_alt1 = 'must', english_alt2 = 'owe' WHERE spanish_infinitive = 'deber';
UPDATE verbs SET english_alt1 = 'hope'     WHERE spanish_infinitive = 'esperar';
UPDATE verbs SET english_alt1 = 'request'  WHERE spanish_infinitive = 'pedir';
UPDATE verbs SET english_alt1 = 'achieve'  WHERE spanish_infinitive = 'conseguir';
UPDATE verbs SET english_alt1 = 'extract'  WHERE spanish_infinitive = 'sacar';
UPDATE verbs SET english_alt1 = 'turn out' WHERE spanish_infinitive = 'resultar';
UPDATE verbs SET english_alt1 = 'end'      WHERE spanish_infinitive = 'acabar';
