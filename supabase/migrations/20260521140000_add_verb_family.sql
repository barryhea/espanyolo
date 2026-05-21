-- Add verb_family column to verbs table.
-- Values: 'regular-ar' | 'regular-er' | 'regular-ir' | 'irregular'

ALTER TABLE verbs
  ADD COLUMN IF NOT EXISTS verb_family TEXT
  CHECK (verb_family IN ('regular-ar', 'regular-er', 'regular-ir', 'irregular'));

-- ── Regular -ar ──────────────────────────────────────────────────────────────
UPDATE verbs SET verb_family = 'regular-ar' WHERE spanish_infinitive IN (
  'acabar',     -- finish/end
  'ayudar',     -- help
  'bajar',      -- go down
  'comprar',    -- buy
  'crear',      -- create
  'dejar',      -- let/leave
  'entrar',     -- enter
  'escuchar',   -- listen
  'esperar',    -- wait/hope
  'ganar',      -- win/earn
  'gustar',     -- like
  'hablar',     -- speak/talk
  'llamar',     -- call/name
  'llevar',     -- carry/wear
  'mirar',      -- look/watch
  'necesitar',  -- need
  'quedar',     -- stay/remain
  'resultar',   -- result/turn out
  'terminar',   -- finish
  'tomar',      -- take/drink
  'trabajar',   -- work
  'tratar',     -- try/treat
  'viajar'      -- travel
);

-- ── Regular -er ──────────────────────────────────────────────────────────────
UPDATE verbs SET verb_family = 'regular-er' WHERE spanish_infinitive IN (
  'beber',   -- drink
  'comer',   -- eat
  'correr',  -- run
  'deber'    -- should/must/owe
);

-- ── Regular -ir ──────────────────────────────────────────────────────────────
UPDATE verbs SET verb_family = 'regular-ir' WHERE spanish_infinitive IN (
  'permitir',  -- allow
  'recibir',   -- receive
  'subir'      -- go up/climb
);

-- ── Irregular ────────────────────────────────────────────────────────────────
-- Includes: stem-changers (e→ie, o→ue, e→i, u→ue), irregular yo forms,
-- spelling-change verbs (c→qu, g→gu), verbs with irregular past participles,
-- and completely irregular verbs.
UPDATE verbs SET verb_family = 'irregular' WHERE spanish_infinitive IN (
  'abrir',      -- pp: abierto
  'aparecer',   -- yo: aparezco
  'buscar',     -- c→qu spelling change (preterite)
  'cerrar',     -- e→ie stem change
  'conocer',    -- yo: conozco
  'conseguir',  -- e→i stem change + spelling change
  'creer',      -- y insertion in preterite (creyó, creyeron)
  'dar',        -- yo: doy; irregular preterite (di, diste…)
  'decir',      -- yo: digo; completely irregular
  'dormir',     -- o→ue/u stem change
  'encontrar',  -- o→ue stem change
  'entender',   -- e→ie stem change
  'escribir',   -- pp: escrito
  'estar',      -- yo: estoy; irregular preterite
  'haber',      -- completely irregular auxiliary
  'hacer',      -- yo: hago; preterite: hice
  'ir',         -- completely irregular
  'jugar',      -- u→ue stem change
  'llegar',     -- g→gu spelling change (preterite)
  'mantener',   -- like tener: yo: mantengo, e→ie
  'oír',        -- yo: oigo; spelling changes
  'pagar',      -- g→gu spelling change (preterite)
  'parecer',    -- yo: parezco
  'pedir',      -- e→i stem change
  'pensar',     -- e→ie stem change
  'perder',     -- e→ie stem change
  'poder',      -- o→ue stem change; preterite: pude
  'poner',      -- yo: pongo; preterite: puse
  'querer',     -- e→ie stem change; preterite: quise
  'recordar',   -- o→ue stem change
  'saber',      -- yo: sé; preterite: supe
  'sacar',      -- c→qu spelling change (preterite)
  'salir',      -- yo: salgo
  'sentir',     -- e→ie/i stem change
  'ser',        -- completely irregular
  'servir',     -- e→i stem change
  'tener',      -- yo: tengo; e→ie; preterite: tuve
  'traer',      -- yo: traigo; preterite: traje
  'venir',      -- yo: vengo; e→ie; preterite: vine
  'ver'         -- yo: veo; irregular preterite (vi, viste…)
);
