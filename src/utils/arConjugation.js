// Shared AR conjugation helpers — the Stage 4 "Full Conjugation" (typed EN→conj)
// question building and answer checking, extracted so the practice-only AR Mastery
// quiz can reuse the exact same logic without touching VerbArTenseQuiz.jsx's tense
// progression engine. Pure functions only (no React, no Supabase).

export const PRONOUNS = [
  { key: 'yo',       label: 'Yo',            english: 'I'        },
  { key: 'tu',       label: 'Tú',            english: 'You'      },
  { key: 'el',       label: 'Él / Ella',     english: 'He / She' },
  { key: 'nosotros', label: 'Nosotros',      english: 'We'       },
  { key: 'ellos',    label: 'Ellos / Ellas', english: 'They'     },
]

// Accepted typed forms for pronouns that cover two people (either half is correct).
export const PRONOUN_ALTERNATIVES = {
  el:    ['el', 'ella'],
  ellos: ['ellos', 'ellas'],
}

// The three tenses the Mastery quiz mixes, each with a distinct banner colour so the
// user knows which tense to conjugate into when questions are interleaved.
export const MASTERY_TENSES = [
  { key: 't1', conjKey: 'present_conjugations', label: 'Present', bannerBg: '#2563eb' },
  { key: 't2', conjKey: 'past_conjugations',    label: 'Past',    bannerBg: '#ea580c' },
  { key: 't3', conjKey: 'future_conjugations',  label: 'Future',  bannerBg: '#7c3aed' },
]

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Reorder so no two adjacent questions share the same pronoun key (greedy swap).
export function noConsecutivePronoun(arr) {
  const result = [...arr]
  for (let i = 1; i < result.length; i++) {
    if (result[i].pronoun.key === result[i - 1].pronoun.key) {
      for (let j = i + 1; j < result.length; j++) {
        if (result[j].pronoun.key !== result[i - 1].pronoun.key) {
          ;[result[i], result[j]] = [result[j], result[i]]
          break
        }
      }
    }
  }
  return result
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((_, j) => j === 0 ? i : 0))
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

export function normalise(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9\s]/g, '').toLowerCase().trim()
}

// 'exact' | 'close' | 'wrong' — identical thresholds to the tense quiz.
export function fuzzyMatch(typed, correct) {
  const a = normalise(typed), b = normalise(correct)
  if (a === b) return 'exact'
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 'exact'
  return (1 - levenshtein(a, b) / maxLen) >= 0.8 ? 'close' : 'wrong'
}

// Build one Stage 4 "Full Conjugation" question (typed EN → pronoun + conjugation)
// for a given verb, pronoun and tense. Mirrors VerbArTenseQuiz's conj-typed-dual.
export function buildDualQuestion(verb, pronoun, tenseMeta) {
  const form        = verb[tenseMeta.conjKey]?.[pronoun.key] ?? ''
  const verbEnglish = verb.english.split('/')[0].replace(/\s*\(.*?\)\s*/g, '').trim()
  return {
    type: 'conj-typed-dual',
    verb, pronoun,
    tenseKey:  tenseMeta.key,
    tenseMeta,
    prompt:    `${pronoun.english} ${verbEnglish}`,
    correctPronoun:           pronoun.key,
    correctPronounCandidates: PRONOUN_ALTERNATIVES[pronoun.key] ?? [pronoun.key],
    tripleInput:              !!PRONOUN_ALTERNATIVES[pronoun.key],
    correctConjugation:       form,
  }
}

// Check a Stage 4 answer. Returns { result, f1Ok, f2Ok, f3Ok, correct }.
// Identical logic to VerbArTenseQuiz's conj-typed-dual handler, incl. the
// order-independent el/ella & ellos/ellas gendered acceptance.
export function checkDualAnswer(question, a1, a2, a3) {
  let result, f1Ok, f2Ok, f3Ok
  if (question.tripleInput) {
    const cands = question.correctPronounCandidates
    const r00 = fuzzyMatch(a1, cands[0]), r01 = fuzzyMatch(a1, cands[1])
    const r10 = fuzzyMatch(a2, cands[0]), r11 = fuzzyMatch(a2, cands[1])
    const aOk = r00 !== 'wrong' && r11 !== 'wrong'
    const bOk = r01 !== 'wrong' && r10 !== 'wrong'
    const pronOk = aOk || bOk
    const conjResult = fuzzyMatch(a3, question.correctConjugation)
    const conjOk = conjResult !== 'wrong'
    if (!pronOk || !conjOk) {
      result = 'wrong'
    } else {
      const allExact = conjResult === 'exact' && (
        (aOk && r00 === 'exact' && r11 === 'exact') ||
        (bOk && r01 === 'exact' && r10 === 'exact')
      )
      result = allExact ? 'exact' : 'close'
    }
    f1Ok = pronOk; f2Ok = pronOk; f3Ok = conjOk
  } else {
    const pronCands  = question.correctPronounCandidates ?? [question.correctPronoun]
    const pronResult = pronCands
      .map(c => fuzzyMatch(a1, c))
      .reduce((best, r) => r === 'exact' ? 'exact' : best === 'exact' ? 'exact' : r === 'close' ? 'close' : best, 'wrong')
    const conjResult = fuzzyMatch(a2, question.correctConjugation)
    const pronOk = pronResult !== 'wrong'
    const conjOk = conjResult !== 'wrong'
    result = pronOk && conjOk
      ? (pronResult === 'exact' && conjResult === 'exact' ? 'exact' : 'close')
      : 'wrong'
    f1Ok = pronOk; f2Ok = conjOk; f3Ok = null
  }
  return { result, f1Ok, f2Ok, f3Ok, correct: result !== 'wrong' }
}

// Whether the "Next" button may proceed after a wrong answer — the user must fix
// the wrong field(s) first. Mirrors VerbArTenseQuiz's confirmOk (dual branch).
export function dualConfirmOk(question, a1, a2, a3, f1Ok, f2Ok, f3Ok) {
  if (question.tripleInput) {
    const cands = question.correctPronounCandidates
    const pronPairOk = f1Ok === true || (() => {
      const r00 = fuzzyMatch(a1, cands[0]), r01 = fuzzyMatch(a1, cands[1])
      const r10 = fuzzyMatch(a2, cands[0]), r11 = fuzzyMatch(a2, cands[1])
      return (r00 !== 'wrong' && r11 !== 'wrong') || (r01 !== 'wrong' && r10 !== 'wrong')
    })()
    const conjOkNow = f3Ok === true || fuzzyMatch(a3, question.correctConjugation) !== 'wrong'
    return pronPairOk && conjOkNow
  }
  const pronCands = question.correctPronounCandidates ?? [question.correctPronoun]
  const f1OkNow = f1Ok === true || pronCands.some(c => fuzzyMatch(a1, c) !== 'wrong')
  const f2OkNow = f2Ok === true || fuzzyMatch(a2, question.correctConjugation) !== 'wrong'
  return f1OkNow && f2OkNow
}
