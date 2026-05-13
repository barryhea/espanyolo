import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { VOCAB_THEMES } from '../utils/courseData'

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
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function fuzzyMatch(typed, correct) {
  const a = normalise(typed)
  const b = normalise(correct)
  if (a === b) return true
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return true
  return (1 - levenshtein(a, b) / maxLen) >= 0.9
}

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
  return pool.slice(0, count).map(w => w.spanish)
}

function buildSession(words, progressMap) {
  const byStage = { 1: [], 2: [], 3: [] }
  for (const word of words) {
    const stage = progressMap[word.id]?.stage ?? 1
    byStage[stage].push(word)
  }
  return [
    ...shuffle(byStage[1]),
    ...shuffle(byStage[2]),
    ...shuffle(byStage[3]),
  ].slice(0, 5)
}

function buildQuestion(word, allWords, progressMap) {
  const stage = progressMap[word.id]?.stage ?? 1
  if (stage === 1 && allWords.length >= 4) {
    const options = shuffle([word.spanish, ...pickDistractors(word, allWords)])
    return { type: 'mc', word, options, prompt: word.english, promptLabel: 'What is the Spanish for:', correct: word.spanish, stage }
  }
  if (stage === 2) {
    return { type: 'typed', word, prompt: word.spanish, promptLabel: 'What is the English for:', correct: word.english, stage }
  }
  return { type: 'typed', word, prompt: word.english, promptLabel: 'What is the Spanish for:', correct: word.spanish, stage }
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

export default function Quiz() {
  const { themeId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const theme = VOCAB_THEMES.find(t => t.id === Number(themeId))
  const progressRef = useRef({})

  const [phase, setPhase] = useState('loading')
  const [allWords, setAllWords] = useState([])
  const [session, setSession] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [question, setQuestion] = useState(null)
  const [selectedOption, setSelectedOption] = useState(null)
  const [typedAnswer, setTypedAnswer] = useState('')
  const [isCorrect, setIsCorrect] = useState(null)
  const [results, setResults] = useState([])
  const [hiddenWords, setHiddenWords] = useState(new Set())

  useEffect(() => {
    if (theme && user) loadQuiz()
  }, [theme?.id, user?.id])

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
      .select('id, word_id, stage, consecutive_correct, hidden')
      .eq('user_id', user.id)
      .in('word_id', wordIds)

    const progMap = {}
    const hiddenWordIds = new Set()
    for (const p of progress ?? []) {
      const existing = progMap[p.word_id]
      // If duplicate rows exist (missing unique constraint), keep the most advanced
      if (!existing || p.stage > existing.stage ||
          (p.stage === existing.stage && p.consecutive_correct > existing.consecutive_correct)) {
        progMap[p.word_id] = {
          stage: p.stage ?? 1,
          consecutive_correct: p.consecutive_correct ?? 0,
          hidden: p.hidden ?? false,
          db_id: p.id,
          consecutive_incorrect: 0,
        }
      }
      if (p.hidden) hiddenWordIds.add(p.word_id)
    }
    console.log('[loadQuiz] progress loaded:', Object.fromEntries(
      Object.entries(progMap).map(([id, p]) => [id, `S${p.stage} C${p.consecutive_correct}`])
    ))
    progressRef.current = progMap
    setHiddenWords(hiddenWordIds)

    // Hidden words are excluded from sessions but kept in allWords for distractor picking
    const visibleWords = words.filter(w => !hiddenWordIds.has(w.id))
    const sess = buildSession(visibleWords, progMap)

    setAllWords(words)
    setSession(sess)
    setCurrentIdx(0)
    setResults([])
    setSelectedOption(null)
    setTypedAnswer('')
    setIsCorrect(null)

    if (!sess.length) {
      setPhase('empty')
      return
    }

    setQuestion(buildQuestion(sess[0], words, progMap))
    setPhase('question')
  }

  async function saveProgress(wordId) {
    const prog = progressRef.current[wordId]
    if (!prog) return
    const { stage, consecutive_correct, hidden, db_id } = prog
    console.log('[saveProgress]', { wordId, stage, consecutive_correct, db_id: db_id ?? 'none' })

    if (db_id) {
      const { error } = await supabase
        .from('user_word_progress')
        .update({ stage, consecutive_correct, hidden: hidden ?? false })
        .eq('id', db_id)
      if (error) console.error('[saveProgress] UPDATE error', error)
      else console.log('[saveProgress] UPDATE ok → stage', stage, 'consec', consecutive_correct)
    } else {
      const { data, error } = await supabase
        .from('user_word_progress')
        .insert({ user_id: user.id, word_id: wordId, stage, consecutive_correct, hidden: hidden ?? false })
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
    progressRef.current[wordId] = { ...(prog ?? { stage: 1, consecutive_correct: 0, db_id: null }), hidden: willBeHidden }

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
        },
        { onConflict: 'user_id,word_id' }
      )
      .select('id')
      .single()
    if (data) progressRef.current[wordId] = { ...progressRef.current[wordId], db_id: data.id }
  }

  function handleAnswer(answer) {
    const correct = fuzzyMatch(answer, question.correct)
    const wordId = question.word.id
    const prog = progressRef.current[wordId] ?? { stage: 1, consecutive_correct: 0, hidden: false, db_id: null }

    let newProg
    if (correct) {
      const newConsec = prog.consecutive_correct + 1
      const threshold = prog.stage === 1 ? 3 : 5
      if (newConsec >= threshold && prog.stage < 3) {
        newProg = { ...prog, stage: prog.stage + 1, consecutive_correct: 0, consecutive_incorrect: 0 }
        console.log(`[handleAnswer] word ${wordId} GRADUATED S${prog.stage} → S${prog.stage + 1}`)
      } else {
        newProg = { ...prog, consecutive_correct: newConsec, consecutive_incorrect: 0 }
        console.log(`[handleAnswer] word ${wordId} correct — S${prog.stage} consec ${prog.consecutive_correct} → ${newConsec} (need ${threshold})`)
      }
    } else {
      const newConsecIncorrect = (prog.consecutive_incorrect ?? 0) + 1
      if (prog.stage === 2 && newConsecIncorrect >= 2) {
        newProg = { ...prog, stage: 1, consecutive_correct: 0, consecutive_incorrect: 0 }
        console.log(`[handleAnswer] word ${wordId} REGRESSED S2 → S1 (2 consecutive incorrect)`)
      } else {
        newProg = { ...prog, consecutive_correct: 0, consecutive_incorrect: newConsecIncorrect }
        console.log(`[handleAnswer] word ${wordId} incorrect — S${prog.stage} consec_correct reset, consec_incorrect: ${newConsecIncorrect}`)
      }
    }

    progressRef.current[wordId] = newProg
    saveProgress(wordId)  // async, runs in background while feedback shows
    setIsCorrect(correct)
    setSelectedOption(answer)
    setResults(r => [...r, { word: question.word, correct, stage: question.stage }])
    setPhase('feedback')
  }

  function handleNext() {
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.length) {
      setPhase('summary')
      return
    }
    setCurrentIdx(nextIdx)
    setQuestion(buildQuestion(session[nextIdx], allWords, progressRef.current))
    setSelectedOption(null)
    setTypedAnswer('')
    setIsCorrect(null)
    setPhase('question')
  }

  if (!theme) {
    return (
      <div style={styles.page}>
        <p style={{ padding: '2rem' }}>Theme not found.</p>
        <button style={styles.backLink} onClick={() => navigate('/vocabulary')}>← Back</button>
      </div>
    )
  }

  if (phase === 'loading') {
    return <div style={styles.page}><p style={styles.loadingMsg}>Loading…</p></div>
  }

  if (phase === 'error') {
    return (
      <div style={styles.page}>
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
        <header style={styles.header}><h1 style={styles.logo}>espanyolo</h1></header>
        <main style={styles.main}>
          <button style={styles.backLink} onClick={() => navigate('/vocabulary')}>← Back to themes</button>
          <div style={styles.card}>
            <p style={{ margin: 0, color: '#555' }}>All words in this theme are hidden. Unhide some words to start a session.</p>
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'summary') {
    const correctCount = results.filter(r => r.correct).length
    const resultByWordId = Object.fromEntries(results.map(r => [r.word.id, r.correct]))
    return (
      <div style={styles.page}>
        <header style={styles.header}>
          <h1 style={styles.logo}>espanyolo</h1>
          <span style={styles.headerTheme}>{theme.title}</span>
        </header>
        <main style={{ ...styles.main, maxWidth: '820px' }}>
          <button style={styles.backLink} onClick={() => navigate('/vocabulary')}>← Back to themes</button>
          <div style={styles.summaryHeader}>
            <div>
              <h2 style={styles.summaryTitle}>Session complete</h2>
              <p style={styles.summaryScore}>{correctCount} / {results.length} correct</p>
            </div>
            <button style={styles.primaryBtn} onClick={loadQuiz}>Play again</button>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.thLeft}>Word</th>
                  <th style={styles.thLeft}>Spanish</th>
                  <th style={styles.thCenter}>S1</th>
                  <th style={styles.thCenter}>S2</th>
                  <th style={styles.thCenter}>S3</th>
                  <th style={styles.thRight}></th>
                </tr>
              </thead>
              <tbody>
                {session.map(word => {
                  const prog = progressRef.current[word.id]
                  const stage = prog?.stage ?? 1
                  const consec = prog?.consecutive_correct ?? 0
                  const s1done = stage >= 2
                  const s2done = stage >= 3
                  const s3done = stage === 3 && consec >= 5
                  const isHidden = hiddenWords.has(word.id)
                  const wasCorrect = resultByWordId[word.id]
                  const textColor = wasCorrect === true ? '#16a34a' : wasCorrect === false ? '#dc2626' : '#333'
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
        </main>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.logo}>espanyolo</h1>
        <span style={styles.headerTheme}>{theme.title}</span>
      </header>
      <main style={styles.main}>
        <button style={styles.backLink} onClick={() => navigate('/vocabulary')}>← Back to themes</button>

        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${(currentIdx / session.length) * 100}%` }} />
        </div>
        <p style={styles.progressLabel}>{currentIdx + 1} / {session.length}</p>

        <div style={styles.card}>
          <p style={styles.stageLabel}>Stage {question.stage}</p>
          <p style={styles.prompt}>{question.promptLabel}</p>
          <p style={styles.word}>{question.prompt}</p>

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

          {question.type === 'typed' && (
            <div style={styles.typedArea}>
              <input
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
                autoFocus
                placeholder="Type the Spanish word…"
              />
              {phase === 'question' && (
                <button
                  style={typedAnswer.trim() ? styles.primaryBtn : styles.passBtn}
                  onClick={() => handleAnswer(typedAnswer)}
                >
                  {typedAnswer.trim() ? 'Check' : 'Pass'}
                </button>
              )}
            </div>
          )}

          {phase === 'feedback' && (
            <div style={{ ...styles.feedbackBanner, backgroundColor: isCorrect ? '#dcfce7' : '#fee2e2' }}>
              <span style={{ color: isCorrect ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                {isCorrect ? 'Correct!' : `Incorrect — ${question.correct}`}
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
    minHeight: '100vh',
    backgroundColor: '#f8f8f6',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 2rem',
    borderBottom: '1px solid #e5e5e5',
    backgroundColor: '#fff',
  },
  logo: {
    margin: 0,
    fontSize: '1.4rem',
    fontWeight: 700,
    letterSpacing: '-0.5px',
  },
  headerTheme: {
    fontSize: '0.9rem',
    color: '#555',
  },
  main: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
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
  primaryBtn: {
    padding: '0.75rem 1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  passBtn: {
    padding: '0.75rem 1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
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
  summaryHeader: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  summaryTitle: {
    margin: '0 0 0.25rem',
    fontSize: '1.3rem',
    fontWeight: 700,
  },
  summaryScore: {
    margin: 0,
    fontSize: '2rem',
    fontWeight: 700,
    color: '#3b82f6',
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
  },
  thLeft: {
    padding: '0.65rem 1rem',
    textAlign: 'left',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
  },
  thCenter: {
    padding: '0.65rem 0.5rem',
    textAlign: 'center',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '40px',
  },
  thRight: {
    padding: '0.65rem 0.75rem',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '36px',
  },
  tableRow: {
    borderBottom: '1px solid #f5f5f5',
  },
  tdEn: {
    padding: '0.6rem 1rem',
    color: '#333',
  },
  tdEs: {
    padding: '0.6rem 1rem',
    fontWeight: 500,
    color: '#111',
  },
  stageCell: {
    padding: '0.6rem 0.5rem',
    textAlign: 'center',
  },
  tdHide: {
    padding: '0.6rem 0.75rem',
    textAlign: 'right',
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
