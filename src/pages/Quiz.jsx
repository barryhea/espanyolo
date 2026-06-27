import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { VOCAB_THEMES } from '../utils/courseData'
import { fetchVocabQuestionCount } from '../utils/userSettings'
import { fuzzyMatch, splitAnswers, matchMulti } from '../utils/answerMatch'
import NavBar from '../components/NavBar'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickDistractors(word, allWords, count = 3) {
  const pool = shuffle(allWords.filter(w => w.id !== word.id))
  return pool.slice(0, count).map(w => w.english)
}

// Build a normal theme session of exactly `count` questions, capped at the
// number of available (visible, non-mastered) words — never repeating a word.
// Stage-1 words are served first, then any higher-stage words to fill the count.
function buildSession(words, progressMap, count) {
  const target = Math.min(Math.max(1, count), words.length)
  const s1 = words.filter(w => (progressMap[w.id]?.stage ?? 1) === 1)
  const rest = words.filter(w => (progressMap[w.id]?.stage ?? 1) !== 1)
  return [...shuffle(s1), ...shuffle(rest)].slice(0, target)
}

function buildQuestion(word, allWords, progressMap, forcedStage = null) {
  const stage = forcedStage ?? (progressMap[word.id]?.stage ?? 1)
  if (stage === 1 && allWords.length >= 4) {
    const options = shuffle([word.english, ...pickDistractors(word, allWords)])
    return { type: 'mc', word, options, prompt: word.spanish, promptLabel: 'What is the English for:', correct: word.english, stage }
  }
  if (stage === 2) {
    return { type: 'typed', word, prompt: word.spanish, promptLabel: 'What is the English for:', correct: word.english, answers: splitAnswers(word.english), placeholder: 'Type the English word…', stage }
  }
  return { type: 'typed', word, prompt: word.english, promptLabel: 'What is the Spanish for:', correct: word.spanish, answers: splitAnswers(word.spanish), placeholder: 'Type the Spanish word…', stage }
}

function EyeSlashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
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

