# CHANGELOG.md — Espanyolo

Summarised from the last 30 commits. Grouped by feature area. Newest changes first within each group.

---

## Documentation

- Added `ARCHITECTURE.md` — full Supabase schema with per-column read/write component map
- Added `CLAUDE.md` — session reference covering file responsibilities, rules, and known issues

---

## Verb Trainer — Custom Quiz

- Added session-only per-verb exclude toggle to `VerbCustomQuizSelect`; excluded verbs are dimmed and removed from the question count and quiz selections without permanently hiding them

---

## Verb Trainer — Verb Detail Screen

- Replaced the three stat boxes (Mastered/Level, Score, Tenses) with the home-card-style stage progress strip (Inf · Pres · Past · Fut | L1 · L2 · L3 · L4) driven by live Supabase data
- Fixed tense sync: stage 4 quiz prompt and VerbDetail tense progress bars now stay consistent with DB state
- Fixed L-bar progress strips to always reflect actual L-stage data from the DB rather than derived local state

---

## Verb Trainer — AR Tense Quiz (VerbArTenseQuiz)

- Reduced sessions to 10 questions with a progress bar and a results screen (down from 15, then from infinite)
- Stage 3 typed pronoun: require both forms for Él/Ella and Ellos/Ellas inputs
- Stage 4: per-field green lock on correct answers, red editable on wrong answers after submit; correct fields lock immediately and show a solid green background with white text
- Stage 4: show two inputs for Él/Ella and Ellos/Ellas pronouns; clear input on focus during wrong-answer feedback; removed redundant tense name from question prompt
- Accepted `el/ella` and `ellos/ellas` as valid alternatives in typed pronoun stages
- Prevented the same pronoun from appearing twice in a row within a session
- Fixed per-pronoun pass conditions for Stages 2–4 and updated the progress display accordingly
- Fixed drag-summary display and Stage 1→2 progression logic
- Wired Stage 1 drag completion to advance `t1_cj_stage` in Supabase
- Restored `recordAnswer` calls in Stages 3 and 4
- Fixed `VerbCategoryModal` progress query to remove `cj_stage` columns that caused a select error before the migration landed

---

## Verb Trainer — Drag & Match (VerbDragMatch)

- Added tap-to-place as an alternative interaction to drag-and-drop

---

## Verb Trainer — Home & Navigation (VerbTrainer)

- Fixed category-card tense segments showing a false "up next" orange: Present/Past/Future now render grey until the tense has real stored progress (`t{n}_cj_stage`/`t{n}_score`), so a -AR category with the infinitive done but no conjugation work shows grey tense bars instead of green/orange
- Hidden verbs are now excluded from tense-completion checks when computing category card state
- Progress data is re-fetched on every navigation back to the VerbTrainer screen
- Refactored VerbTrainer into focused component files (`VerbProgress`, `VerbDragMatch`, `VerbCategoryModal`, etc.)

---

## Verb Trainer — AR Tense Quiz (VerbArTenseQuiz)

