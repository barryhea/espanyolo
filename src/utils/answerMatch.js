// Shared answer normalisation & comparison for the vocab quizzes.
//
// This is the SINGLE place a typed/selected answer is compared against the
// correct answer. Both the user's answer and the correct answer are normalised
// — parenthetical content and surrounding whitespace stripped — at the point of
// comparison only. Stored word data is never modified.
//
// All vocab comparison paths (Quiz.jsx: S1 multiple choice, S2 typed, S3 typed,
// theme Struggle Quiz; CustomQuiz.jsx: standard custom quiz + Top 10 Struggle
// Quiz) must route through these helpers so the parenthesis handling can never
// drift between paths again.

const CLOSE_THRESHOLD = 0.75 // ratio at/above which a typed answer counts as "close"

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((_, j) => j === 0 ? i : 0))
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// Lowercase, strip accents and punctuation, collapse to comparable form.
export function normalise(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .toLowerCase()
    .trim()
}

// Remove "(...)" parenthetical content and collapse the leftover whitespace.
export function stripParens(str) {
  return str.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
}

// Compare one user answer against one correct answer.
// Returns 'exact' | 'close' | 'wrong'. Parens are stripped from BOTH sides.
export function fuzzyMatch(typed, correct) {
  const a = normalise(stripParens(typed ?? ''))
  const b = normalise(stripParens(correct ?? ''))
  if (a === b) return 'exact'
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 'exact'
  return (1 - levenshtein(a, b) / maxLen) >= CLOSE_THRESHOLD ? 'close' : 'wrong'
}

// Words whose answer contains "/" (e.g. "By / For") require every segment to be
// answered. Segments are matched independently and order-independently.
export function splitAnswers(correct) {
  return correct.split('/').map(s => s.trim()).filter(Boolean)
}

export function matchMulti(typedArr, segments) {
  const used = new Array(typedArr.length).fill(false)
  let worst = 'exact'
  for (const seg of segments) {
    let best = null, bestIdx = -1
    for (let i = 0; i < typedArr.length; i++) {
      if (used[i]) continue
      const r = fuzzyMatch(typedArr[i] ?? '', seg)
      if (r === 'exact') { best = 'exact'; bestIdx = i; break }
      if (r === 'close' && best !== 'close') { best = 'close'; bestIdx = i }
    }
    if (best === null) return 'wrong'
    used[bestIdx] = true
    if (best === 'close') worst = 'close'
  }
  return worst
}
