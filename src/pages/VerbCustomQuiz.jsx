import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import NavBar from '../components/NavBar'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array(n + 1).fill(0).map((_, j) => (j === 0 ? i : 0))
  )
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

const LEVEL_LABELS = { 1: 'L1', 2: 'L2', 3: 'L3', 4: 'L4' }
const LEVEL_COLORS = { 1: '#16a34a', 2: '#cd7f32', 3: '#6b7280', 4: '#ca8a04' }

function makeQuestion(verb, level, allVerbs) {
  if (level === 1) {
    const distractors = shuffle(allVerbs.filter(v => v.id !== verb.id))
      .slice(0, 3)
      .map(v => v.spanish_infinitive)
    return {
      type: 'mc',
      level,
      verb,
      promptLabel: 'Select the Spanish word for:',
      prompt: verb.english,
      options: shuffle([verb.spanish_infinitive, ...distractors]),
      correct: verb.spanish_infinitive,
    }
  }
  if (level === 2) {
    const distractors = shuffle(allVerbs.filter(v => v.id !== verb.id))
      .slice(0, 3)
      .map(v => v.english)
    return {
      type: 'mc',
      level,
      verb,
      promptLabel: 'Select the English meaning of:',
      prompt: verb.spanish_infinitive,
      options: shuffle([verb.english, ...distractors]),
      correct: verb.english,
    }
  }
  if (level === 3) {
    const candidates = (verb.english ?? '')
      .split(' / ')
      .map(s => s.replace(/\s*\(.*?\)/g, '').trim())
      .filter(Boolean)
    return {
      type: 'typed',
      level,
      verb,
      promptLabel: 'Type the English meaning of:',
      prompt: verb.spanish_infinitive,
      correct: candidates[0],
      correctCandidates: candidates,
      placeholder: 'Type the English meaning…',
    }
  }
  // level 4
  return {
    type: 'typed',
    level,
    verb,
    promptLabel: 'Type the Spanish infinitive for:',
    prompt: verb.english,
    correct: verb.spanish_infinitive,
    correctCandidates: [verb.spanish_infinitive],
    placeholder: 'Type the Spanish infinitive…',
  }
}