- Conjugation per-pronoun progress is now stored in Supabase (`user_verb_conjugation_progress`) instead of browser localStorage, so it survives across sessions, browsers, and devices. Counts load from the DB on entering each sub-stage and each correct answer upserts the single incremented pronoun (monotonic — five cumulative correct per pronoun to graduate, never reset on a wrong answer). Fixes the cross-session persistence failure caused by the old localStorage save/restore. A one-time backfill migrates any legacy `verb-ar-cj-*` localStorage counts plus a known snapshot into the DB (higher value per pronoun, so nothing is lost) when a user has no DB counts yet. `VerbCategoryModal.jsx`'s progress view reads the counts from the DB too. Removed the temporary "Export conjugation progress" button from the Verb Trainer home
- Consolidated the two separate stage-completion render paths (`drag-summary` and `session-summary`) into one shared `ConjResultsCard` component, so every conjugation sub-stage (Drag & Match, Multiple Choice, Pronoun, Full Conjugation) across all three tenses renders identically: each pronoun as cumulative-correct out of a uniform denominator of five with dots reflecting that count, and the per-session score kept separately as the run result. Previously the cumulative-out-of-five fix lived only in the inline render blocks and could diverge per sub-stage; the single component prevents that. Reads persisted counts only — no progress mutated or reset
- Conjugation stage-completion card now shows cumulative progress toward graduation instead of per-session diagnostics. Each of the five pronouns (Yo, Tú, Él/Ella, Nosotros, Ellos/Ellas) is displayed as cumulative-correct-out-of-five (e.g. "Yo 2/5") using the persisted per-pronoun counts (`stage2/3/4PronounCounts`), capped at the 5-correct threshold, with the five dots reflecting that same cumulative count. The per-session score (e.g. 10/10 correct) is kept but relabelled as "This session's result", separate from the graduation progress. Applies to all conjugation sub-stages (Drag & Match shows the same X/5-toward-threshold view). No progress is mutated or reset — the card only reads the already-saved counts
- Removed the per-verb pass counter (`SUB_THRESHOLD = {0:5,1:3,2:3,3:5}`) from the conjugation flow. That threshold pattern belongs to the infinitive verb-learning system and was incorrectly carried into conjugation. Present/Past/Future progression now depends **solely** on the flat five-correct-per-pronoun gate (`STAGE2_PER_PRONOUN_THRESHOLD = 5`), applied identically to all four sub-stages (Drag & Match, Multiple Choice, Pronoun typed, Full Conjugation typed): a sub-stage passes only when each of the five pronouns (Yo, Tú, Él/Ella, Nosotros, Ellos/Ellas) reaches 5 correct, which advances the whole cohort's `t{n}_cj_stage`. el/ella and ellos/ellas still accept either gendered form; the five-pronoun structure (no Vosotros) and pronoun-count persistence are unchanged. Infinitive stages (L1–L4) in `VerbQuiz.jsx` are untouched — infinitive and conjugation now use two separate, distinct pass systems (documented in ARCHITECTURE.md)
- Fixed launching Present Tense for Verbs -AR reporting "all complete" and refusing to start: the hand-off gate in VerbQuiz (`allL4Mastered`) was computed over all verbs including hidden ones, so two hidden un-mastered verbs kept it false and the redirect to the AR tense quiz never fired — the screen fell through to the empty/complete state. The gate now excludes hidden verbs (matching the card/modal unlock logic), so an unstarted Present Tense correctly hands off and serves a fresh drag session

---

## Verb Trainer — Category Modal (VerbCategoryModal)

- Fixed the stage status dot being orange for an unlocked-but-unstarted tense: the dot was binary (green when complete, else orange). It is now a faithful function of the stored `t{n}_cj_stage` — grey at zero progress, orange only when genuinely in progress, green when mastered
- Fixed "Reset Level" not clearing -AR tense conjugation progress: the reset payloads zeroed `t{n}_score` but never `t{n}_cj_stage`, so once the AR tense flow advanced a sub-stage there was no way to clear it through the app. The stranded `t{n}_cj_stage` kept the home-card Present/Past segments rendering green/orange after every reset (the recurring "it reverts" bug). Reset now also zeroes `t1_cj_stage/t2_cj_stage/t3_cj_stage`. Existing stranded -AR tense data was corrected to 0 for affected accounts, preserving infinitive mastery (`current_stage`, `l4_score`) and hidden flags
- Fixed Locked/unlocked stages reading mastery from a different source than the home card: the modal now excludes hidden verbs from all completion checks (matching the card's `visibleIds`) and, for Verbs -AR, judges tense completion by `t{n}_cj_stage >= 4` (as the card and AR quiz engine do) instead of the unreliable `t{n}_score` counter. The card and modal now agree on every stage, and Present Tense unlocks once the infinitive is complete
- Added L1–L4 tabs to the progress screen inside the category modal

---

## Database / Schema

- Added incorrect-answer and reset counters to `user_verb_progress` (`l1_incorrect` … `l4_incorrect`, `l1_resets` … `l4_resets`, `total_incorrect`) and `user_word_progress` (`s1_incorrect` … `s3_incorrect`, `s1_resets` … `s3_resets`, `total_incorrect`) — migration `20260605120000`
- Hidden `terminar` (id 59) and `resultar` (id 66) for the primary user account — migration `20260606120000`
