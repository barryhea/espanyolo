import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'

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

function buildPolishSession(items) {
  const unpolished = shuffle(items.filter(i => i.polishCorrect + i.polishIncorrect === 0))
  const polished = items
    .filter(i => i.polishCorrect + i.polishIncorrect > 0)
    .sort((a, b) => {
      const ratioA = a.polishIncorrect / (a.polishCorrect + a.polishIncorrect)
      const ratioB = b.polishIncorrect / (b.polishCorrect + b.polishIncorrect)
      return ratioB - ratioA
    })
  return [...unpolished, ...polished].slice(0, 20)
}

export default function Polish() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const polishStatsRef = useRef({})

  const [phase, setPhase] = useState('loading')
  const [session, setSession] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [typedAnswer, setTypedAnswer] = useState('')
  const [matchResult, setMatchResult] = useState(null)
  const [results, setResults] = useState([])

  useEffect(() => {
    if (user) loadPolish()
  }, [user?.id])

  async function loadPolish() {
    setPhase('loading')

    const { data: progress, error } = await supabase
      .from('user_word_progress')
      .select('id, word_id, polish_correct, polish_incorrect, words(id, english, spanish)')
      .eq('user_id', user.id)
      .eq('mastered', true)
      .eq('hidden', false)

    if (error) {
      console.error('[Polish] load error', error)
      setPhase('error')
      return
    }

    const items = (progress ?? [])
      .filter(p => p.words)
      .map(p => ({
        wordId: p.word_id,
        progressId: p.id,
        english: p.words.english,
        spanish: p.words.spanish,
        polishCorrect: p.polish_correct ?? 0,
        polishIncorrect: p.polish_incorrect ?? 0,
      }))

    if (!items.length) {
      setPhase('empty')
      return
    }

    const statsMap = {}
    for (const item of items) {
      statsMap[item.wordId] = {
        progressId: item.progressId,
        polishCorrect: item.polishCorrect,
        polishIncorrect: item.polishIncorrect,
      }
    }
    polishStatsRef.current = statsMap

    const sess = buildPolishSession(items)
    setSession(sess)
    setCurrentIdx(0)
    setResults([])
    setTypedAnswer('')
    setMatchResult(null)
    setPhase('question')
  }

  async function saveAnswer(wordId, isCorrect) {
    const stats = polishStatsRef.current[wordId]
    if (!stats) return
    if (isCorrect) {
      stats.polishCorrect += 1
      await supabase
        .from('user_word_progress')
        .update({ polish_correct: stats.polishCorrect })
        .eq('id', stats.progressId)
    } else {
      stats.polishIncorrect += 1
      await supabase
        .from('user_word_progress')
        .update({ polish_incorrect: stats.polishIncorrect })
        .eq('id', stats.progressId)
    }
  }

  function handleAnswer(answer) {
    const word = session[currentIdx]
    const result = fuzzyMatch(answer, word.spanish)
    const isCorrect = result !== 'wrong'
    saveAnswer(word.wordId, isCorrect)
    setMatchResult(result)
    setResults(r => [...r, { word, correct: isCorrect, result }])
    setPhase('feedback')
  }

  function handleNext() {
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.length) {
      setPhase('summary')
      return
    }
    setCurrentIdx(nextIdx)
    setTypedAnswer('')
    setMatchResult(null)
    setPhase('question')
  }

  if (phase === 'loading') {
    return <div style={styles.page}><p style={styles.loadingMsg}>Loading…</p></div>
  }

  if (phase === 'error') {
    return (
      <div style={styles.page}>
        <p style={{ padding: '2rem', color: '#c00' }}>Could not load mastered words.</p>
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
            <p style={{ margin: 0, color: '#555' }}>No mastered words yet. Keep practising!</p>
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'summary') {
    const correctCount = results.filter(r => r.correct).length
    const resultByWordId = Object.fromEntries(results.map(r => [r.word.wordId, r.result]))
    return (
      <div style={styles.page}>
        <header style={styles.header}>
          <h1 style={styles.logo}>espanyolo</h1>
          <span style={styles.headerMode}>Polish</span>
        </header>
        <main style={{ ...styles.main, maxWidth: '820px' }}>
          <button style={styles.backLink} onClick={() => navigate('/vocabulary')}>← Back to themes</button>
          <div style={styles.summaryHeader}>
            <div>
              <h2 style={styles.summaryTitle}>Session complete</h2>
              <p style={styles.summaryScore}>{correctCount} / {results.length} correct</p>
            </div>
            <button style={styles.primaryBtn} onClick={loadPolish}>Play again</button>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.thLeft}>Word</th>
                  <th style={styles.thLeft}>Spanish</th>
                  <th style={styles.thRight}></th>
                </tr>
              </thead>
              <tbody>
                {session.map(word => {
                  const res = resultByWordId[word.wordId]
                  const textColor = res === 'exact' ? '#16a34a' : res === 'close' ? '#d97706' : res === 'wrong' ? '#dc2626' : '#333'
                  return (
                    <tr key={word.wordId} style={styles.tableRow}>
                      <td style={{ ...styles.tdEn, color: textColor }}>{word.english}</td>
                      <td style={{ ...styles.tdEs, color: textColor }}>{word.spanish}</td>
                      <td style={styles.tdResult}>
                        {res === 'exact' && <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>}
                        {res === 'close' && <span style={{ color: '#d97706', fontWeight: 700 }}>~</span>}
                        {res === 'wrong' && <span style={{ color: '#dc2626', fontWeight: 700 }}>✗</span>}
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

  const word = session[currentIdx]

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.logo}>espanyolo</h1>
        <span style={styles.headerMode}>Polish</span>
      </header>
      <main style={styles.main}>
        <button style={styles.backLink} onClick={() => navigate('/vocabulary')}>← Back to themes</button>

        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${(currentIdx / session.length) * 100}%` }} />
        </div>
        <p style={styles.progressLabel}>{currentIdx + 1} / {session.length}</p>

        <div style={styles.card}>
          <p style={styles.modeLabel}>Polish mode</p>
          <p style={styles.prompt}>What is the Spanish for:</p>
          <p style={styles.wordText}>{word.english}</p>

          <div style={styles.typedArea}>
            <input
              style={styles.typedInput}
              type="text"
              value={typedAnswer}
              onChange={e => setTypedAnswer(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && phase === 'question') handleAnswer(typedAnswer)
              }}
              disabled={phase === 'feedback'}
              autoFocus
              placeholder="Type the Spanish word…"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-form-type="other"
            />
            {phase === 'question' && (
              <button
                style={{ backgroundColor: typedAnswer.trim() ? '#d97706' : '#f3f4f6', color: typedAnswer.trim() ? '#fff' : '#6b7280', padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600, border: 'none', borderRadius: '8px', cursor: 'pointer', width: '100%' }}
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
                {matchResult === 'exact' ? 'Correct!' : matchResult === 'close' ? `Close — ${word.spanish}` : `Incorrect — ${word.spanish}`}
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
  headerMode: {
    fontSize: '0.9rem',
    color: '#b45309',
    fontWeight: 600,
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
    backgroundColor: '#d97706',
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
  modeLabel: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#b45309',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  prompt: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#666',
  },
  wordText: {
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
  primaryBtn: {
    padding: '0.75rem 1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#d97706',
    color: '#fff',
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
    color: '#d97706',
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
  tdResult: {
    padding: '0.6rem 0.75rem',
    textAlign: 'right',
  },
}
