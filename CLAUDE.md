# CLAUDE.md — Espanyolo Project

> **Read this file in full before making any changes in a session.**
> It is the authoritative reference for file responsibilities, non-negotiable rules, and known issues.

---

## Source File Inventory

### Entry Points

| File | Responsibility |
|------|---------------|
| `src/main.jsx` | React entry point — mounts `<App>` into the DOM |
| `src/App.jsx` | Router setup — all route definitions and the `ProtectedRoute` wrapper |
| `src/index.css` | Global CSS reset and base typography |
| `src/App.css` | Minimal app-level style overrides |

### Utilities

| File | Responsibility |
|------|---------------|
| `src/utils/supabaseClient.js` | Supabase client singleton, initialised from `VITE_SUPABASE_*` env vars |
| `src/utils/courseData.js` | Static data: `VOCAB_THEMES` and `VERB_CATEGORIES` arrays — the source of truth for theme/category IDs and titles |

### Hooks

| File | Responsibility |
|------|---------------|
| `src/hooks/useAuth.js` | Auth state hook — subscribes to Supabase auth changes, exposes `{ user, loading }` |

### Components

| File | Responsibility |
|------|---------------|
| `src/components/NavBar.jsx` | Top navigation bar with logo, current-route highlighting, and user avatar / logout |
| `src/components/ProtectedRoute.jsx` | Route guard — redirects unauthenticated users to `/login` |

---

### Pages — Vocabulary Trainer

| File | Route | Responsibility |
|------|-------|---------------|
| `src/pages/Home.jsx` | `/` | Landing screen — navigation cards to Vocabulary Trainer and Verb Trainer |
| `src/pages/Login.jsx` | `/login` | Magic-link auth form — handles Supabase OTP sign-in |
| `src/pages/AuthCallback.jsx` | `/auth/callback` | OAuth / magic-link callback handler — establishes session then redirects to home |
| `src/pages/Dashboard.jsx` | `/vocabulary` | Vocabulary Trainer home — theme cards with mastery progress, entry to vocab quiz and custom quiz |
| `src/pages/Quiz.jsx` | `/quiz/:themeId` | Vocabulary quiz engine — L1 MC, L2 typed-EN, L3 typed-ES stages for a single vocab theme. Reads/writes `words` + `user_word_progress`. |
| `src/pages/CustomQuiz.jsx` | `/custom-quiz` | Vocabulary custom quiz runner — receives word selections from Dashboard, runs a mixed session. Reads/writes `words` + `user_word_progress`. |
| `src/pages/Dictionary.jsx` | `/dictionary` | Searchable/filterable list of all vocab words with mastery indicators |
| `src/pages/HiddenWords.jsx` | `/hidden` | Management screen for words hidden/snoozed from the quiz pool |
| `src/pages/Polish.jsx` | `/polish` | "Polish mode" — surfaces near-mastered vocab words for review |

---

### Pages — Verb Trainer

