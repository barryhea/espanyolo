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

## Verb Trainer — AR Mastery Quiz (VerbMasteryQuiz)

- New practice-only AR Mastery quiz for Verbs -AR (`/verb-mastery-quiz`), reachable from the Verbs -AR category modal. Locked until Present, Past and Future are all fully mastered (every visible AR verb has `t1/t2/t3_cj_stage = 4`, read from Supabase). Draws Stage 4 Full Conjugation (typed EN→conjugation) questions mixed evenly across the three tenses (5 each), each shown under a distinct coloured tense banner (Present/Past/Future). Reuses the exact Stage 4 typed-answer checking (extracted to `src/utils/arConjugation.js`) including the order-independent el/ella and ellos/ellas gendered acceptance. Practice only — it never writes conjugation counts or any tense progression; the tense progression engine (`VerbArTenseQuiz.jsx`) is untouched.
- On completing a Mastery session, the result is recorded to the Supabase last-5-results metric (`user_verb_mastery_results`): a timestamp, overall score, and a per-tense (1/2/3) and per-pronoun (yo/tu/el/nosotros/ellos) correct/incorrect breakdown. Only the 5 most recent sessions per user are kept (newest first; client trims to 5 and a DB CHECK enforces ≤5). Stored in Supabase so it persists across devices; a future overview screen can read it to analyse weakness by tense and pronoun. This is a practice metric only and never affects tense progression.

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

## Verb Trainer — AR Match Tree (Mastery Stage 1)

- Session is now 20 questions (up from 5) with **randomised** pronouns instead of the fixed Yo→Ellos order. The same pronoun never appears in two consecutive questions, and a pronoun that repeats uses a different verb than its previous appearance so the question isn't identical (5 pronouns ⇒ always an alternative, so it can't stall). Each question still presents exactly the three correct forms (no distractors). The results card now aggregates per pronoun across its multiple appearances (cumulative correct / total). Still practice-only — no progression change.

- Added a new practice-only "Match Tree" mode to the AR Mastery section, presented as **Stage 1** alongside the existing Mastery quiz (now **Stage 2**). Both stages are always accessible once unlocked (same condition as before — Present, Past and Future all mastered for every AR verb, read from Supabase); the user chooses which to practise. Match Tree (`/verb-match-tree`, `VerbMatchTree.jsx`) asks one question per subject pronoun (Yo, Tú, Él/Ella, Nosotros, Ellos/Ellas); for that pronoun the user places a single chosen verb's Past/Present/Future forms into three labelled tense slots via drag **or** tap-to-place (reusing the Level 1 drag-and-match interaction). Each question offers the 3 correct forms plus a few plausible distractors (wrong-pronoun forms of the same verb). Correctness is by-tense-slot placement; either gendered form is inherently accepted. It is practice only — it never modifies tense progression or conjugation counts. Its last-5 results (timestamp, score, per-tense and per-pronoun breakdown) are stored in Supabase (`user_verb_match_tree_results`), not localStorage.

---

## Verb Trainer — AR Endings Cheat Sheet

- Reordered the cheat sheet's tense columns to **Past, Present, Future** (left to right), matching the rest of the app (Verb Detail / dictionary conjugation tables) instead of Present/Past/Future. It's a single shared component (`FilteredDictionaryModal`), so the change updates every instance at once — the "-AR Endings" tab and the AR quiz conclusion screens. Each column's header colour and endings move together; no endings data changed.
- Added a regular -AR endings cheat sheet, shown **only** for the Verbs -AR category (whose verbs are all perfectly regular). It strips the verb stem and shows just the shared ending for each pronoun (Yo, Tú, Él/Ella, Nosotros, Ellos/Ellas) across Present, Past and Future as `___` + ending (e.g. `___o`, `___é`, `___aré`). The endings are **derived from the actual regular -AR conjugation data** (stem = infinitive minus "ar", most-common remainder), not hardcoded, so they stay correct if the data changes. Surfaced in two places, both reusing the same `FilteredDictionaryModal`: as an extra "-AR Endings" tab inside the filtered Verb Dictionary modal when it's showing Verbs -AR, and as an "-AR Endings Cheat Sheet" option on the Verbs -AR quiz conclusion screen (opens the modal on that tab). The other three categories (Core Verbs, Patterned Irregulars, True Irregulars) contain irregular AR verbs and never show it.

---

## Verb Trainer — Quiz (VerbQuiz)

- Added a "Verb Dictionary" button to the quiz results/conclusion screen. It opens the reusable `FilteredDictionaryModal` as an overlay on top of the results (no navigation away), filtered to the just-quizzed category's verbs; dismissing it returns to the results screen intact.

---

## Verb Trainer — Category Modal (VerbCategoryModal)

- Added a "Verb Dictionary" entry to each category's options popup (Verbs -AR, Core Verbs, Patterned Irregulars, True Irregulars). It opens a new reusable `FilteredDictionaryModal` as an overlay (not a navigation) showing only that category's verbs, each expandable to its Present/Past/Future conjugation table — a condensed version of the full Verb Dictionary. Closing it returns to the category popup. The modal accepts a set of verbs to display, so it can be reused elsewhere. No quiz or progression logic changed
- Fixed the stage status dot being orange for an unlocked-but-unstarted tense: the dot was binary (green when complete, else orange). It is now a faithful function of the stored `t{n}_cj_stage` — grey at zero progress, orange only when genuinely in progress, green when mastered
- Fixed "Reset Level" not clearing -AR tense conjugation progress: the reset payloads zeroed `t{n}_score` but never `t{n}_cj_stage`, so once the AR tense flow advanced a sub-stage there was no way to clear it through the app. The stranded `t{n}_cj_stage` kept the home-card Present/Past segments rendering green/orange after every reset (the recurring "it reverts" bug). Reset now also zeroes `t1_cj_stage/t2_cj_stage/t3_cj_stage`. Existing stranded -AR tense data was corrected to 0 for affected accounts, preserving infinitive mastery (`current_stage`, `l4_score`) and hidden flags
- Fixed Locked/unlocked stages reading mastery from a different source than the home card: the modal now excludes hidden verbs from all completion checks (matching the card's `visibleIds`) and, for Verbs -AR, judges tense completion by `t{n}_cj_stage >= 4` (as the card and AR quiz engine do) instead of the unreliable `t{n}_score` counter. The card and modal now agree on every stage, and Present Tense unlocks once the infinitive is complete
- Added L1–L4 tabs to the progress screen inside the category modal

---

## Database / Schema

- Added incorrect-answer and reset counters to `user_verb_progress` (`l1_incorrect` … `l4_incorrect`, `l1_resets` … `l4_resets`, `total_incorrect`) and `user_word_progress` (`s1_incorrect` … `s3_incorrect`, `s1_resets` … `s3_resets`, `total_incorrect`) — migration `20260605120000`
- Hidden `terminar` (id 59) and `resultar` (id 66) for the primary user account — migration `20260606120000`
