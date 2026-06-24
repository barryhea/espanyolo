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
  return (1 - levenshtein(a, b) / maxLen) >= 0.8 ? 'close' : 'wrong'
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

function buildQuestion(word, allWords, progressMap, forcedStage = null) {
  const stage = forcedStage ?? (progressMap[word.id]?.stage ?? 1)
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

function buildCustomSession(words, progressMap) {
  const target = Math.min(20, Math.max(5, words.length))
  const s1 = words.filter(w => (progressMap[w.id]?.stage ?? 1) === 1)
  const pool = s1.length > 0 ? s1 : words
  if (!pool.length) return []
  const session = []
  let i = 0
  const shuffled = shuffle(pool)
  while (session.length < target) {
    session.push(shuffled[i % shuffled.length])
    i++
  }
  return session
}

function buildSelectionsSession(selections) {
  const pairs = []
  for (const sel of selections) {
    for (const stage of sel.stages) {
      pairs.push({ word: sel.word, forcedStage: stage })
    }
  }
  return shuffle(pairs)
}

export default function CustomQuiz() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const words = location.state?.words ?? []
  const selections = location.state?.selections ?? null
  const sourceThemeId = location.state?.sourceThemeId ?? null

  function goBackToThemes() {
    navigate('/vocabulary', sourceThemeId ? { state: { openThemeId: sourceThemeId } } : undefined)
  }
  const progressRef = useRef({})
  const inputRef = useRef(null)

  const [phase, setPhase] = useState('loading')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [session, setSession] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [question, setQuestion] = useState(null)
  const [selectedOption, setSelectedOption] = useState(null)
  const [typedAnswer, setTypedAnswer] = useState('')
  const [matchResult, setMatchResult] = useState(null)
  const [results, setResults] = useState([])

  useEffect(() => {
    if (user && (words.length || selections?.length)) loadCustomQuiz()
    else if (user) setPhase('error')
  }, [user?.id])

  useEffect(() => {
    if (question?.type === 'typed') inputRef.current?.focus({ preventScroll: true })
  }, [question])

  async function loadCustomQuiz() {
    setPhase('loading')

    const wordObjs = selections ? selections.map(sel => sel.word) : words
    const wordIds = wordObjs.map(w => w.id)
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
    const sess = selections
      ? buildSelectionsSession(selections)
      : buildCustomSession(words, progMap)

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

    const first = sess[0]
    const firstWord = selections ? first.word : first
    const forcedStage = selections ? first.forcedStage : null
    setQuestion(buildQuestion(firstWord, wordObjs, progMap, forcedStage))
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
    if (!selections) saveProgress(wordId)
    setMatchResult(result)
    setSelectedOption(answer)
    setResults(r => [...r, { word: question.word, correct: isCorrect, result, stage: question.stage }])
    setPhase('feedback')
  }

  async function saveQuiz() {
    if (!saveName.trim() || saving) return
    setSaving(true)
    const configuration = selections
      ? { selections: selections.map(sel => ({ word: { id: sel.word.id, english: sel.word.english, spanish: sel.word.spanish }, stages: sel.stages })) }
      : { words: words.map(w => ({ id: w.id, english: w.english, spanish: w.spanish })) }
    const { error } = await supabase.from('saved_quizzes').insert({
      user_id: user.id,
      name: saveName.trim(),
      quiz_type: 'vocab',
      configuration,
    })
    setSaving(false)
    setSaveStatus(error ? 'error' : 'saved')
    if (!error) {
      setTimeout(() => {
        setShowSaveModal(false)
        setSaveStatus(null)
        setSaveName('')
      }, 1200)
    }
  }

  function handleNext() {
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.length) {
      setPhase('summary')
      return
    }
    setCurrentIdx(nextIdx)
    const nextItem = session[nextIdx]
    const wordObjs = selections ? selections.map(s => s.word) : words
    const nextWord = selections ? nextItem.word : nextItem
    const forcedStage = selections ? nextItem.forcedStage : null
    setQuestion(buildQuestion(nextWord, wordObjs, progressRef.current, forcedStage))
    setSelectedOption(null)
    setTypedAnswer('')
    setMatchResult(null)
    setPhase('question')
  }

  if (phase === 'loading') {
    return <div style={styles.page}><NavBar /><p style={styles.loadingMsg}>Loading…</p></div>
  }

  if (phase === 'error' || (phase !== 'loading' && !words.length && !selections?.length)) {
    return (
      <div style={styles.page}>
        <NavBar />
        <main style={styles.main}>
          <button style={styles.backLink} onClick={goBackToThemes}>← Back to themes</button>
          <div style={styles.card}>
            <p style={{ margin: 0, color: '#555' }}>No words selected. Go back and select some words to practise.</p>
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'summary') {
    const correctCount = results.filter(r => r.correct).length
    const displayResults = selections
      ? results
      : (() => {
          const uniqueResults = []
          const seen = new Set()
          for (let i = results.length - 1; i >= 0; i--) {
            if (!seen.has(results[i].word.id)) {
              uniqueResults.unshift(results[i])
              seen.add(results[i].word.id)
            }
          }
          return uniqueResults
        })()
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
                  {selections && <th style={{ ...styles.thResult, width: '36px', fontSize: '0.68rem', color: '#aaa', fontWeight: 700 }}>Stage</th>}
                  <th style={styles.thResult}></th>
                </tr>
              </thead>
              <tbody>
                {displayResults.map(({ word, result, stage }, i) => {
                  const textColor = result === 'exact' ? '#16a34a' : result === 'close' ? '#d97706' : result === 'wrong' ? '#dc2626' : '#333'
                  return (
                    <tr key={`${word.id}-${stage}-${i}`} style={styles.tableRow}>
                      <td style={{ ...styles.tdEn, color: textColor }}>{word.english}</td>
                      <td style={{ ...styles.tdEs, color: textColor }}>{word.spanish}</td>
                      {selections && (
                        <td style={{ ...styles.tdResult, fontSize: '0.7rem', color: '#888', fontWeight: 600 }}>
                          S{stage}
                        </td>
                      )}
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
            <button style={styles.saveBtn} onClick={() => setShowSaveModal(true)}>
              Save Quiz
            </button>
            <button style={styles.summaryBackLink} onClick={goBackToThemes}>
              ← Back to themes
            </button>
          </div>
        </main>

        {showSaveModal && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalCard}>
              <p style={styles.modalTitle}>Save Quiz</p>
              <input
                style={styles.modalInput}
                type="text"
                placeholder="Give this quiz a name…"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveQuiz()}
                autoFocus
                autoComplete="off"
              />
              {saveStatus === 'saved' && <p style={styles.modalSuccess}>Saved!</p>}
              {saveStatus === 'error' && <p style={styles.modalError}>Failed to save — try again.</p>}
              <div style={styles.modalBtnRow}>
                <button style={styles.modalCancelBtn} onClick={() => { setShowSaveModal(false); setSaveStatus(null); setSaveName('') }}>
                  Cancel
                </button>
                <button
                  style={{ ...styles.modalSaveBtn, ...(!saveName.trim() || saving ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
                  onClick={saveQuiz}
                  disabled={!saveName.trim() || saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const currentProg = progressRef.current[question?.word?.id]

  return (
    <div style={styles.page}>
      <NavBar rightContent={<span style={styles.headerLabel}>Custom Quiz</span>} />
      <main style={styles.main}>
        <button style={styles.backLink} onClick={goBackToThemes}>← Back to themes</button>
        <div style={styles.progressRow}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${(currentIdx / session.length) * 100}%` }} />
          </div>
          <span style={styles.progressLabel}>{currentIdx + 1} / {session.length}</span>
        </div>

        <div style={styles.card}>
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
                  style={{ ...styles.typedBtn, backgroundColor: typedAnswer.trim() ? '#16a34a' : '#f59e0b', color: '#fff' }}
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
    backgroundColor: '#16a34a',
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
  saveBtn: {
    width: '100%', padding: '0.75rem', fontSize: '0.9rem', fontWeight: 600,
    backgroundColor: '#fff', color: '#3b82f6',
    border: '1.5px solid #3b82f6', borderRadius: '8px', cursor: 'pointer',
    textAlign: 'center',
  },
  modalOverlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: '14px', padding: '1.5rem',
    width: '320px', maxWidth: 'calc(100vw - 2rem)',
    display: 'flex', flexDirection: 'column', gap: '0.875rem',
  },
  modalTitle: { margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111' },
  modalInput: {
    padding: '0.7rem 0.875rem', fontSize: '0.95rem',
    border: '1.5px solid #e5e5e5', borderRadius: '8px', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  },
  modalSuccess: { margin: 0, fontSize: '0.85rem', color: '#16a34a', fontWeight: 600 },
  modalError:   { margin: 0, fontSize: '0.85rem', color: '#dc2626', fontWeight: 600 },
  modalBtnRow:  { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' },
  modalCancelBtn: {
    padding: '0.55rem 1rem', fontSize: '0.9rem', fontWeight: 600,
    backgroundColor: '#f3f4f6', color: '#555', border: 'none',
    borderRadius: '8px', cursor: 'pointer',
  },
  modalSaveBtn: {
    padding: '0.55rem 1.25rem', fontSize: '0.9rem', fontWeight: 600,
    backgroundColor: '#3b82f6', color: '#fff', border: 'none',
    borderRadius: '8px', cursor: 'pointer',
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