export default function VerbCustomQuiz() {
  const location = useLocation()
  const navigate = useNavigate()
  const inputRef = useRef(null)

  const { selections = [], categoryTitle = 'Custom Quiz' } = location.state ?? {}

  const [phase, setPhase] = useState('loading')
  const [allCatVerbs, setAllCatVerbs] = useState([])
  const [session, setSession] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [question, setQuestion] = useState(null)
  const [selectedOption, setSelectedOption] = useState(null)
  const [typedAnswer, setTypedAnswer] = useState('')
  const [matchResult, setMatchResult] = useState(null)
  const [results, setResults] = useState([])

  useEffect(() => {
    if (selections.length) loadQuiz()
    else setPhase('error')
  }, [])

  useEffect(() => {
    if (question?.type === 'typed' && phase === 'question') {
      inputRef.current?.focus({ preventScroll: true })
    }
  }, [question, phase])

  async function loadQuiz() {
    setPhase('loading')
    const categories = [...new Set(selections.map(sel => sel.verb.category).filter(Boolean))]

    let catVerbs = []
    if (categories.length) {
      const { data } = await supabase
        .from('verbs')
        .select('id, spanish_infinitive, english, category')
        .in('category', categories)
      catVerbs = data ?? []
    }

    if (!catVerbs.length) catVerbs = selections.map(sel => sel.verb)
    setAllCatVerbs(catVerbs)

    // Merge full data into selections (english_alt1/alt2 not critical for custom quiz)
    const verbById = Object.fromEntries(catVerbs.map(v => [v.id, v]))
    const pairs = []
    for (const sel of selections) {
      const fullVerb = verbById[sel.verb.id] ?? sel.verb
      for (const level of sel.levels) {
        pairs.push({ verb: fullVerb, level })
      }
    }
    const sess = shuffle(pairs)

    if (!sess.length) {
      setPhase('error')
      return
    }

    setSession(sess)
    setCurrentIdx(0)
    setResults([])
    setSelectedOption(null)
    setTypedAnswer('')
    setMatchResult(null)
    setQuestion(makeQuestion(sess[0].verb, sess[0].level, catVerbs))
    setPhase('question')
  }

  function handleMC(option) {
    if (phase !== 'question') return
    const correct = option === question.correct
    setSelectedOption(option)
    setResults(r => [...r, { verb: question.verb, level: question.level, correct }])
    setPhase('feedback')
  }

  function handleTyped() {
    const result = question.correctCandidates
      .map(c => fuzzyMatch(typedAnswer, c))
      .reduce((best, r) => {
        if (r === 'exact' || best === 'exact') return 'exact'
        if (r === 'close' || best === 'close') return 'close'
        return 'wrong'
      }, 'wrong')

    setMatchResult(result)
    setResults(r => [...r, { verb: question.verb, level: question.level, correct: result !== 'wrong' }])
    setPhase('feedback')
    if (result === 'wrong') setTypedAnswer('')
  }

  function handleNext() {
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.length) {
      setPhase('summary')
      return
    }
    setCurrentIdx(nextIdx)
    const next = session[nextIdx]
    setQuestion(makeQuestion(next.verb, next.level, allCatVerbs))
    setSelectedOption(null)
    setTypedAnswer('')
    setMatchResult(null)
    setPhase('question')
  }

  if (phase === 'loading') {
    return <div style={s.page}><NavBar /><p style={s.loadingMsg}>Loading…</p></div>
  }

  if (phase === 'error') {
    return (
      <div style={s.page}>
        <NavBar />
        <main style={s.main}>
          <button style={s.backLink} onClick={() => navigate('/verbs')}>← Back</button>
          <div style={s.card}>
            <p style={{ margin: 0, color: '#555' }}>No questions to show. Go back and select verbs and levels.</p>
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'summary') {
    const correctCount = results.filter(r => r.correct).length
    const byVerb = {}
    for (const r of results) {
      if (!byVerb[r.verb.id]) byVerb[r.verb.id] = { verb: r.verb, results: [] }
      byVerb[r.verb.id].results.push(r)
    }
    const verbSummaries = Object.values(byVerb)
    return (
      <div style={s.page}>
        <NavBar />
        <main style={{ ...s.main, maxWidth: '640px' }}>
          <div style={s.summaryHeader}>
            <div style={s.summaryTitle}>Session complete</div>
            <div style={s.summaryScore}>{correctCount} / {results.length} correct</div>
            <div style={s.summarySub}>{categoryTitle}</div>
          </div>

          <div style={s.tableWrap}>
            {verbSummaries.map(({ verb, results: vr }) => (
              <div key={verb.id} style={s.summaryVerbRow}>
                <div style={s.summaryVerbInfo}>
                  <span style={s.summarySpanish}>{verb.spanish_infinitive}</span>
                  <span style={s.summaryEnglish}>{verb.english}</span>
                </div>
                <div style={s.summaryLevelResults}>
                  {vr.map((r, i) => (
                    <span
                      key={i}
                      style={{
                        ...s.summaryLevelBadge,
                        backgroundColor: r.correct ? '#dcfce7' : '#fee2e2',
                        color: r.correct ? '#16a34a' : '#dc2626',
                      }}
                    >
                      {LEVEL_LABELS[r.level]} {r.correct ? '✓' : '✗'}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={s.summaryActions}>
            <button style={s.primaryBtn} onClick={loadQuiz}>Play again</button>
            <button
              style={s.secondaryBtn}
              onClick={() => navigate(-1)}
            >
              Change levels
            </button>
            <button style={s.backToThemesBtn} onClick={() => navigate('/verbs')}>
              ← Back to Verb Trainer
            </button>
          </div>
        </main>
      </div>
    )
  }

  const isMC = question?.type === 'mc'
  const isTyped = question?.type === 'typed'

  const confirmOk = (() => {
    if (phase !== 'feedback' || !isTyped) return true
    if (matchResult !== 'wrong') return true
    return question.correctCandidates.some(c => fuzzyMatch(typedAnswer, c) !== 'wrong')
  })()

  return (
    <div style={s.page}>
      <NavBar />
      <main style={s.main}>
        <div style={s.progressRow}>
          <div style={s.progressBar}>
            <div style={{ display: 'flex', height: '100%' }}>
              {session.map((_, i) => {
                const r = results[i]
                const bg = r ? (r.correct ? '#16a34a' : '#dc2626') : '#e5e5e5'
                return <div key={i} style={{ flex: 1, backgroundColor: bg }} />
              })}
            </div>
          </div>
          <span style={s.progressLabel}>{currentIdx + 1} / {session.length}</span>
        </div>

        <div style={s.card}>
          <div style={s.levelTag}>
            <span style={{
              ...s.levelPill,
              backgroundColor: LEVEL_COLORS[question.level] + '22',
              color: LEVEL_COLORS[question.level],
            }}>
              {LEVEL_LABELS[question.level]}
            </span>
            <span style={s.promptLabel}>{question.promptLabel}</span>
          </div>
          <p style={s.word}>{question.prompt}</p>

          {isMC && (
            <div style={s.optionGrid}>
              {question.options.map(opt => {
                let bg = '#fff'
                if (phase === 'feedback') {
                  if (opt === question.correct) bg = '#dcfce7'
                  else if (opt === selectedOption) bg = '#fee2e2'
                }
                return (
                  <button
                    key={opt}
                    style={{ ...s.optionBtn, backgroundColor: bg }}
                    onClick={() => handleMC(opt)}
                    disabled={phase === 'feedback'}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          )}

          {isTyped && (
            <div style={s.typedArea}>
              <input
                ref={inputRef}
                style={{
                  ...s.typedInput,
                  ...(phase === 'feedback' && matchResult === 'wrong' ? { borderColor: '#3b82f6', borderWidth: 2 } : {}),
                }}
                type="text"
                value={typedAnswer}
                onChange={e => setTypedAnswer(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (phase === 'question') {
                      handleTyped()
                    } else if (phase === 'feedback' && matchResult === 'wrong' && confirmOk) {
                      handleNext()
                    }
                  }
                }}
                disabled={phase === 'feedback' && matchResult !== 'wrong'}
                placeholder={
                  phase === 'feedback' && matchResult === 'wrong'
                    ? 'Type the correct answer to continue…'
                    : question.placeholder
                }
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                data-form-type="other"
              />
              {phase === 'question' && (
                <button
                  style={{ ...s.typedBtn, backgroundColor: typedAnswer.trim() ? '#16a34a' : '#f59e0b', color: '#fff' }}
                  onClick={handleTyped}
                >
                  {typedAnswer.trim() ? 'Check' : 'Pass'}
                </button>
              )}
            </div>
          )}

          {phase === 'feedback' && (() => {
            const isCorrect = isMC ? selectedOption === question.correct : matchResult !== 'wrong'
            const bannerBg = isMC
              ? (isCorrect ? '#dcfce7' : '#fee2e2')
              : (matchResult === 'exact' ? '#dcfce7' : matchResult === 'close' ? '#fef3c7' : '#fee2e2')
            const bannerColor = isMC
              ? (isCorrect ? '#16a34a' : '#dc2626')
              : (matchResult === 'exact' ? '#16a34a' : matchResult === 'close' ? '#d97706' : '#dc2626')
            const label = isMC
              ? (isCorrect ? 'Correct!' : `Incorrect — ${question.correct}`)
              : (matchResult === 'exact' ? 'Correct!' : matchResult === 'close' ? `Close — ${question.correct}` : `Incorrect — ${question.correct}`)
            return (
              <div style={{ ...s.feedbackBanner, backgroundColor: bannerBg }}>
                <span style={{ fontWeight: 600, color: bannerColor, fontSize: '0.95rem' }}>{label}</span>
                <button
                  style={{ ...s.nextBtn, ...(confirmOk ? {} : { opacity: 0.35, cursor: 'not-allowed' }) }}
                  onClick={confirmOk ? handleNext : undefined}
                  disabled={!confirmOk}
                >
                  {currentIdx + 1 >= session.length ? 'Finish' : 'Next →'}
                </button>
              </div>
            )
          })()}
        </div>
      </main>
    </div>
  )
}

const s = {
  page: {
    position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
    overflow: 'hidden', backgroundColor: '#f8f8f6',
    fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column',
  },
  main: {
    maxWidth: '600px', margin: '0 auto', padding: '0.5rem 1.5rem 2rem',
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
    width: '100%', boxSizing: 'border-box',
    overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch',
  },
  loadingMsg: { padding: '3rem 2rem', textAlign: 'center', color: '#888' },
  backLink: {
    padding: '0.35rem 0', fontSize: '0.875rem', color: '#555',
    background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start',
  },
  progressRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0' },
  progressBar: { flex: 1, height: '6px', backgroundColor: '#e5e5e5', borderRadius: '3px', overflow: 'hidden' },
  progressLabel: { margin: 0, fontSize: '0.8rem', color: '#888', flexShrink: 0, minWidth: '32px', textAlign: 'right' },
  card: {
    backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
    padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem',
  },
  levelTag: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  levelPill: {
    fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem',
    borderRadius: '4px', flexShrink: 0,
  },
  promptLabel: { fontSize: '0.8rem', color: '#888', fontWeight: 500 },
  word: { margin: 0, fontSize: '1.8rem', fontWeight: 700, color: '#111' },
  optionGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  optionBtn: {
    padding: '0.85rem 1rem', fontSize: '1rem', color: '#111',
    border: '1px solid #e5e5e5', borderRadius: '8px', cursor: 'pointer',
    textAlign: 'left', transition: 'background-color 0.15s',
  },
  typedArea: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  typedInput: {
    flex: 1, padding: '0.75rem 1rem', fontSize: '1rem',
    border: '1px solid #ccc', borderRadius: '8px', outline: 'none',
  },
  typedBtn: {
    padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600,
    border: 'none', borderRadius: '8px', cursor: 'pointer', width: '100%',
  },
  feedbackBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.85rem 1rem', borderRadius: '8px',
  },
  nextBtn: {
    padding: '0.5rem 1.25rem', fontSize: '0.9rem', fontWeight: 600,
    border: 'none', borderRadius: '6px', backgroundColor: '#111', color: '#fff', cursor: 'pointer',
  },
  // Summary
  summaryHeader: { paddingBottom: '0.25rem' },
  summaryTitle: { fontSize: '1.3rem', fontWeight: 700, color: '#111', marginBottom: '0.25rem' },
  summaryScore: { fontSize: '2rem', fontWeight: 700, color: '#3b82f6', lineHeight: 1.2 },
  summarySub: { fontSize: '0.82rem', color: '#aaa', marginTop: '0.25rem' },
  tableWrap: {
    backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden',
  },
  summaryVerbRow: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.625rem 1rem', borderBottom: '1px solid #f5f5f5',
  },
  summaryVerbInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 },
  summarySpanish: {
    fontSize: '0.875rem', fontWeight: 600, color: '#111',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  summaryEnglish: {
    fontSize: '0.7rem', color: '#aaa',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  summaryLevelResults: { display: 'flex', gap: '4px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' },
  summaryLevelBadge: {
    fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.4rem',
    borderRadius: '4px', whiteSpace: 'nowrap',
  },
  summaryActions: { display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: '0.25rem' },
  primaryBtn: {
    padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600,
    backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600,
    backgroundColor: '#f5f5f5', color: '#333', border: '1px solid #e5e5e5',
    borderRadius: '8px', cursor: 'pointer',
  },
  backToThemesBtn: {
    padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600,
    backgroundColor: '#3b82f6', color: '#fff', border: 'none',
    borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
  },
}
