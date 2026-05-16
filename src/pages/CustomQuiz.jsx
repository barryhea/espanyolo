import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import NavBar from '../components/NavBar'

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
  return (1 - levenshtein(a, b) / maxLen) >= 0.9 ? 'close' : 'wrong'
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

function buildQuestion(word, allWords, progressMap) {
  const stage = progressMap[word.id]?.stage ?? 1
  if (stage === 1 && allWords.length >= 4) {
    const options = shuffle([word.spanish, ...pickDistractors(word, allWords)])
    return { type: 'mc', word, options, prompt: word.english, promptLabel: 'What is the Spanish for:', correct: word.spanish, stage }
  }
  if (stage === 2) {
    return { type: 'typed', word, prompt: word.spanish, promptLabel: 'What is the English for:', correct: word.english, placeholder: 'Type the English word…', stage }
  }
  return { type: 'typed', word, prompt: word.english, promptLabel: 'What is the Spanish for:', correct: word.spanish, placeholder: 'Type the Spanish word…', stage }
}

function MasteryBar({ stage, consecutiveCorrect, mastered }) {
  const s1Filled = mastered ? 3 : stage >= 2 ? 3 : Math.min(consecutiveCorrect, 3)
  const s2Filled = mastered ? 5 : stage >= 3 ? 5 : stage === 2 ? Math.min(consecutiveCorrect, 5) : 0
  const s3Filled = mastered ? 3 : stage === 3 ? Math.min(consecutiveCorrect, 3) : 0
  const BRONZE = '#cd7f32', SILVER = '#a8a9ad', GOLD = '#f5c518'
  const segs = [
    ...Array(3).fill(null).map((_, i) => ({ filled: i < s1Filled, color: BRONZE })),
    ...Array(5).fill(null).map((_, i) => ({ filled: i < s2Filled, color: SILVER })),
    ...Array(3).fill(null).map((_, i) => ({ filled: i < s3Filled, color: GOLD })),
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

function buildCustomSession(words, progressMap) {
  const target = Math.min(20, Math.max(5, words.length))
  const byStage = { 1: [], 2: [], 3: [] }
  for (const word of words) {
    const stage = Math.max(1, Math.min(3, progressMap[word.id]?.stage ?? 1))
    byStage[stage].push(word)
  }
  const ordered = [
    ...shuffle(byStage[3]),
    ...shuffle(byStage[2]),
    ...shuffle(byStage[1]),
  ]
  if (!ordered.length) return []
  const session = []
  let i = 0
  while (session.length < target) {
    session.push(ordered[i % ordered.length])
    i++
  }
  return session
}

export default function CustomQuiz() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const words = location.state?.words ?? []
  const progressRef = useRef({})
  const inputRef = useRef(null)

  const [phase, setPhase] = useState('loading')
  const [session, setSession] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [question, setQuestion] = useState(null)
  const [selectedOption, setSelectedOption] = useState(null)
  const [typedAnswer, setTypedAnswer] = useState('')
  const [matchResult, setMatchResult] = useState(null)
  const [results, setResults] = useState([])

  useEffect(() => {
    if (user && words.length) loadCustomQuiz()
    else if (user && !words.length) setPhase('error')
  }, [user?.id])

  useEffect(() => {
    if (question?.type === 'typed') inputRef.current?.focus({ preventScroll: true })
  }, [question])

  async function loadCustomQuiz() {
    setPhase('loading')

    const wordIds = words.map(w => w.id)
    const { data: progress } = await supabase
      .from('user_word_progress')
      .select('id, word_id, stage, consecutive_correct, hidden, mastered')
      .eq('user_id', user.id)
      .in('word_id', wordIds)

    const progMap = {}
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
        }
      }
    }

    progressRef.current = progMap
    const sess = buildCustomSession(words, progMap)

    setSession(sess)
    setCurrentIdx(0)
    setResults([])
    setSelectedOption(null)
    setTypedAnswer('')
    setMatchResult(null)

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
    const { stage, consecutive_correct, hidden, mastered, db_id } = prog

    if (db_id) {
      await supabase
        .from('user_word_progress')
        .update({ stage, consecutive_correct, hidden: hidden ?? false, mastered: mastered ?? false })
        .eq('id', db_id)
    } else {
      const { data } = await supabase
        .from('user_word_progress')
        .insert({ user_id: user.id, word_id: wordId, stage, consecutive_correct, hidden: false, mastered: false })
        .select('id')
        .single()
      if (data) progressRef.current[wordId] = { ...prog, db_id: data.id }
    }
  }

  function handleAnswer(answer) {
    const result = fuzzyMatch(answer, question.correct)
    const isCorrect = result !== 'wrong'
    const wordId = question.word.id
    const prog = progressRef.current[wordId] ?? { stage: 1, consecutive_correct: 0, hidden: false, db_id: null, consecutive_incorrect: 0 }

    let newProg
    if (isCorrect) {
      const newConsec = prog.consecutive_correct + 1
      if (newConsec >= 3 && prog.stage < 3) {
        newProg = { ...prog, stage: prog.stage + 1, consecutive_correct: 0, consecutive_incorrect: 0 }
      } else if (prog.stage === 3 && newConsec >= 5) {
        newProg = { ...prog, consecutive_correct: newConsec, consecutive_incorrect: 0, mastered: true }
      } else {
        newProg = { ...prog, consecutive_correct: newConsec, consecutive_incorrect: 0 }
      }
    } else {
      const newConsecIncorrect = (prog.consecutive_incorrect ?? 0) + 1
      if (prog.stage === 2 && newConsecIncorrect >= 2) {
        newProg = { ...prog, stage: 1, consecutive_correct: 0, consecutive_incorrect: 0 }
      } else if (prog.stage === 3 && newConsecIncorrect >= 2) {
        newProg = { ...prog, consecutive_correct: 0, consecutive_incorrect: 0 }
      } else if (prog.stage === 3) {
        newProg = { ...prog, consecutive_incorrect: newConsecIncorrect }
      } else {
        newProg = { ...prog, consecutive_correct: 0, consecutive_incorrect: newConsecIncorrect }
      }
    }

    progressRef.current[wordId] = newProg
    saveProgress(wordId)
    setMatchResult(result)
    setSelectedOption(answer)
    setResults(r => [...r, { word: question.word, correct: isCorrect, result, stage: question.stage }])
    setPhase('feedback')
  }

  function handleNext() {
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.length) {
      setPhase('summary')
      return
    }
    setCurrentIdx(nextIdx)
    setQuestion(buildQuestion(session[nextIdx], words, progressRef.current))
    setSelectedOption(null)
    setTypedAnswer('')
    setMatchResult(null)
    setPhase('question')
  }

  if (phase === 'loading') {
    return <div style={styles.page}><NavBar /><p style={styles.loadingMsg}>Loading…</p></div>
  }

  if (phase === 'error' || (phase !== 'loading' && !words.length)) {
    return (
      <div style={styles.page}>
        <NavBar />
        <main style={styles.main}>
          <button style={styles.backLink} onClick={() => navigate('/vocabulary')}>← Back to themes</button>
          <div style={styles.card}>
            <p style={{ margin: 0, color: '#555' }}>No words selected. Go back and select some words to practise.</p>
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'summary') {
    const correctCount = results.filter(r => r.correct).length
    const uniqueResults = []
    const seen = new Set()
    for (let i = results.length - 1; i >= 0; i--) {
      if (!seen.has(results[i].word.id)) {
        uniqueResults.unshift(results[i])
        seen.add(results[i].word.id)
      }
    }
    return (
      <div style={styles.page}>
        <NavBar rightContent={<span style={styles.headerLabel}>Custom Quiz</span>} />
        <main style={{ ...styles.main, maxWidth: '820px' }}>
          <div style={styles.summaryHeader}>
            <h2 style={styles.summaryTitle}>Session complete</h2>
            <p style={styles.summaryScore}>{correctCount} / {results.length} correct</p>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.thLeft}>English</th>
                  <th style={styles.thLeft}>Spanish</th>
                  <th style={styles.thResult}></th>
                </tr>
              </thead>
              <tbody>
                {uniqueResults.map(({ word, result }) => {
                  const textColor = result === 'exact' ? '#16a34a' : result === 'close' ? '#d97706' : result === 'wrong' ? '#dc2626' : '#333'
                  return (
                    <tr key={word.id} style={styles.tableRow}>
                      <td style={{ ...styles.tdEn, color: textColor }}>{word.english}</td>
                      <td style={{ ...styles.tdEs, color: textColor }}>{word.spanish}</td>
                      <td style={styles.tdResult}>
                        {result === 'exact' && <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>}
                        {result === 'close' && <span style={{ color: '#d97706', fontWeight: 700 }}>~</span>}
                        {result === 'wrong' && <span style={{ color: '#dc2626', fontWeight: 700 }}>✗</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={styles.summaryActions}>
            <button style={{ ...styles.primaryBtn, width: '100%', textAlign: 'center' }} onClick={loadCustomQuiz}>
              Play again
            </button>
            <button style={styles.summaryBackLink} onClick={() => navigate('/vocabulary')}>
              ← Back to themes
            </button>
          </div>
        </main>
      </div>
    )
  }

  const currentProg = progressRef.current[question?.word?.id]

  return (
    <div style={styles.page}>
      <NavBar rightContent={<span style={styles.headerLabel}>Custom Quiz</span>} />
      <main style={styles.main}>
        <div style={styles.progressRow}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${(currentIdx / session.length) * 100}%` }} />
          </div>
          <span style={styles.progressLabel}>{currentIdx + 1} / {session.length}</span>
        </div>

        <div style={styles.card}>
          <p style={styles.stageLabel}>Stage {question.stage}</p>
          <p style={styles.prompt}>{question.promptLabel}</p>
          <p style={styles.word}>{question.prompt}</p>
          <MasteryBar
            stage={currentProg?.stage ?? 1}
            consecutiveCorrect={currentProg?.consecutive_correct ?? 0}
            mastered={currentProg?.mastered ?? false}
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

          {question.type === 'typed' && (
            <div style={styles.typedArea}>
              <input
                ref={inputRef}
                style={styles.typedInput}
                type="text"
                value={typedAnswer}
                onChange={e => setTypedAnswer(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && phase === 'question') handleAnswer(typedAnswer) }}
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
                  style={{ ...styles.typedBtn, backgroundColor: typedAnswer.trim() ? '#3b82f6' : '#f3f4f6', color: typedAnswer.trim() ? '#fff' : '#6b7280' }}
                  onClick={() => handleAnswer(typedAnswer)}
                >
                  {typedAnswer.trim() ? 'Check' : 'Pass'}
                </button>
              )}
            </div>
          )}

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
  headerLabel: {
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
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  summaryHeader: {
    paddingBottom: '0.25rem',
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
  summaryActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    paddingTop: '0.25rem',
  },
  summaryBackLink: {
    padding: '0.5rem',
    fontSize: '0.875rem',
    color: '#888',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
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
  thResult: {
    padding: '0.65rem 0.75rem',
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
  tdResult: {
    padding: '0.6rem 0.75rem',
    textAlign: 'right',
  },
}
