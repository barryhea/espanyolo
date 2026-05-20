import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { VERB_CATEGORIES } from '../utils/courseData'
import NavBar from '../components/NavBar'

// ── Fuzzy matching (copied verbatim from Quiz.jsx) ─────────────────────────────
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

function normalise(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .toLowerCase()
    .trim()
}

function fuzzyMatch(typed, correct) {
  const a = normalise(typed)
  const b = normalise(correct)
  if (a === b) return 'exact'
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 'exact'
  return (1 - levenshtein(a, b) / maxLen) >= 0.8 ? 'close' : 'wrong'
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const PRONOUNS = ['yo', 'tu', 'el', 'nosotros', 'ellos']
const PRONOUN_DISPLAY = { yo: 'I', tu: 'You', el: 'He/She', nosotros: 'We', ellos: 'They' }

function pickPronoun() {
  return PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)]
}

function buildSession(verbs, progressMap) {
  const s1 = verbs.filter(v => (progressMap[v.id]?.stage ?? 1) === 1)
  if (s1.length > 0) {
    return shuffle(s1).slice(0, 25)
  }
  return shuffle(verbs).slice(0, 10)
}

function buildQuestion(verb, progressMap) {
  const stage = progressMap[verb.id]?.stage ?? 1

  if (stage === 1) {
    // Show Spanish infinitive → type English meaning
    return {
      type: 'typed',
      verb,
      stage,
      prompt: verb.spanish_infinitive,
      promptLabel: 'What does this verb mean? (no "to")',
      correct: verb.english,
      placeholder: 'Type the English meaning…',
      pronoun: null,
    }
  }

  const pronoun = pickPronoun()
  const displayPronoun = PRONOUN_DISPLAY[pronoun]
  const promptText = `${displayPronoun} / ${verb.english}`

  if (stage === 2) {
    return {
      type: 'typed',
      verb,
      stage,
      prompt: promptText,
      promptLabel: 'Type the present tense conjugation:',
      correct: verb.present_conjugations[pronoun],
      placeholder: 'Type the Spanish conjugation…',
      pronoun,
    }
  }

  if (stage === 3) {
    return {
      type: 'typed',
      verb,
      stage,
      prompt: promptText,
      promptLabel: 'Type the future tense conjugation:',
      correct: verb.future_conjugations[pronoun],
      placeholder: 'Type the Spanish conjugation…',
      pronoun,
    }
  }

  // stage === 4
  return {
    type: 'typed',
    verb,
    stage,
    prompt: promptText,
    promptLabel: 'Type the past tense conjugation:',
    correct: verb.past_conjugations[pronoun],
    placeholder: 'Type the Spanish conjugation…',
    pronoun,
  }
}

// ── Progress ring (identical to Dashboard) ─────────────────────────────────────
function ringColor(pct) {
  if (pct === 100) return '#22c55e'
  if (pct >= 75) return '#eab308'
  if (pct >= 50) return '#f97316'
  return '#ef4444'
}