| File | Route | Responsibility |
|------|-------|---------------|
| `src/pages/VerbTrainer.jsx` | `/verbs` | Verb Trainer home — category cards with `MasteryStrip7` progress strips. Also owns the `MasteryStrip7` and `segColors` components. Routes to VerbQuiz, VerbArTenseQuiz, VerbCustomQuizSelect. |
| `src/pages/VerbQuiz.jsx` | `/verb-quiz/:categoryId` | Main verb conjugation quiz engine for general verb categories. Handles L1 drag-and-match, L2 MC, L3 typed, L4 typed. Reads/writes `user_verb_progress`. **Do not share logic with `Quiz.jsx` or `VerbArTenseQuiz.jsx`.** |
| `src/pages/VerbArTenseQuiz.jsx` | `/verb-ar-tense-quiz` | AR tense-specific quiz (Present → Past → Future). Runs 10-question pronoun-by-pronoun sessions with a pass threshold of 5 correct per pronoun. Reads/writes `user_verb_progress` columns: `t1_cj_stage`, `t2_cj_stage`, `t3_cj_stage`, `t1_score`, `t2_score`, `t3_score`. **Do not share logic with `Quiz.jsx` or `VerbQuiz.jsx`.** |
| `src/pages/VerbDragMatch.jsx` | *(component, not routed)* | Shared drag-and-match component library — exports `ConjDragRound`, used by VerbQuiz and VerbArTenseQuiz for L1 drag sessions |
| `src/pages/VerbProgress.jsx` | *(component, not routed)* | Shared progress display library — exports `VerbProgressRow`, `PronounProgressView`, and `PRONOUNS` constants; used by VerbCategoryModal |
| `src/pages/VerbCategoryModal.jsx` | *(overlay, not routed)* | Verb category card overlay — shows per-verb progress rows, hide/unhide controls, and entry into quiz. Imports from VerbProgress. |
| `src/pages/VerbCustomQuizSelect.jsx` | `/verb-custom-quiz-select` | Custom quiz configuration screen — verb-level toggles (L1–L4) and session-only per-verb exclusion. Passes selections to VerbCustomQuiz. |
| `src/pages/VerbCustomQuiz.jsx` | `/verb-custom-quiz` | Custom quiz runner — receives selections from VerbCustomQuizSelect and runs the chosen levels for each verb |
| `src/pages/VerbDictionary.jsx` | `/verb-dictionary` | Searchable list of all verbs with family/progress indicators; links to VerbDetail |
| `src/pages/VerbDetail.jsx` | `/verb-dictionary/:verbId` | Single-verb detail view — family stamp, full conjugation table (Present/Past/Future), and stage progress strip. Read-only, no quiz actions. |

---

## Rules

These rules apply in every session. Do not deviate without explicit user instruction.

### 1 — Never let logic bleed between quiz engines

`Quiz.jsx`, `VerbQuiz.jsx`, and `VerbArTenseQuiz.jsx` are three completely separate quiz engines. They serve different content types and different progress schemas. Never share state, helper functions, or scoring logic across these files. If a utility is genuinely common (e.g. a shuffle function) it must live in a shared util, not be copied from one quiz file to another.

### 2 — Always run `supabase db push --linked` after any schema change

Any migration file added to `supabase/migrations/` must be pushed to the linked remote project before the session ends. Never leave a schema change in local files only.

### 3 — Always refetch Supabase data when navigating back to a screen

Do not rely on stale in-memory state when a user navigates back. Screens that show Supabase-backed data must re-run their data fetch on mount (or on focus/visibility if using a listener). Use `useLocation` key or an effect dependency on navigation state to trigger refetches where needed.

### 4 — Never hardcode progress states

Progress values (stage numbers, score thresholds, mastery flags) must always be derived from live Supabase data for the authenticated user. Do not substitute hard-coded fallback states that would misrepresent actual progress.

### 5 — Session lengths are fixed

| Quiz type | Session length |
|-----------|---------------|
| L1 — Drag and match | 5 rounds |
| L2 — Multiple choice | 25 questions |
| L3 — Typed | 10 questions |
| L4 — Typed | 10 questions |

### 6 — AR tense stage pass condition

Each AR tense stage (Present / Past / Future) runs a 10-question session. The pass condition is **5 correct answers per pronoun** (yo, tú, él/ella, nosotros, ellos/ellas). Passing all pronouns advances the `t_cj_stage` column for that tense. Do not change question count or pass threshold without explicit instruction.

---

## Known Issues

*This section should be updated whenever a bug or limitation is discovered. Include the date and a brief description.*

| Date | Issue | Status |
|------|-------|--------|
| 2026-06-08 | `VerbCategoryModal` tense unlock state is sometimes out of sync with `VerbTrainer` home card progress display | Open |
| 2026-06-08 | Hidden verbs are excluded from regular quizzes but still appear in the custom quiz screen | Open |
| 2026-06-08 | AR tense quiz occasionally serves wrong tense conjugations as prompts | Open |
| 2026-06-08 | `VerbDetail.jsx` stage progress bars show tense completion as grey despite user having completed tenses | Open |
