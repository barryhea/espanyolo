# ARCHITECTURE.md — Espanyolo Supabase Schema

> Generated from `supabase/migrations/` and `src/` source files.
> Update this file whenever a schema change is made or a component's data access changes.

---

## Tables

- [profiles](#profiles)
- [words](#words)
- [user\_word\_progress](#user_word_progress)
- [verbs](#verbs)
- [user\_verb\_progress](#user_verb_progress)
- [saved\_quizzes](#saved_quizzes)

---

## `profiles`

Stores one row per authenticated user. Created on first login via `AuthCallback.jsx` or implicitly on first quiz load via `Quiz.jsx` / `VerbQuiz.jsx`.

**Unique constraint:** `id`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | — | Primary key; equals `auth.users.id` |
| `email` | TEXT | — | User's email address |
| `full_name` | TEXT | NULL | From `user_metadata.full_name` at login |
| `avatar_url` | TEXT | NULL | From `user_metadata.avatar_url` at login |

### Column access

| Column | Read by | Written by |
|--------|---------|------------|
| `id` | `AuthCallback.jsx` | `AuthCallback.jsx`, `Quiz.jsx`, `VerbQuiz.jsx` |
| `email` | — | `AuthCallback.jsx`, `Quiz.jsx`, `VerbQuiz.jsx` |
| `full_name` | — | `AuthCallback.jsx` |
| `avatar_url` | — | `AuthCallback.jsx` |

**Notes:**
- `AuthCallback.jsx` does a `select('id')` existence check then `insert` on first login.
- `Quiz.jsx` and `VerbQuiz.jsx` call `upsert({ id, email }, { onConflict: 'id' })` as a guard on every quiz load — they do not read from `profiles`.

---

## `words`

Static vocabulary content table. No component writes to it; all rows are seeded via migrations or Supabase Studio.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER | — | Primary key |
| `english` | TEXT | — | English translation |
| `spanish` | TEXT | — | Spanish word |
| `theme` | TEXT | — | Vocab theme title (matches `VOCAB_THEMES[].title` in `courseData.js`) |
| `phonetic` | TEXT | NULL | Phonetic pronunciation hint (added in `20260530120000`; not yet read by any component) |

### Column access

| Column | Read by | Written by |
|--------|---------|------------|
| `id` | `Dashboard.jsx`, `Quiz.jsx`, `CustomQuiz.jsx`, `Dictionary.jsx`, `HiddenWords.jsx` (join), `Polish.jsx` (join) | — |
| `english` | `Quiz.jsx`, `CustomQuiz.jsx`, `Dictionary.jsx`, `HiddenWords.jsx` (join), `Polish.jsx` (join) | — |
| `spanish` | `Quiz.jsx`, `CustomQuiz.jsx`, `Dictionary.jsx`, `HiddenWords.jsx` (join), `Polish.jsx` (join) | — |
| `theme` | `Dashboard.jsx`, `Quiz.jsx`, `Dictionary.jsx`, `HiddenWords.jsx` (join) | — |
| `phonetic` | *(unused)* | — |

**Notes:**
- `HiddenWords.jsx` and `Polish.jsx` access word content via a Supabase relational join from `user_word_progress`: `.select('id, word_id, words(english, spanish, theme)')`.
- `phonetic` was added in migration `20260530120000` but is not yet selected in any component.

---

## `user_word_progress`

Tracks each user's learning progress for each vocabulary word. One row per `(user_id, word_id)` pair.

**Unique constraint:** `(user_id, word_id)`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER | — | Primary key |
| `user_id` | UUID | — | FK → `auth.users.id` |
| `word_id` | INTEGER | — | FK → `words.id` |
| `stage` | INTEGER | 1 | Current learning stage: 1 = MC, 2 = typed EN, 3 = typed ES |
| `consecutive_correct` | INTEGER | 0 | Correct answers in a row in the current stage |
| `hidden` | BOOLEAN | false | Whether the word is snoozed from quiz sessions |
| `mastered` | BOOLEAN | false | Set true when S3 reaches 5 consecutive correct |
| `polish_correct` | INTEGER | 0 | Correct answers in Polish mode (not in migrations — legacy column) |
| `polish_incorrect` | INTEGER | 0 | Incorrect answers in Polish mode (not in migrations — legacy column) |
| `s1_incorrect` | INTEGER | 0 | Total incorrect answers at stage 1 (added `20260605120000`) |
| `s2_incorrect` | INTEGER | 0 | Total incorrect answers at stage 2 (added `20260605120000`) |
| `s3_incorrect` | INTEGER | 0 | Total incorrect answers at stage 3 (added `20260605120000`) |
| `s1_resets` | INTEGER | 0 | Number of times stage 1 was reset (added `20260605120000`) |
| `s2_resets` | INTEGER | 0 | Number of times stage 2 was reset (added `20260605120000`) |
| `s3_resets` | INTEGER | 0 | Number of times stage 3 was reset (added `20260605120000`) |
| `total_incorrect` | INTEGER | 0 | Total incorrect answers across all stages (added `20260605120000`) |

### Column access

| Column | Read by | Written by |
|--------|---------|------------|
| `id` | `Quiz.jsx`, `CustomQuiz.jsx`, `Dashboard.jsx`, `Dictionary.jsx`, `Polish.jsx` | — |
| `user_id` | — | `Quiz.jsx`, `CustomQuiz.jsx`, `Dashboard.jsx`, `Dictionary.jsx` |
| `word_id` | `Quiz.jsx`, `CustomQuiz.jsx`, `Dashboard.jsx`, `Dictionary.jsx`, `HiddenWords.jsx`, `Polish.jsx` | `Quiz.jsx`, `CustomQuiz.jsx`, `Dashboard.jsx`, `Dictionary.jsx` |
| `stage` | `Quiz.jsx`, `CustomQuiz.jsx`, `Dashboard.jsx`, `Dictionary.jsx` | `Quiz.jsx`, `CustomQuiz.jsx`, `Dashboard.jsx` |
| `consecutive_correct` | `Quiz.jsx`, `CustomQuiz.jsx`, `Dashboard.jsx`, `Dictionary.jsx` | `Quiz.jsx`, `CustomQuiz.jsx` |
| `hidden` | `Quiz.jsx`, `CustomQuiz.jsx`, `Dashboard.jsx`, `Dictionary.jsx`, `HiddenWords.jsx` | `Quiz.jsx`, `CustomQuiz.jsx`, `Dashboard.jsx`, `Dictionary.jsx`, `HiddenWords.jsx` |
| `mastered` | `Quiz.jsx`, `CustomQuiz.jsx`, `Dashboard.jsx`, `Dictionary.jsx` | `Quiz.jsx`, `CustomQuiz.jsx` |
| `polish_correct` | `Polish.jsx` | `Polish.jsx` |
| `polish_incorrect` | `Polish.jsx` | `Polish.jsx` |
| `s1_incorrect` | `Quiz.jsx` | `Quiz.jsx` |
| `s2_incorrect` | `Quiz.jsx` | `Quiz.jsx` |
| `s3_incorrect` | `Quiz.jsx` | `Quiz.jsx` |
| `s1_resets` | `Quiz.jsx` | `Quiz.jsx` |
| `s2_resets` | `Quiz.jsx` | `Quiz.jsx` |
| `s3_resets` | `Quiz.jsx` | `Quiz.jsx` |
| `total_incorrect` | `Quiz.jsx` | `Quiz.jsx` |

**Notes:**
- `Dashboard.jsx` reads `hidden` to filter the word list and writes it when the user toggles hide from the quiz selector panel.
- `HiddenWords.jsx` sets `hidden = false` (unhide only) via `.update({ hidden: false })`.
- `polish_correct` / `polish_incorrect` are not in any migration file — they pre-exist in the original schema.

---

## `verbs`

Static verb content table. No component writes to it; all rows and schema changes are managed via migrations.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER | — | Primary key |
| `spanish_infinitive` | TEXT | — | Infinitive form (e.g. `hablar`) |
| `english` | TEXT | — | Primary English translation |
| `english_alt1` | TEXT | NULL | Alternate English meaning 1 (pre-migration column) |
| `english_alt2` | TEXT | NULL | Alternate English meaning 2 (pre-migration column) |
| `category` | TEXT | — | Verb group (e.g. `'Verbs -AR'`, `'Core Verbs'`, `'Stem-Changing O→UE'`, etc.) |
| `verb_family` | TEXT | NULL | Family tag: `'regular-ar'`, `'regular-er'`, `'regular-ir'`, `'irregular'` (added `20260521140000`) |
| `requires_all_answers` | BOOLEAN | false | If true, L3 typed stage shows one input per slash-separated meaning (added `20260521120000`) |
| `present_conjugations` | JSONB | — | Map of pronoun key → conjugated form for present tense |
| `past_conjugations` | JSONB | — | Map of pronoun key → conjugated form for past tense |
| `future_conjugations` | JSONB | — | Map of pronoun key → conjugated form for future tense |

Pronoun keys used in conjugation objects: `yo`, `tu`, `el`, `nosotros`, `ellos`.

### Column access

| Column | Read by | Written by |
|--------|---------|------------|
| `id` | `VerbTrainer.jsx`, `VerbCategoryModal.jsx`, `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCustomQuiz.jsx`, `VerbDictionary.jsx`, `VerbDetail.jsx` | — |
| `spanish_infinitive` | `VerbCategoryModal.jsx`, `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCustomQuiz.jsx`, `VerbDictionary.jsx`, `VerbDetail.jsx` | — |
| `english` | `VerbCategoryModal.jsx`, `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCustomQuiz.jsx`, `VerbDictionary.jsx`, `VerbDetail.jsx` | — |
| `english_alt1` | `VerbQuiz.jsx` | — |
| `english_alt2` | `VerbQuiz.jsx` | — |
| `category` | `VerbTrainer.jsx`, `VerbCategoryModal.jsx`, `VerbCustomQuiz.jsx`, `VerbDictionary.jsx` | — |
| `verb_family` | `VerbDictionary.jsx`, `VerbDetail.jsx` | — |
| `requires_all_answers` | `VerbQuiz.jsx` | — |
| `present_conjugations` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbDictionary.jsx`, `VerbDetail.jsx` | — |
| `past_conjugations` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbDictionary.jsx`, `VerbDetail.jsx` | — |
| `future_conjugations` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbDictionary.jsx`, `VerbDetail.jsx` | — |

**Notes:**
- `english_alt1` / `english_alt2` are not in any migration file — pre-existing columns. `VerbQuiz.jsx` renders them as hint text in the L3/L4 typed stages.
- `VerbArTenseQuiz.jsx` also queries `verbs` with `.eq('category', 'Verbs -AR')` to get the list of AR verb IDs for the stage-2 reset guard.

---

## `user_verb_progress`

Tracks each user's learning progress for each verb across all quiz stages. One row per `(user_id, verb_id)` pair.

**Unique constraint:** `(user_id, verb_id)`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER | — | Primary key |
| `user_id` | UUID | — | FK → `auth.users.id` |
| `verb_id` | INTEGER | — | FK → `verbs.id` |
| `current_stage` | INTEGER | 1 | Current L-stage: 1=L1 drag, 2=L2 MC, 3=L3 typed, 4=L4 typed |
| `drag_match_score` | INTEGER | 0 | Cumulative correct drag rounds (L1); advances stage at 5 |
| `stage2_mastery` | INTEGER | 0 | Score within L2 MC; advances stage at 3 |
| `stage3_mastery` | INTEGER | 0 | Score within L3 typed; advances stage at 3 |
| `l4_score` | INTEGER | 0 | Score within L4 typed; verb mastered at 5 |
| `hidden` | BOOLEAN | false | Whether the verb is hidden from quiz sessions (added `20260521130000`) |
| `t1_score` | INTEGER | 0 | Score within the current AR present-tense sub-stage (added `20260603130000`) |
| `t2_score` | INTEGER | 0 | Score within the current AR past-tense sub-stage (added `20260603130000`) |
| `t3_score` | INTEGER | 0 | Score within the current AR future-tense sub-stage (added `20260603130000`) |
| `t1_cj_stage` | INTEGER | 0 | AR present-tense conjugation sub-stage (0–4); 4 = tense mastered (added `20260604120000`) |
| `t2_cj_stage` | INTEGER | 0 | AR past-tense conjugation sub-stage (0–4); 4 = tense mastered (added `20260604120000`) |
| `t3_cj_stage` | INTEGER | 0 | AR future-tense conjugation sub-stage (0–4); 4 = tense mastered (added `20260604120000`) |
| `l1_incorrect` | INTEGER | 0 | Total incorrect answers at L1 (added `20260605120000`) |
| `l2_incorrect` | INTEGER | 0 | Total incorrect answers at L2 (added `20260605120000`) |
| `l3_incorrect` | INTEGER | 0 | Total incorrect answers at L3 (added `20260605120000`) |
| `l4_incorrect` | INTEGER | 0 | Total incorrect answers at L4 (added `20260605120000`) |
| `l1_resets` | INTEGER | 0 | Number of times L1 was reset (added `20260605120000`) |
| `l2_resets` | INTEGER | 0 | Number of times L2 was reset (added `20260605120000`) |
| `l3_resets` | INTEGER | 0 | Number of times L3 was reset (added `20260605120000`) |
| `l4_resets` | INTEGER | 0 | Number of times L4 was reset (added `20260605120000`) |
| `total_incorrect` | INTEGER | 0 | Total incorrect answers across all levels (added `20260605120000`) |

### Column access

| Column | Read by | Written by |
|--------|---------|------------|
| `id` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx`, `VerbDetail.jsx` | — |
| `user_id` | — | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx` |
| `verb_id` | `VerbTrainer.jsx`, `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx`, `VerbDictionary.jsx`, `VerbDetail.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx` |
| `current_stage` | `VerbTrainer.jsx`, `VerbQuiz.jsx`, `VerbCategoryModal.jsx`, `VerbDictionary.jsx`, `VerbDetail.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx` |
| `drag_match_score` | `VerbQuiz.jsx`, `VerbCategoryModal.jsx`, `VerbDetail.jsx` | `VerbQuiz.jsx`, `VerbCategoryModal.jsx` |
| `stage2_mastery` | `VerbQuiz.jsx`, `VerbCategoryModal.jsx`, `VerbDetail.jsx` | `VerbQuiz.jsx`, `VerbCategoryModal.jsx` |
| `stage3_mastery` | `VerbQuiz.jsx`, `VerbCategoryModal.jsx`, `VerbDetail.jsx` | `VerbQuiz.jsx`, `VerbCategoryModal.jsx` |
| `l4_score` | `VerbTrainer.jsx`, `VerbQuiz.jsx`, `VerbCategoryModal.jsx`, `VerbDictionary.jsx`, `VerbDetail.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx` |
| `hidden` | `VerbTrainer.jsx`, `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` *(session toggle)*, `VerbCategoryModal.jsx` |
| `t1_score` | `VerbTrainer.jsx`, `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx`, `VerbDetail.jsx` | `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx` *(reset)* |
| `t2_score` | `VerbTrainer.jsx`, `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx`, `VerbDetail.jsx` | `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx` *(reset)* |
| `t3_score` | `VerbTrainer.jsx`, `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx`, `VerbDetail.jsx` | `VerbArTenseQuiz.jsx`, `VerbCategoryModal.jsx` *(reset)* |
| `t1_cj_stage` | `VerbTrainer.jsx`, `VerbArTenseQuiz.jsx`, `VerbDetail.jsx` | `VerbArTenseQuiz.jsx` |
| `t2_cj_stage` | `VerbTrainer.jsx`, `VerbArTenseQuiz.jsx`, `VerbDetail.jsx` | `VerbArTenseQuiz.jsx` |
| `t3_cj_stage` | `VerbTrainer.jsx`, `VerbArTenseQuiz.jsx`, `VerbDetail.jsx` | `VerbArTenseQuiz.jsx` |
| `l1_incorrect` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` |
| `l2_incorrect` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` |
| `l3_incorrect` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` |
| `l4_incorrect` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` |
| `l1_resets` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` |
| `l2_resets` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` |
| `l3_resets` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` |
| `l4_resets` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` |
| `total_incorrect` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` | `VerbQuiz.jsx`, `VerbArTenseQuiz.jsx` |

**Notes on `t_n_cj_stage` sub-stage encoding:**
- `0` = sub-stage 1 (drag & match) in progress
- `1` = sub-stage 2 (MC) in progress — drag done
- `2` = sub-stage 3 (typed conj → EN) in progress
- `3` = sub-stage 4 (typed EN → conj) in progress
- `4` = all four sub-stages done; tense mastered

**Two separate pass systems — infinitive vs conjugation (do not mix):**

The verb trainer has two completely independent progression systems with different pass rules. They share neither thresholds nor logic.

| | Infinitive verb-learning (`VerbQuiz.jsx`) | AR tense conjugation (`VerbArTenseQuiz.jsx`) |
|---|---|---|
| Purpose | Learn the verbs themselves (L1–L4) | Drill each subject pronoun (Present/Past/Future) |
| Granularity | **Per-verb** — each verb advances independently | **Per-pronoun, cohort** — all verbs of a tense advance together |
| Pass rule | Per-verb thresholds: L1 `drag_match_score >= 5`; L2 `stage2_mastery >= 3`; L3 `stage3_mastery >= 3`; L4 `l4_score >= 5` (inline in `VerbQuiz.jsx`) | Flat **5 correct per pronoun** on every sub-stage: `STAGE2_PER_PRONOUN_THRESHOLD = 5`. A sub-stage advances only when all five pronouns (Yo, Tú, Él/Ella, Nosotros, Ellos/Ellas) reach 5 → `advanceAllVerbsFromSub` raises `t_n_cj_stage` for the whole cohort |
| Columns | `current_stage`, `drag_match_score`, `stage2_mastery`, `stage3_mastery`, `l4_score` | `t_n_cj_stage` (the authoritative sub-stage); `t_n_score` is a legacy per-verb score and does **not** gate conjugation progression |

All conjugation stage-completion / results cards render through a single shared `ConjResultsCard` component in `VerbArTenseQuiz.jsx`. Both the drag sub-stage (`drag-summary` phase) and the MC/typed sub-stages (`session-summary` phase) pass their per-pronoun cumulative counts to it, so every sub-stage and tense displays each pronoun as cumulative-correct out of a uniform denominator of five (dots match the count), with the per-session score shown separately. There is no per-sub-stage results rendering that can diverge.

There is **no** per-verb pass counter or per-sub-stage threshold in the conjugation flow. The old `SUB_THRESHOLD = {0:5,1:3,2:3,3:5}` per-verb counter was removed from `VerbArTenseQuiz.jsx`; conjugation now depends solely on the five-correct-per-pronoun gate, applied identically across all four sub-stages of all three tenses. The infinitive thresholds in `VerbQuiz.jsx` are unrelated and unchanged.

**Conjugation per-pronoun counts are stored in Supabase, not localStorage.** The five-per-pronoun graduation counters live in the `user_verb_conjugation_progress` table (one row per `user_id, tense, sub_stage, pronoun`, integer `correct_count`), so they carry reliably across sessions and devices. `VerbArTenseQuiz.jsx` loads a sub-stage's counts from the DB on entry (`loadConjCounts`) and upserts the single incremented pronoun on each correct answer (`saveConjCount`, monotonic — never reset on a wrong answer). `VerbCategoryModal.jsx` reads them from the DB too (in `loadModalData`). A one-time client backfill (`backfillConjProgress`, flag `verb-ar-cj-migrated-<userId>` in localStorage) migrates any legacy `verb-ar-cj-*` localStorage counts plus a known snapshot into the DB when a user has no DB counts yet, taking the higher value per pronoun. The old `verb-ar-cj-<userId>-<tense>-<sub>` localStorage keys are no longer written or read (they are left in place, not cleared).

**Notes on `VerbCategoryModal.jsx` resets:**
- A level-1 reset writes: `current_stage=1, stage2_mastery=0, stage3_mastery=0, l4_score=0, drag_match_score=0, t1_score=0, t2_score=0, t3_score=0`
- A level-2 reset writes: `current_stage=2, stage2_mastery=0, stage3_mastery=0, l4_score=0, drag_match_score=0, t1_score=0, t2_score=0, t3_score=0`
- A level-3 reset writes: `current_stage=3, stage3_mastery=0, l4_score=0, drag_match_score=0, t1_score=0, t2_score=0, t3_score=0`
- A level-4 reset writes: `current_stage=4, l4_score=0, drag_match_score=0, t1_score=0, t2_score=0, t3_score=0`
- All reset paths also clear the conjugation sub-stages: `t1_cj_stage=0, t2_cj_stage=0, t3_cj_stage=0` (tense progress is downstream of infinitive mastery, so it is reset alongside it).

**Notes on `VerbArTenseQuiz.jsx` stage-2 reset guard:**
- On load, if the AR stage-2 t1 reset key is not found in `localStorage`, it resets `t1_cj_stage=1, t1_score=0` for all AR verbs that have `t1_cj_stage >= 1` (one-time migration guard).

---

## `saved_quizzes`

Persists user-defined quiz configurations so they can be replayed without reconfiguring. One row per saved quiz. Added in migration `20260608120000`.

**RLS:** enabled — users can only read, insert, update, and delete their own rows.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | — | FK → `auth.users.id` (cascade delete) |
| `name` | TEXT | — | User-supplied name for the saved quiz |
| `quiz_type` | TEXT | — | `'vocab'` or `'verb'` |
| `configuration` | JSONB | `{}` | Selected words/verbs and levels; shape depends on `quiz_type` |
| `created_at` | TIMESTAMPTZ | `now()` | Creation timestamp |

### Column access

| Column | Read by | Written by |
|--------|---------|------------|
| `id` | *(no component yet)* | *(no component yet)* |
| `user_id` | *(no component yet)* | *(no component yet)* |
| `name` | *(no component yet)* | *(no component yet)* |
| `quiz_type` | *(no component yet)* | *(no component yet)* |
| `configuration` | *(no component yet)* | *(no component yet)* |
| `created_at` | *(no component yet)* | *(no component yet)* |

---

## `user_verb_conjugation_progress`

Persistent AR tense conjugation per-pronoun progress (previously browser localStorage only). One row per `(user_id, tense, sub_stage, pronoun)`. Added in migration `20260701120000`.

- `tense`: 1 = Present, 2 = Past, 3 = Future
- `sub_stage`: 1 = Multiple Choice, 2 = Pronoun, 3 = Full Conjugation (Drag & Match is not persisted per pronoun)
- `pronoun`: `yo | tu | el | nosotros | ellos`

Graduation is 5 cumulative correct per pronoun; `correct_count` is monotonic (incremented on correct answers, never reset on wrong).

**RLS:** enabled — users can only read, insert, update, and delete their own rows.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | — | FK → `auth.users.id` (cascade delete) |
| `tense` | INTEGER | — | 1/2/3 (Present/Past/Future); CHECK IN (1,2,3) |
| `sub_stage` | INTEGER | — | 1/2/3 (MC/Pronoun/Full Conjugation); CHECK IN (1,2,3) |
| `pronoun` | TEXT | — | yo/tu/el/nosotros/ellos; CHECK constrained |
| `correct_count` | INTEGER | `0` | Cumulative correct answers for this pronoun; CHECK `>= 0` |
| `created_at` | TIMESTAMPTZ | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | `now()` | Last update timestamp |

Unique constraint on `(user_id, tense, sub_stage, pronoun)`.

### Column access

| Column | Read by | Written by |
|--------|---------|------------|
| `tense` / `sub_stage` / `pronoun` / `correct_count` | `VerbArTenseQuiz.jsx` (`loadConjCounts`), `VerbCategoryModal.jsx` (`loadModalData`) | `VerbArTenseQuiz.jsx` (`saveConjCount`, `backfillConjProgress`) |
