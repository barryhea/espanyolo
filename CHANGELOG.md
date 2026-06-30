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

## Verb Trainer — Category Modal (VerbCategoryModal)

- Fixed Locked/unlocked stages reading mastery from a different source than the home card: the modal now excludes hidden verbs from all completion checks (matching the card's `visibleIds`) and, for Verbs -AR, judges tense completion by `t{n}_cj_stage >= 4` (as the card and AR quiz engine do) instead of the unreliable `t{n}_score` counter. The card and modal now agree on every stage, and Present Tense unlocks once the infinitive is complete
- Added L1–L4 tabs to the progress screen inside the category modal

---

## Database / Schema

- Added incorrect-answer and reset counters to `user_verb_progress` (`l1_incorrect` … `l4_incorrect`, `l1_resets` … `l4_resets`, `total_incorrect`) and `user_word_progress` (`s1_incorrect` … `s3_incorrect`, `s1_resets` … `s3_resets`, `total_incorrect`) — migration `20260605120000`
- Hidden `terminar` (id 59) and `resultar` (id 66) for the primary user account — migration `20260606120000`