function MasteryBar({ stage, consecutiveCorrect, mastered }) {
  const s1Filled = mastered ? 3 : stage >= 2 ? 3 : Math.min(consecutiveCorrect, 3)
  const s2Filled = mastered ? 3 : stage >= 3 ? 3 : stage === 2 ? Math.min(consecutiveCorrect, 3) : 0
  const s3Filled = mastered ? 5 : stage === 3 ? Math.min(consecutiveCorrect, 5) : 0
  const BRONZE = '#cd7f32', SILVER = '#a8a9ad', GOLD = '#f5c518'
  const segs = [
    ...Array(3).fill(null).map((_, i) => ({ filled: i < s1Filled, color: BRONZE })),
    ...Array(3).fill(null).map((_, i) => ({ filled: i < s2Filled, color: SILVER })),
    ...Array(5).fill(null).map((_, i) => ({ filled: i < s3Filled, color: GOLD })),
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Word Mastery
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

export default function Quiz() {
  const { themeId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const mode = location.state?.mode === 'struggle' ? 'struggle' : 'normal'

  const theme = VOCAB_THEMES.find(t => t.id === Number(themeId))
  const progressRef = useRef({})
  const inputRef = useRef(null)

  // Struggle-mode session state (top-10 most-missed words drilled S1→S2→S3)
  const strugglePoolRef = useRef([])        // pending { wordId, stage } items (eligible, not in-flight)
  const struggleAttemptsRef = useRef({})    // { [wordId]: total attempts asked this session (cap 3) }
  const struggleRemainingRef = useRef(new Set()) // wordIds not yet fully resolved
  const struggleOutcomeRef = useRef({})     // { [wordId]: { [stage]: 'pass' | 'fail' } }
  const struggleWordsRef = useRef([])       // the selected word objects (for summary)
  const struggleAllWordsRef = useRef([])    // full theme word list (for MC distractors)
  const struggleCurrentRef = useRef(null)   // the in-flight { wordId, stage }

  const [phase, setPhase] = useState('loading')
  const [allWords, setAllWords] = useState([])
  const [session, setSession] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [question, setQuestion] = useState(null)
  const [selectedOption, setSelectedOption] = useState(null)
  const [typedAnswers, setTypedAnswers] = useState([''])
  const [matchResult, setMatchResult] = useState(null)
  const [results, setResults] = useState([])
  const [hiddenWords, setHiddenWords] = useState(new Set())
  const [struggleTotal, setStruggleTotal] = useState(0)

  useEffect(() => {
    if (theme && user) {
      if (mode === 'struggle') loadStruggleQuiz()
      else loadQuiz()
    }
  }, [theme?.id, user?.id, mode])

  useEffect(() => {
    if (question?.type === 'typed') inputRef.current?.focus({ preventScroll: true })
  }, [question])

  useEffect(() => {
    if (phase === 'feedback' && matchResult === 'wrong' && question?.type === 'typed') {
      inputRef.current?.focus({ preventScroll: true })
    }
  }, [phase, matchResult])

  async function ensureProfile() {
    await supabase
      .from('profiles')
      .upsert({ id: user.id, email: user.email }, { onConflict: 'id' })
  }

  async function loadQuiz() {
    setPhase('loading')
    await ensureProfile()
    const { data: words, error } = await supabase
      .from('words')
      .select('id, english, spanish')
      .eq('theme', theme.title)

    if (error || !words?.length) {
      setPhase('error')
      return
    }

    const wordIds = words.map(w => w.id)
    const { data: progress } = await supabase
      .from('user_word_progress')
      .select('id, word_id, stage, consecutive_correct, hidden, mastered, s1_incorrect, s2_incorrect, s3_incorrect, s1_resets, s2_resets, s3_resets, total_incorrect, recent_attempts')
      .eq('user_id', user.id)
      .in('word_id', wordIds)

    const progMap = {}
    const hiddenWordIds = new Set()
    const masteredWordIds = new Set()
    for (const p of progress ?? []) {
      const existing = progMap[p.word_id]
      if (!existing || p.stage > existing.stage ||
          (p.stage === existing.stage && p.consecutive_correct > existing.consecutive_correct)) {
        progMap[p.word_id] = {
          stage: p.stage ?? 1,
          consecutive_correct: p.consecutive_correct ?? 0,
          hidden: p.hidden ?? false,
          mastered: p.mastered ?? false,
          db_id: p.id,
          consecutive_incorrect: 0,
          s1_incorrect: p.s1_incorrect ?? 0,
          s2_incorrect: p.s2_incorrect ?? 0,
          s3_incorrect: p.s3_incorrect ?? 0,
          s1_resets: p.s1_resets ?? 0,
          s2_resets: p.s2_resets ?? 0,
          s3_resets: p.s3_resets ?? 0,
          total_incorrect: p.total_incorrect ?? 0,
          recent_attempts: Array.isArray(p.recent_attempts) ? p.recent_attempts : [],
        }
      }
      if (p.hidden) hiddenWordIds.add(p.word_id)
      if (p.mastered) masteredWordIds.add(p.word_id)
    }
    console.log('[loadQuiz] progress loaded:', Object.fromEntries(
      Object.entries(progMap).map(([id, p]) => [id, `S${p.stage} C${p.consecutive_correct} M${p.mastered}`])
    ))
    progressRef.current = progMap
    setHiddenWords(hiddenWordIds)

    const visibleWords = words.filter(w => !hiddenWordIds.has(w.id) && !masteredWordIds.has(w.id))
    const questionCount = await fetchVocabQuestionCount(user.id)
    const sess = buildSession(visibleWords, progMap, questionCount)

    setAllWords(words)
    setSession(sess)
    setCurrentIdx(0)
    setResults([])
    setSelectedOption(null)
    setMatchResult(null)

    if (!sess.length) {
      setPhase('empty')
      return
    }

    const q0 = buildQuestion(sess[0], words, progMap)
    setTypedAnswers(Array(Math.max(1, q0.answers?.length ?? 1)).fill(''))
    setQuestion(q0)
    setPhase('question')
  }

  // ---- Top 10 Struggle Quiz (theme-scoped) ----------------------------------
  // Picks the 10 words with the highest total_incorrect in this theme. Each word
  // must pass S1 before S2 is eligible and S2 before S3, but the question order
  // is fully randomised across every currently-eligible (word, stage) item.
  // Wrong answers re-queue the same stage (max 2 retries per stage per word).
  // The session is read-only — it does not mutate stored word progress.
  async function loadStruggleQuiz() {
    setPhase('loading')
    await ensureProfile()
    const { data: words, error } = await supabase
      .from('words')
      .select('id, english, spanish')
      .eq('theme', theme.title)

    if (error || !words?.length) {
      setPhase('error')
      return
    }

    const wordIds = words.map(w => w.id)
    const { data: progress } = await supabase
      .from('user_word_progress')
      .select('word_id, total_incorrect')
      .eq('user_id', user.id)
      .in('word_id', wordIds)

    const incByWord = {}
    for (const p of progress ?? []) {
      const v = p.total_incorrect ?? 0
      if (!(p.word_id in incByWord) || v > incByWord[p.word_id]) incByWord[p.word_id] = v
    }

    const top = words
      .filter(w => (incByWord[w.id] ?? 0) > 0)
      .sort((a, b) => (incByWord[b.id] ?? 0) - (incByWord[a.id] ?? 0))
      .slice(0, 10)

    struggleAllWordsRef.current = words
    struggleWordsRef.current = top
    strugglePoolRef.current = shuffle(top.map(w => ({ wordId: w.id, stage: 1 })))
    struggleAttemptsRef.current = {}
    struggleOutcomeRef.current = {}
    struggleRemainingRef.current = new Set(top.map(w => w.id))
    struggleCurrentRef.current = null

    setAllWords(words)
    setResults([])
    setSelectedOption(null)
    setMatchResult(null)
    setStruggleTotal(top.length)

    if (top.length === 0) {
      setPhase('empty')
      return
    }

    presentNextStruggle()
  }

  function presentNextStruggle() {
    const pool = strugglePoolRef.current
    if (pool.length === 0) {
      struggleCurrentRef.current = null
      setPhase('summary')
      return
    }
    const idx = Math.floor(Math.random() * pool.length)
    const [item] = pool.splice(idx, 1)
    struggleCurrentRef.current = item
    const word = struggleAllWordsRef.current.find(w => w.id === item.wordId)
    const q = buildQuestion(word, struggleAllWordsRef.current, {}, item.stage)
    setSelectedOption(null)
    setTypedAnswers(Array(Math.max(1, q.answers?.length ?? 1)).fill(''))
    setMatchResult(null)
    setQuestion(q)
    setPhase('question')
  }

  function handleStruggleAnswer(answer) {
    const result = question.type === 'typed' ? evalTyped() : fuzzyMatch(answer, question.correct)
    const isCorrect = result !== 'wrong'
    const { wordId, stage } = struggleCurrentRef.current

    if (!struggleOutcomeRef.current[wordId]) struggleOutcomeRef.current[wordId] = {}

    // A word may be asked at most 3 times per session across all stages combined.
    const attempts = (struggleAttemptsRef.current[wordId] = (struggleAttemptsRef.current[wordId] ?? 0) + 1)
    const attemptsLeft = attempts < 3

    if (isCorrect) {
      struggleOutcomeRef.current[wordId][stage] = 'pass'
      if (stage < 3 && attemptsLeft) {
        strugglePoolRef.current.push({ wordId, stage: stage + 1 }) // next stage now eligible
      } else {
        struggleRemainingRef.current.delete(wordId) // passed S3, or out of attempts
      }
    } else {
      if (attemptsLeft) {
        strugglePoolRef.current.push({ wordId, stage }) // re-queue same stage, attempt still counted
      } else {
        struggleOutcomeRef.current[wordId][stage] = 'fail' // 3 attempts used up
        struggleRemainingRef.current.delete(wordId)
      }
    }

    setMatchResult(result)
    setSelectedOption(answer)
    setResults(r => [...r, { word: question.word, correct: isCorrect, result, stage }])
    setPhase('feedback')
    if (result === 'wrong' && question.type === 'typed') {
      setTypedAnswers(Array(Math.max(1, question.answers?.length ?? 1)).fill(''))
    }
  }

  async function saveProgress(wordId) {
    const prog = progressRef.current[wordId]
    if (!prog) return
    const { stage, consecutive_correct, hidden, mastered, db_id, s1_incorrect, s2_incorrect, s3_incorrect, s1_resets, s2_resets, s3_resets, total_incorrect, recent_attempts } = prog
    console.log('[saveProgress]', { wordId, stage, consecutive_correct, mastered, db_id: db_id ?? 'none' })
    const trackingPayload = {
      s1_incorrect: s1_incorrect ?? 0, s2_incorrect: s2_incorrect ?? 0, s3_incorrect: s3_incorrect ?? 0,
      s1_resets: s1_resets ?? 0, s2_resets: s2_resets ?? 0, s3_resets: s3_resets ?? 0,
      total_incorrect: total_incorrect ?? 0,
      recent_attempts: Array.isArray(recent_attempts) ? recent_attempts : [],
    }

    if (db_id) {
      const { error } = await supabase
        .from('user_word_progress')
        .update({ stage, consecutive_correct, hidden: hidden ?? false, mastered: mastered ?? false, ...trackingPayload })
        .eq('id', db_id)
      if (error) console.error('[saveProgress] UPDATE error', error)
      else console.log('[saveProgress] UPDATE ok → stage', stage, 'consec', consecutive_correct, 'mastered', mastered)
    } else {
      const { data, error } = await supabase
        .from('user_word_progress')
        .insert({ user_id: user.id, word_id: wordId, stage, consecutive_correct, hidden: hidden ?? false, mastered: mastered ?? false, ...trackingPayload })
        .select('id')
        .single()
      if (error) console.error('[saveProgress] INSERT error', error)
      else {
        console.log('[saveProgress] INSERT ok → id', data.id, 'stage', stage, 'consec', consecutive_correct)
        progressRef.current[wordId] = { ...prog, db_id: data.id }
      }
    }
  }

  async function toggleHidden(wordId) {
    const willBeHidden = !hiddenWords.has(wordId)

    setHiddenWords(prev => {
      const next = new Set(prev)
      willBeHidden ? next.add(wordId) : next.delete(wordId)
      return next
    })

    const prog = progressRef.current[wordId]
    progressRef.current[wordId] = { ...(prog ?? { stage: 1, consecutive_correct: 0, mastered: false, db_id: null }), hidden: willBeHidden }

    const currentProg = progressRef.current[wordId]
    const { data } = await supabase
      .from('user_word_progress')
      .upsert(
        {
          user_id: user.id,
          word_id: wordId,
          stage: currentProg?.stage ?? 1,
          consecutive_correct: currentProg?.consecutive_correct ?? 0,
          hidden: willBeHidden,
          mastered: currentProg?.mastered ?? false,
          s1_incorrect: currentProg?.s1_incorrect ?? 0,
          s2_incorrect: currentProg?.s2_incorrect ?? 0,
          s3_incorrect: currentProg?.s3_incorrect ?? 0,
          s1_resets: currentProg?.s1_resets ?? 0,
          s2_resets: currentProg?.s2_resets ?? 0,
          s3_resets: currentProg?.s3_resets ?? 0,
          total_incorrect: currentProg?.total_incorrect ?? 0,
        },
        { onConflict: 'user_id,word_id' }
      )
      .select('id')
      .single()
    if (data) progressRef.current[wordId] = { ...progressRef.current[wordId], db_id: data.id }
  }

  function evalTyped() {
    const segs = question.answers ?? [question.correct]
    if (segs.length > 1) return matchMulti(typedAnswers, segs)
    return fuzzyMatch(typedAnswers[0] ?? '', question.correct)
  }

  function handleAnswer(answer) {
    if (mode === 'struggle') return handleStruggleAnswer(answer)
    const result = question.type === 'typed' ? evalTyped() : fuzzyMatch(answer, question.correct)
    const isCorrect = result !== 'wrong'
    const wordId = question.word.id
    const prog = progressRef.current[wordId] ?? { stage: 1, consecutive_correct: 0, hidden: false, db_id: null }

    let newProg
    if (isCorrect) {
      const newConsec = prog.consecutive_correct + 1
      const threshold = 3
      if (newConsec >= threshold && prog.stage < 3) {
        newProg = { ...prog, stage: prog.stage + 1, consecutive_correct: 0, consecutive_incorrect: 0 }
        console.log(`[handleAnswer] word ${wordId} GRADUATED S${prog.stage} → S${prog.stage + 1}`)
      } else if (prog.stage === 3 && newConsec >= 5) {
        newProg = { ...prog, consecutive_correct: newConsec, consecutive_incorrect: 0, mastered: true }
        console.log(`[handleAnswer] word ${wordId} MASTERED at S3 (${newConsec} consecutive correct)`)
      } else {
        newProg = { ...prog, consecutive_correct: newConsec, consecutive_incorrect: 0 }
        console.log(`[handleAnswer] word ${wordId} correct — S${prog.stage} consec ${prog.consecutive_correct} → ${newConsec}`)
      }
    } else {
      const newConsecIncorrect = (prog.consecutive_incorrect ?? 0) + 1
      const incorrectKey = prog.stage === 1 ? 's1_incorrect' : prog.stage === 2 ? 's2_incorrect' : 's3_incorrect'
      const newIncorrect = (prog[incorrectKey] ?? 0) + 1
      const newTotal = (prog.total_incorrect ?? 0) + 1
      if (prog.stage === 2 && newConsecIncorrect >= 3) {
        newProg = { ...prog, stage: 1, consecutive_correct: 0, consecutive_incorrect: 0, [incorrectKey]: newIncorrect, s2_resets: (prog.s2_resets ?? 0) + 1, total_incorrect: newTotal }
        console.log(`[handleAnswer] word ${wordId} REGRESSED S2 → S1 (3 consecutive incorrect)`)
      } else if (prog.stage === 3 && newConsecIncorrect >= 2) {
        newProg = { ...prog, consecutive_correct: 0, consecutive_incorrect: 0, [incorrectKey]: newIncorrect, s3_resets: (prog.s3_resets ?? 0) + 1, total_incorrect: newTotal }
        console.log(`[handleAnswer] word ${wordId} S3 counter reset (2 consecutive incorrect)`)
      } else if (prog.stage === 3) {
        newProg = { ...prog, consecutive_incorrect: newConsecIncorrect, [incorrectKey]: newIncorrect, total_incorrect: newTotal }
        console.log(`[handleAnswer] word ${wordId} S3 forgiveness — cc preserved at ${prog.consecutive_correct}, ci: ${newConsecIncorrect}`)
      } else {
        newProg = { ...prog, consecutive_correct: 0, consecutive_incorrect: newConsecIncorrect, [incorrectKey]: newIncorrect, total_incorrect: newTotal }
        console.log(`[handleAnswer] word ${wordId} incorrect — S${prog.stage} consec_correct reset, consec_incorrect: ${newConsecIncorrect}`)
      }
    }

    newProg.recent_attempts = [...(prog.recent_attempts ?? []), isCorrect ? 1 : 0].slice(-10)
    progressRef.current[wordId] = newProg
    saveProgress(wordId)
    setMatchResult(result)
    setSelectedOption(answer)
    setResults(r => [...r, { word: question.word, correct: isCorrect, result, stage: question.stage }])
    setPhase('feedback')
    if (result === 'wrong' && question.type === 'typed') {
      setTypedAnswers(Array(Math.max(1, question.answers?.length ?? 1)).fill(''))
    }
  }

  function handleNext() {
    if (mode === 'struggle') { presentNextStruggle(); return }
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.length) {
      setPhase('summary')
      return
    }
    setCurrentIdx(nextIdx)
    const q = buildQuestion(session[nextIdx], allWords, progressRef.current)
    setQuestion(q)
    setSelectedOption(null)
    setTypedAnswers(Array(Math.max(1, q.answers?.length ?? 1)).fill(''))
    setMatchResult(null)
    setPhase('question')
  }

  if (!theme) {
    return (
      <div style={styles.page}>
        <NavBar />
        <p style={{ padding: '2rem' }}>Theme not found.</p>
        <button style={styles.backLink} onClick={() => navigate('/vocabulary')}>← Back</button>
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
        <p style={{ padding: '2rem', color: '#c00' }}>
          Could not load words. Make sure both migrations have been run in Supabase.
        </p>
        <button style={styles.backLink} onClick={() => navigate('/vocabulary')}>← Back</button>
      </div>
    )
  }

  if (phase === 'empty') {
    return (
      <div style={styles.page}>
        <NavBar />
        <main style={styles.main}>
          <button style={styles.backLink} onClick={() => navigate('/vocabulary')}>← Back to themes</button>
          <div style={styles.card}>
            <p style={{ margin: 0, color: '#555' }}>
              {mode === 'struggle'
                ? 'No struggle words in this theme yet — you haven’t answered any words incorrectly here.'
                : 'All words in this theme are hidden or mastered. Unhide some words to continue.'}
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'summary' && mode === 'struggle') {
    const words = struggleWordsRef.current
    const passedWords = words.filter(w => struggleOutcomeRef.current[w.id]?.[3] === 'pass').length
    const cell = (state) => {
      if (state === 'pass') return <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>
      if (state === 'fail') return <span style={{ color: '#dc2626', fontWeight: 700 }}>✗</span>
      return <span style={{ color: '#d1d5db' }}>–</span>
    }
    return (
      <div style={styles.page}>
        <NavBar />
        <main style={{ ...styles.main, maxWidth: '820px' }}>
          <div style={styles.summaryThemeCard}>
            <div style={styles.cardLeft}>
              <span style={styles.themeTitle}>{theme.title} · Struggle Quiz</span>
              <span style={styles.themeSubtitle}>
                {words.length} struggle words · {passedWords} cleared all stages
              </span>
            </div>
          </div>

          <div className="results-table-wrap" style={{ ...styles.tableWrap, maxHeight: '320px', overflowY: 'scroll' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.thLeft, textAlign: 'center', position: 'sticky', top: 0 }}>English</th>
                  <th style={{ ...styles.thLeft, textAlign: 'center', position: 'sticky', top: 0 }}>Spanish</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>S1</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>S2</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>S3</th>
                </tr>
              </thead>
              <tbody>
                {words.map(word => {
                  const o = struggleOutcomeRef.current[word.id] ?? {}
                  return (
                    <tr key={word.id} style={styles.tableRow}>
                      <td style={styles.tdEn}>{word.english}</td>
                      <td style={styles.tdEs}>{word.spanish}</td>
                      <td style={styles.stageCell}>{cell(o[1])}</td>
                      <td style={styles.stageCell}>{cell(o[2])}</td>
                      <td style={styles.stageCell}>{cell(o[3])}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={styles.summaryActions}>
            <button style={{ ...styles.primaryBtn, width: '100%', alignSelf: 'auto', textAlign: 'center' }} onClick={loadStruggleQuiz}>
              Play again
            </button>
            <button style={styles.backToThemesBtn} onClick={() => navigate('/vocabulary')}>
              ← Back to themes
            </button>
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'summary') {
    const resultByWordId = Object.fromEntries(results.map(r => [r.word.id, r.result]))
    const masteredCount = allWords.filter(w => progressRef.current[w.id]?.mastered).length
    let pts = 0, maxPts = 0
    for (const w of allWords) {
      const prog = progressRef.current[w.id]
      if (prog?.hidden) continue
      maxPts += 3
      const isMastered = prog?.mastered || ((prog?.stage ?? 1) === 3 && (prog?.consecutive_correct ?? 0) >= 5)
      if (isMastered) pts += 3
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
              <span style={styles.themeTitle}>{theme.title}</span>
              <span style={styles.themeSubtitle}>
                {allWords.length} words · {masteredCount} mastered · {hiddenWords.size} hidden · {allWords.length - masteredCount - hiddenWords.size} remaining
              </span>
            </div>
            <div style={styles.cardDivider} />
            <div style={styles.cardRight}>
              <ProgressRing pct={progressPct} />
            </div>
          </div>

          <div className="results-table-wrap" style={{ ...styles.tableWrap, maxHeight: '260px', overflowY: 'scroll' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.thLeft, textAlign: 'center', position: 'sticky', top: 0 }}>English</th>
                  <th style={{ ...styles.thLeft, textAlign: 'center', position: 'sticky', top: 0 }}>Spanish</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>S1</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>S2</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>S3</th>
                  <th style={{ ...styles.thRight, position: 'sticky', top: 0 }}></th>
                </tr>
              </thead>
              <tbody>
                {session.map(word => {
                  const prog = progressRef.current[word.id]
                  const stage = prog?.stage ?? 1
                  const consec = prog?.consecutive_correct ?? 0
                  const isMastered = prog?.mastered ?? false
                  const s1done = stage >= 2 || isMastered
                  const s2done = stage >= 3 || isMastered
                  const s3done = isMastered || (stage === 3 && consec >= 5)
                  const isHidden = hiddenWords.has(word.id)
                  const wordResult = resultByWordId[word.id]
                  const textColor = wordResult === 'exact' ? '#16a34a' : wordResult === 'close' ? '#d97706' : wordResult === 'wrong' ? '#dc2626' : '#333'
                  return (
                    <tr key={word.id} style={styles.tableRow}>
                      <td style={{ ...styles.tdEn, color: textColor }}>{word.english}</td>
                      <td style={{ ...styles.tdEs, color: textColor }}>{word.spanish}</td>
                      <StageCell done={s1done} />
                      <StageCell done={s2done} />
                      <StageCell done={s3done} />
                      <td style={styles.tdHide}>
                        <button
                          style={{ ...styles.hideBtn, color: isHidden ? '#3b82f6' : '#bbb' }}
                          onClick={() => toggleHidden(word.id)}
                          title={isHidden ? 'Unhide this word' : 'Hide this word'}
                        >
                          {isHidden ? <EyeIcon /> : <EyeSlashIcon />}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={styles.summaryActions}>
            <button style={{ ...styles.primaryBtn, width: '100%', alignSelf: 'auto', textAlign: 'center' }} onClick={loadQuiz}>
              Play again
            </button>
            <div style={styles.summaryBtnRow}>
              <button style={{ ...styles.secondaryBtn, flex: 1 }} onClick={() => navigate('/vocabulary', { state: { openThemeId: theme.id, openView: 'progress' } })}>
                Progress
              </button>
              <button style={{ ...styles.secondaryBtn, flex: 1 }} onClick={() => navigate('/vocabulary', { state: { openThemeId: theme.id, openView: 'hidden' } })}>
                Hidden Words
              </button>
            </div>
            <button style={styles.backToThemesBtn} onClick={() => navigate('/vocabulary')}>
              ← Back to themes
            </button>
          </div>
        </main>
      </div>
    )
  }

  const currentProg = progressRef.current[question?.word?.id]
  // Struggle progress: X = questions answered, total = answered + remaining plan.
  // Each pending {word, stage} item still needs (4 - stage) questions to finish
  // that word (current stage + every higher stage). The in-flight question is
  // counted only while it is still unanswered (the 'question' phase); once
  // answered its outcome is already reflected back in the pool.
  const struggleAnswered = results.length
  // Questions still owed for a pending {word, stage}: bounded by both the stages
  // left to clear (4 - stage) and the word's remaining attempts (3 - used).
  const struggleItemRemaining = (it) =>
    Math.min(4 - it.stage, 3 - (struggleAttemptsRef.current[it.wordId] ?? 0))
  const strugglePlannedRemaining =
    strugglePoolRef.current.reduce((n, it) => n + struggleItemRemaining(it), 0) +
    (phase === 'question' && struggleCurrentRef.current ? struggleItemRemaining(struggleCurrentRef.current) : 0)
  const struggleQTotal = struggleAnswered + strugglePlannedRemaining
  const progressPct = mode === 'struggle'
    ? (struggleQTotal > 0 ? (struggleAnswered / struggleQTotal) * 100 : 0)
    : (currentIdx / session.length) * 100
  const progressLabel = mode === 'struggle'
    ? `${struggleAnswered} / ${struggleQTotal}`
    : `${currentIdx + 1} / ${session.length}`

  return (
    <div style={styles.page}>
      <NavBar />
      <main style={styles.main}>
        <div style={styles.progressRow}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progressPct}%` }} />
          </div>
          <span style={styles.progressLabel}>{progressLabel}</span>
        </div>

        <div style={styles.card}>
          <p style={styles.word}>{question.prompt}</p>
          <MasteryBar
            stage={mode === 'struggle' ? (question?.stage ?? 1) : (currentProg?.stage ?? 1)}
            consecutiveCorrect={mode === 'struggle' ? 0 : (currentProg?.consecutive_correct ?? 0)}
            mastered={mode === 'struggle' ? false : (currentProg?.mastered ?? false)}
          />

          {question.type === 'mc' && (
            <div style={styles.optionGrid}>
              {question.options.map(opt => {
                let bg = '#fff'
                if (phase === 'feedback') {
                  if (opt === question.correct) bg = '#dcfce7'
                  else if (opt === selectedOption) bg = '#fee2e2'
                }
                return (
                  <button
                    key={opt}
                    style={{ ...styles.optionBtn, backgroundColor: bg }}
                    onClick={() => phase === 'question' && handleAnswer(opt)}
                    disabled={phase === 'feedback'}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          )}

          {question.type === 'typed' && (() => {
            const segs = question.answers ?? [question.correct]
            const isMulti = segs.length > 1
            const anyTyped = typedAnswers.some(t => t.trim())
            return (
              <div style={styles.typedArea}>
                {segs.map((seg, i) => (
                  <input
                    key={i}
                    ref={i === 0 ? inputRef : null}
                    style={{
                      ...styles.typedInput,
                      ...(phase === 'feedback' && matchResult === 'wrong' ? { borderColor: '#3b82f6', borderWidth: 2 } : {}),
                    }}
                    type="text"
                    value={typedAnswers[i] ?? ''}
                    onChange={e => setTypedAnswers(prev => {
                      const next = [...prev]
                      next[i] = e.target.value
                      return next
                    })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (phase === 'question') {
                          handleAnswer(typedAnswers[0])
                        } else if (phase === 'feedback' && matchResult === 'wrong' &&
                                   evalTyped() !== 'wrong') {
                          handleNext()
                        }
                      }
                    }}
                    disabled={phase === 'feedback' && matchResult !== 'wrong'}
                    placeholder={
                      phase === 'feedback' && matchResult === 'wrong'
                        ? 'Type the correct answer to continue…'
                        : isMulti ? `Answer ${i + 1}…` : question.placeholder
                    }
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-form-type="other"
                  />
                ))}
                {phase === 'question' && (
                  <button
                    style={{ ...styles.typedBtn, backgroundColor: anyTyped ? '#16a34a' : '#f59e0b', color: '#fff' }}
                    onClick={() => handleAnswer(typedAnswers[0])}
                  >
                    {anyTyped ? 'Check' : 'Pass'}
                  </button>
                )}
              </div>
            )
          })()}

          {phase === 'feedback' && (() => {
            const confirmOk = question.type !== 'typed' || matchResult !== 'wrong' ||
              evalTyped() !== 'wrong'
            return (
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
                <button
                  style={{ ...styles.nextBtn, ...(confirmOk ? {} : { opacity: 0.35, cursor: 'not-allowed' }) }}
                  onClick={confirmOk ? handleNext : undefined}
                  disabled={!confirmOk}
                >
                  {(mode === 'struggle' ? strugglePoolRef.current.length === 0 : currentIdx + 1 >= session.length) ? 'Finish' : 'Next →'}
                </button>
              </div>
            )
          })()}
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
  headerTheme: {
    fontSize: '0.9rem',
    color: '#555',
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
  stageLabel: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  prompt: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#666',
  },
  word: {
    margin: 0,
    fontSize: '1.8rem',
    fontWeight: 700,
    color: '#111',
  },
  optionGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  },
  optionBtn: {
    padding: '0.85rem 1rem',
    fontSize: '1rem',
    color: '#111',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.15s',
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
  summaryBtnRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  secondaryBtn: {
    padding: '0.75rem 1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#fff',
    color: '#111',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'center',
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
    width: '28px',
  },
  thRight: {
    padding: '0.65rem 0.5rem',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '36px',
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
  tdHide: {
    padding: '0.6rem 0.5rem',
    textAlign: 'center',
  },
  hideBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px',
    lineHeight: 0,
    borderRadius: '4px',
    transition: 'color 0.15s',
  },
}