function ProgressRing({ pct }) {
  const color = ringColor(pct)
  const filled = Math.min(100, Math.max(0, pct))
  const empty = 100 - filled
  const r = 15.9155
  return (
    <svg viewBox="-2 -2 40 40" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="#ececec" strokeWidth="3" />
      {filled > 0 && (
        <circle
          cx="18" cy="18" r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${filled} ${empty}`}
          strokeDashoffset="25"
          strokeLinecap="butt"
        />
      )}
      <text
        x="18" y="18"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={pct === 100 ? 7 : 8.5}
        fontWeight="700"
        fill={color}
        fontFamily="system-ui, sans-serif"
      >
        {pct}%
      </text>
    </svg>
  )
}

// ── Mastery bar — 4 stages: S1(bronze×3) S2(silver×3) S3(gold×3) S4(platinum×5)
function MasteryBar({ stage, consecutiveCorrect, mastered }) {
  const BRONZE = '#cd7f32', SILVER = '#a8a9ad', GOLD = '#f5c518', PLATINUM = '#60a5fa'

  const s1Filled = mastered ? 3 : stage >= 2 ? 3 : Math.min(consecutiveCorrect, 3)
  const s2Filled = mastered ? 3 : stage >= 3 ? 3 : stage === 2 ? Math.min(consecutiveCorrect, 3) : 0
  const s3Filled = mastered ? 3 : stage >= 4 ? 3 : stage === 3 ? Math.min(consecutiveCorrect, 3) : 0
  const s4Filled = mastered ? 5 : stage === 4 ? Math.min(consecutiveCorrect, 5) : 0

  const segs = [
    ...Array(3).fill(null).map((_, i) => ({ filled: i < s1Filled, color: BRONZE })),
    ...Array(3).fill(null).map((_, i) => ({ filled: i < s2Filled, color: SILVER })),
    ...Array(3).fill(null).map((_, i) => ({ filled: i < s3Filled, color: GOLD })),
    ...Array(5).fill(null).map((_, i) => ({ filled: i < s4Filled, color: PLATINUM })),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Verb Mastery
      </span>
      <div style={{ display: 'flex', gap: '3px' }}>
        {segs.map((seg, i) => (
          <div key={i} style={{
            flex: 1,
            height: '8px',
            borderRadius: '3px',
            backgroundColor: seg.filled ? seg.color : '#fff',
            border: `1.5px solid ${seg.filled ? seg.color : '#d1d5db'}`,
            boxSizing: 'border-box',
          }} />
        ))}
      </div>
    </div>
  )
}

function StageCell({ done }) {
  return (
    <td style={styles.stageCell}>
      <span style={{ color: done ? '#16a34a' : '#d1d5db', fontWeight: 700 }}>
        {done ? '✓' : '✗'}
      </span>
    </td>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function VerbQuiz() {
  const { categoryId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const category = VERB_CATEGORIES.find(c => c.id === Number(categoryId))
  const progressRef = useRef({})
  const inputRef = useRef(null)

  const [phase, setPhase] = useState('loading')
  const [allVerbs, setAllVerbs] = useState([])
  const [session, setSession] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [question, setQuestion] = useState(null)
  const [typedAnswer, setTypedAnswer] = useState('')
  const [matchResult, setMatchResult] = useState(null)
  const [results, setResults] = useState([])

  useEffect(() => {
    if (category && user) loadQuiz()
  }, [category?.id, user?.id])

  useEffect(() => {
    if (phase === 'question') inputRef.current?.focus({ preventScroll: true })
  }, [question, phase])

  async function ensureProfile() {
    await supabase
      .from('profiles')
      .upsert({ id: user.id, email: user.email }, { onConflict: 'id' })
  }

  async function loadQuiz() {
    setPhase('loading')
    await ensureProfile()

    const { data: verbs, error } = await supabase
      .from('verbs')
      .select('*')
      .eq('category', category.title)

    if (error || !verbs?.length) {
      setPhase('error')
      return
    }

    const verbIds = verbs.map(v => v.id)
    const { data: progress } = await supabase
      .from('user_verb_progress')
      .select('id, verb_id, stage, consecutive_correct, mastered')
      .eq('user_id', user.id)
      .in('verb_id', verbIds)

    const progMap = {}
    const masteredVerbIds = new Set()
    for (const p of progress ?? []) {
      const existing = progMap[p.verb_id]
      if (!existing || p.stage > existing.stage ||
          (p.stage === existing.stage && p.consecutive_correct > existing.consecutive_correct)) {
        progMap[p.verb_id] = {
          stage: p.stage ?? 1,
          consecutive_correct: p.consecutive_correct ?? 0,
          mastered: p.mastered ?? false,
          db_id: p.id,
          consecutive_incorrect: 0,
        }
      }
      if (p.mastered) masteredVerbIds.add(p.verb_id)
    }

    progressRef.current = progMap

    const activeVerbs = verbs.filter(v => !masteredVerbIds.has(v.id))
    const sess = buildSession(activeVerbs, progMap)

    setAllVerbs(verbs)
    setSession(sess)
    setCurrentIdx(0)
    setResults([])
    setTypedAnswer('')
    setMatchResult(null)

    if (!sess.length) {
      setPhase('empty')
      return
    }

    setQuestion(buildQuestion(sess[0], progMap))
    setPhase('question')
  }

  async function saveProgress(verbId) {
    const prog = progressRef.current[verbId]
    if (!prog) return
    const { stage, consecutive_correct, mastered, db_id } = prog

    if (db_id) {
      await supabase
        .from('user_verb_progress')
        .update({ stage, consecutive_correct, mastered: mastered ?? false })
        .eq('id', db_id)
    } else {
      const { data } = await supabase
        .from('user_verb_progress')
        .upsert(
          { user_id: user.id, verb_id: verbId, stage, consecutive_correct, mastered: mastered ?? false },
          { onConflict: 'user_id,verb_id' }
        )
        .select('id')
        .single()
      if (data) {
        progressRef.current[verbId] = { ...prog, db_id: data.id }
      }
    }
  }

  function handleAnswer(answer) {
    const result = fuzzyMatch(answer, question.correct)
    const isCorrect = result !== 'wrong'
    const verbId = question.verb.id
    const prog = progressRef.current[verbId] ?? { stage: 1, consecutive_correct: 0, mastered: false, db_id: null, consecutive_incorrect: 0 }

    let newProg
    if (isCorrect) {
      const newConsec = prog.consecutive_correct + 1
      if (newConsec >= 3 && prog.stage < 4) {
        // Graduation S1→S2, S2→S3, S3→S4
        newProg = { ...prog, stage: prog.stage + 1, consecutive_correct: 0, consecutive_incorrect: 0 }
      } else if (prog.stage === 4 && newConsec >= 5) {
        // Mastered
        newProg = { ...prog, consecutive_correct: newConsec, consecutive_incorrect: 0, mastered: true }
      } else {
        newProg = { ...prog, consecutive_correct: newConsec, consecutive_incorrect: 0 }
      }
    } else {
      const newConsecIncorrect = (prog.consecutive_incorrect ?? 0) + 1
      if (prog.stage === 2 && newConsecIncorrect >= 2) {
        // Regress S2 → S1
        newProg = { ...prog, stage: 1, consecutive_correct: 0, consecutive_incorrect: 0 }
      } else if ((prog.stage === 3 || prog.stage === 4) && newConsecIncorrect >= 2) {
        // Reset counter, stay at stage
        newProg = { ...prog, consecutive_correct: 0, consecutive_incorrect: 0 }
      } else if (prog.stage === 3 || prog.stage === 4) {
        // First wrong — forgiveness, preserve cc
        newProg = { ...prog, consecutive_incorrect: newConsecIncorrect }
      } else {
        newProg = { ...prog, consecutive_correct: 0, consecutive_incorrect: newConsecIncorrect }
      }
    }

    progressRef.current[verbId] = newProg
    saveProgress(verbId)
    setMatchResult(result)
    setResults(r => [...r, { verb: question.verb, correct: isCorrect, result, stage: question.stage }])
    setPhase('feedback')
  }

  function handleNext() {
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.length) {
      setPhase('summary')
      return
    }
    setCurrentIdx(nextIdx)
    setQuestion(buildQuestion(session[nextIdx], progressRef.current))
    setTypedAnswer('')
    setMatchResult(null)
    setPhase('question')
  }

  if (!category) {
    return (
      <div style={styles.page}>
        <NavBar />
        <p style={{ padding: '2rem' }}>Category not found.</p>
        <button style={styles.backLink} onClick={() => navigate('/verbs')}>← Back</button>
      </div>
    )
  }

  if (phase === 'loading') {
    return <div style={styles.page}><NavBar /><p style={styles.loadingMsg}>Loading…</p></div>
  }

  if (phase === 'error') {
    return (
      <div style={styles.page}>
        <NavBar />
        <main style={styles.main}>
          <p style={{ padding: '2rem', color: '#c00' }}>
            Could not load verbs. Make sure the verb migration has been run in Supabase.
          </p>
          <button style={styles.backLink} onClick={() => navigate('/verbs')}>← Back</button>
        </main>
      </div>
    )
  }

  if (phase === 'empty') {
    return (
      <div style={styles.page}>
        <NavBar />
        <main style={styles.main}>
          <button style={styles.backLink} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>
          <div style={styles.card}>
            <p style={{ margin: 0, color: '#555' }}>All verbs in this category are mastered. Great work!</p>
          </div>
        </main>
      </div>
    )
  }

  // ── Summary screen ──────────────────────────────────────────────────────────
  if (phase === 'summary') {
    const resultByVerbId = Object.fromEntries(results.map(r => [r.verb.id, r.result]))
    const masteredCount = allVerbs.filter(v => progressRef.current[v.id]?.mastered).length

    let pts = 0, maxPts = 0
    for (const v of allVerbs) {
      const prog = progressRef.current[v.id]
      maxPts += 4
      const isMastered = prog?.mastered || ((prog?.stage ?? 1) === 4 && (prog?.consecutive_correct ?? 0) >= 5)
      if (isMastered) pts += 4
      else if ((prog?.stage ?? 1) >= 4) pts += 3
      else if ((prog?.stage ?? 1) >= 3) pts += 2
      else if ((prog?.stage ?? 1) >= 2) pts += 1
    }
    const progressPct = maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0

    return (
      <div style={styles.page}>
        <NavBar />
        <main style={{ ...styles.main, maxWidth: '820px' }}>
          <div style={styles.summaryThemeCard}>
            <div style={styles.cardLeft}>
              <span style={styles.themeTitle}>{category.title}</span>
              <span style={styles.themeSubtitle}>
                {allVerbs.length} verbs · {masteredCount} mastered
              </span>
            </div>
            <div style={styles.cardDivider} />
            <div style={styles.cardRight}>
              <ProgressRing pct={progressPct} />
            </div>
          </div>

          <div style={{ ...styles.tableWrap, maxHeight: '260px', overflowY: 'scroll' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.thLeft, textAlign: 'center', position: 'sticky', top: 0 }}>Infinitive</th>
                  <th style={{ ...styles.thLeft, textAlign: 'center', position: 'sticky', top: 0 }}>English</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>S1</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>S2</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>S3</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>S4</th>
                </tr>
              </thead>
              <tbody>
                {session.map(verb => {
                  const prog = progressRef.current[verb.id]
                  const stage = prog?.stage ?? 1
                  const consec = prog?.consecutive_correct ?? 0
                  const isMastered = prog?.mastered ?? false
                  const s1done = stage >= 2 || isMastered
                  const s2done = stage >= 3 || isMastered
                  const s3done = stage >= 4 || isMastered
                  const s4done = isMastered || (stage === 4 && consec >= 5)
                  const wordResult = resultByVerbId[verb.id]
                  const textColor = wordResult === 'exact' ? '#16a34a' : wordResult === 'close' ? '#d97706' : wordResult === 'wrong' ? '#dc2626' : '#333'
                  return (
                    <tr key={verb.id} style={styles.tableRow}>
                      <td style={{ ...styles.tdEn, color: textColor }}>{verb.spanish_infinitive}</td>
                      <td style={{ ...styles.tdEs, color: textColor }}>{verb.english}</td>
                      <StageCell done={s1done} />
                      <StageCell done={s2done} />
                      <StageCell done={s3done} />
                      <StageCell done={s4done} />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={styles.summaryActions}>
            <button style={{ ...styles.primaryBtn, width: '100%', textAlign: 'center' }} onClick={loadQuiz}>
              Play again
            </button>
            <button style={styles.backToThemesBtn} onClick={() => navigate('/verbs')}>
              ← Back to Verb Trainer
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ── Question screen ─────────────────────────────────────────────────────────
  const currentProg = progressRef.current[question?.verb?.id]

  return (
    <div style={styles.page}>
      <NavBar />
      <main style={styles.main}>
        <div style={styles.progressRow}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${(currentIdx / session.length) * 100}%` }} />
          </div>
          <span style={styles.progressLabel}>{currentIdx + 1} / {session.length}</span>
        </div>

        <div style={styles.card}>
          <p style={styles.promptLabel}>{question.promptLabel}</p>
          <p style={styles.word}>{question.prompt}</p>
          <MasteryBar
            stage={currentProg?.stage ?? 1}
            consecutiveCorrect={currentProg?.consecutive_correct ?? 0}
            mastered={currentProg?.mastered ?? false}
          />

          <div style={styles.typedArea}>
            <input
              ref={inputRef}
              style={styles.typedInput}
              type="text"
              value={typedAnswer}
              onChange={e => setTypedAnswer(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && phase === 'question') {
                  handleAnswer(typedAnswer)
                }
              }}
              disabled={phase === 'feedback'}
              placeholder={question.placeholder}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-form-type="other"
            />
            {phase === 'question' && (
              <button
                style={{ ...styles.typedBtn, backgroundColor: typedAnswer.trim() ? '#16a34a' : '#f59e0b', color: '#fff' }}
                onClick={() => handleAnswer(typedAnswer)}
              >
                {typedAnswer.trim() ? 'Check' : 'Pass'}
              </button>
            )}
          </div>

          {phase === 'feedback' && (
            <div style={{
              ...styles.feedbackBanner,
              backgroundColor: matchResult === 'exact' ? '#dcfce7' : matchResult === 'close' ? '#fef3c7' : '#fee2e2',
            }}>
              <span style={{
                color: matchResult === 'exact' ? '#16a34a' : matchResult === 'close' ? '#d97706' : '#dc2626',
                fontWeight: 600,
              }}>
                {matchResult === 'exact' ? 'Correct!' : matchResult === 'close' ? `Close — ${question.correct}` : `Incorrect — ${question.correct}`}
              </span>
              <button style={styles.nextBtn} onClick={handleNext}>
                {currentIdx + 1 >= session.length ? 'Finish' : 'Next →'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

const styles = {
  page: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: '#f8f8f6',
    fontFamily: 'system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
  },
  main: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '0.5rem 1.5rem 2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    width: '100%',
    boxSizing: 'border-box',
    overflowY: 'auto',
    flex: 1,
    WebkitOverflowScrolling: 'touch',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.25rem 0',
  },
  backLink: {
    padding: '0.35rem 0',
    fontSize: '0.875rem',
    color: '#555',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  loadingMsg: {
    padding: '3rem 2rem',
    textAlign: 'center',
    color: '#888',
  },
  progressBar: {
    flex: 1,
    height: '6px',
    backgroundColor: '#e5e5e5',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    margin: 0,
    fontSize: '0.8rem',
    color: '#888',
    flexShrink: 0,
    minWidth: '32px',
    textAlign: 'right',
  },
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  promptLabel: {
    margin: 0,
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  word: {
    margin: 0,
    fontSize: '1.8rem',
    fontWeight: 700,
    color: '#111',
  },
  typedArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  typedInput: {
    flex: 1,
    padding: '0.75rem 1rem',
    fontSize: '1rem',
    border: '1px solid #ccc',
    borderRadius: '8px',
    outline: 'none',
  },
  typedBtn: {
    padding: '0.75rem 1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
  },
  feedbackBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.85rem 1rem',
    borderRadius: '8px',
  },
  nextBtn: {
    padding: '0.5rem 1.25rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  primaryBtn: {
    padding: '0.75rem 1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  summaryThemeCard: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    height: '72px',
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  cardLeft: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '2px',
    padding: '0.35rem 0.875rem',
    minWidth: 0,
  },
  cardDivider: {
    width: '1px',
    flexShrink: 0,
    backgroundColor: '#f0f0f0',
  },
  cardRight: {
    width: '56px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: '0 3px 3px 0',
  },
  themeTitle: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#111',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  themeSubtitle: {
    fontSize: '0.68rem',
    color: '#bbb',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  summaryActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    paddingTop: '0.25rem',
  },
  backToThemesBtn: {
    padding: '0.75rem 1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'center',
  },
  tableWrap: {
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.9rem',
    tableLayout: 'fixed',
  },
  thLeft: {
    padding: '0.65rem 0.75rem',
    textAlign: 'left',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
  },
  thCenter: {
    padding: '0.5rem 0.25rem',
    textAlign: 'center',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '32px',
  },
  tableRow: {
    borderBottom: '1px solid #f5f5f5',
  },
  tdEn: {
    padding: '0.6rem 0.75rem',
    color: '#333',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tdEs: {
    padding: '0.6rem 0.75rem',
    fontWeight: 500,
    color: '#111',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stageCell: {
    padding: '0.6rem 0.25rem',
    textAlign: 'center',
  },
}
