import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import NavBar from '../components/NavBar'
import {
  PRONOUNS, MASTERY_TENSES, shuffle, noConsecutivePronoun,
  buildDualQuestion, checkDualAnswer, dualConfirmOk,
} from '../utils/arConjugation'

// AR Mastery quiz — practice only. Draws Stage 4 "Full Conjugation" questions
// (typed EN → pronoun + conjugation) mixed evenly across Present / Past / Future.
// It NEVER writes conjugation counts or any tense progression; results live in
// memory only. Unlocked once every visible Verbs -AR verb has t1/t2/t3_cj_stage = 4.

const PER_TENSE = 5 // 5 per tense × 3 tenses = 15 questions, evenly split

function buildSession(verbs) {
  const out = []
  for (const tense of MASTERY_TENSES) {
    const verbPool = shuffle(verbs)
    for (let i = 0; i < PER_TENSE; i++) {
      const verb    = verbPool[i % verbPool.length]
      const pronoun = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)]
      if (!verb?.[tense.conjKey]?.[pronoun.key]) continue // skip if no stored form
      out.push(buildDualQuestion(verb, pronoun, tense))
    }
  }
  // Interleave so tenses are mixed (banner matters), avoiding adjacent repeats.
  return noConsecutivePronoun(shuffle(out))
}

export default function VerbMasteryQuiz() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [phase,       setPhase]       = useState('loading') // loading|locked|error|question|feedback|summary
  const [session,     setSession]     = useState([])
  const [currentIdx,  setCurrentIdx]  = useState(0)
  const [question,    setQuestion]    = useState(null)
  const [typedAnswer, setTypedAnswer] = useState('')
  const [typedAnswer2,setTypedAnswer2]= useState('')
  const [typedAnswer3,setTypedAnswer3]= useState('')
  const [f1Ok, setF1Ok] = useState(null)
  const [f2Ok, setF2Ok] = useState(null)
  const [f3Ok, setF3Ok] = useState(null)
  const [matchResult, setMatchResult] = useState(null)
  const [results,     setResults]     = useState([])

  const inputRef  = useRef(null)
  const inputRef2 = useRef(null)
  const inputRef3 = useRef(null)
  const savedRef  = useRef(false) // guards the one-per-session metric write

  useEffect(() => { if (user) loadQuiz() }, [user?.id])

  useEffect(() => {
    if (phase === 'question') inputRef.current?.focus({ preventScroll: true })
  }, [question, phase])

  async function loadQuiz() {
    setPhase('loading')
    const { data: verbData, error } = await supabase
      .from('verbs')
      .select('id, english, spanish_infinitive, present_conjugations, past_conjugations, future_conjugations')
      .eq('category', 'Verbs -AR')
    if (error || !verbData?.length) { setPhase('error'); return }

    const verbIds = verbData.map(v => v.id)
    const { data: progress } = await supabase
      .from('user_verb_progress')
      .select('verb_id, t1_cj_stage, t2_cj_stage, t3_cj_stage, hidden')
      .eq('user_id', user.id)
      .in('verb_id', verbIds)

    const progMap = {}
    for (const p of progress ?? []) progMap[p.verb_id] = p

    const visible = verbData.filter(v => !progMap[v.id]?.hidden)
    // Unlock only when Present, Past and Future are all fully mastered for every
    // visible AR verb (read from Supabase). Defensive re-check even though the
    // entry point is gated in the category modal.
    const unlocked = visible.length > 0 && visible.every(v => {
      const p = progMap[v.id]
      return (p?.t1_cj_stage ?? 0) >= 4 && (p?.t2_cj_stage ?? 0) >= 4 && (p?.t3_cj_stage ?? 0) >= 4
    })
    if (!unlocked) { setPhase('locked'); return }

    const sess = buildSession(visible)
    if (!sess.length) { setPhase('error'); return }
    setSession(sess)
    setCurrentIdx(0)
    setResults([])
    resetInputs()
    savedRef.current = false
    setQuestion(sess[0])
    setPhase('question')
  }

  // ── Practice metric: last-5 Mastery session results (Supabase, not localStorage) ──
  // Build this session's result: timestamp, overall score, and per-tense (1/2/3) and
  // per-pronoun correct/incorrect breakdown, so a future overview can analyse weakness.
  function buildSessionResult(rs) {
    const tNum = { t1: 1, t2: 2, t3: 3 }
    const tense   = { 1: { correct: 0, incorrect: 0 }, 2: { correct: 0, incorrect: 0 }, 3: { correct: 0, incorrect: 0 } }
    const pronoun = { yo: { correct: 0, incorrect: 0 }, tu: { correct: 0, incorrect: 0 }, el: { correct: 0, incorrect: 0 }, nosotros: { correct: 0, incorrect: 0 }, ellos: { correct: 0, incorrect: 0 } }
    for (const r of rs) {
      const bucket = r.correct ? 'correct' : 'incorrect'
      const t = tNum[r.tenseKey]
      if (tense[t]) tense[t][bucket] += 1
      const pk = r.pronoun?.key
      if (pronoun[pk]) pronoun[pk][bucket] += 1
    }
    return {
      at: new Date().toISOString(),
      correct: rs.filter(r => r.correct).length,
      total: rs.length,
      tense,
      pronoun,
    }
  }

  // Persist the session result, keeping only the 5 most recent per user (newest
  // first). Practice metric only — never touches tense progression.
  async function saveMasterySession(rs) {
    if (!user?.id || !rs.length) return
    const sessionResult = buildSessionResult(rs)
    try {
      const { data } = await supabase
        .from('user_verb_mastery_results')
        .select('recent_sessions')
        .eq('user_id', user.id)
        .maybeSingle()
      const existing = Array.isArray(data?.recent_sessions) ? data.recent_sessions : []
      const recent_sessions = [sessionResult, ...existing].slice(0, 5)
      const { error } = await supabase
        .from('user_verb_mastery_results')
        .upsert({ user_id: user.id, recent_sessions, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) console.warn('[mastery] save failed:', error.message)
    } catch (e) { console.warn('[mastery] save failed:', e?.message ?? e) }
  }

  function resetInputs() {
    setTypedAnswer(''); setTypedAnswer2(''); setTypedAnswer3('')
    setF1Ok(null); setF2Ok(null); setF3Ok(null); setMatchResult(null)
  }

  // Practice only: check the answer and record it in memory. No conjugation counts,
  // no tense progression, no DB writes of any kind.
  function handleTyped() {
    const { result, f1Ok: n1, f2Ok: n2, f3Ok: n3, correct } = checkDualAnswer(question, typedAnswer, typedAnswer2, typedAnswer3)
    setF1Ok(n1); setF2Ok(n2); setF3Ok(n3)
    setMatchResult(result)
    setResults(r => [...r, { tenseKey: question.tenseKey, pronoun: question.pronoun, correct, matchResult: result }])
    setPhase('feedback')
    if (question.tripleInput) {
      if (!n1) { setTypedAnswer(''); setTypedAnswer2('') }
      if (!n3) setTypedAnswer3('')
    } else {
      if (!n1) setTypedAnswer('')
      if (!n2) setTypedAnswer2('')
    }
  }

  function handleNext() {
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.length) {
      // Session complete — persist the result once (practice metric only).
      if (!savedRef.current) { savedRef.current = true; saveMasterySession(results) }
      setPhase('summary')
      return
    }
    setCurrentIdx(nextIdx)
    setQuestion(session[nextIdx])
    resetInputs()
    setPhase('question')
  }

  // ── Guarded renders ─────────────────────────────────────────────────────────
  if (phase === 'loading') return <div style={s.page}><NavBar /><p style={s.loadingMsg}>Loading…</p></div>

  if (phase === 'error') {
    return (
      <div style={s.page}><NavBar />
        <main style={s.main}>
          <p style={{ color: '#c00' }}>Could not start the AR Mastery quiz.</p>
          <button style={s.backBtn} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>
        </main>
      </div>
    )
  }

  if (phase === 'locked') {
    return (
      <div style={s.page}><NavBar />
        <main style={s.main}>
          <button style={s.backBtn} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>
          <div style={s.card}>
            <p style={{ margin: 0, color: '#555' }}>
              🔒 AR Mastery is locked. Master Present, Past and Future tenses for all Verbs -AR to unlock it.
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'summary') {
    const correct = results.filter(r => r.correct).length
    const byTense = MASTERY_TENSES.map(t => {
      const rs = results.filter(r => r.tenseKey === t.key)
      return { label: t.label, bg: t.bannerBg, correct: rs.filter(r => r.correct).length, total: rs.length }
    })
    return (
      <div style={s.page}><NavBar />
        <main style={{ ...s.main, maxWidth: '560px' }}>
          <div style={s.card}>
            <span style={s.masteryTag}>AR Mastery · Practice</span>
            <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.4rem 0 0.1rem', color: '#111' }}>
              {correct} / {results.length} correct
            </p>
            <p style={{ fontSize: '0.72rem', color: '#aaa', margin: '0 0 0.75rem' }}>This session's result (practice — no progress changed)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {byTense.map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ ...s.tenseChip, backgroundColor: row.bg }}>{row.label}</span>
                  <span style={{ fontSize: '0.85rem', color: '#555' }}>{row.correct} / {row.total} correct</span>
                </div>
              ))}
            </div>
          </div>
          <button style={{ ...s.primaryBtn, width: '100%' }} onClick={loadQuiz}>Play again</button>
          <button style={s.blueBtn} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>
        </main>
      </div>
    )
  }

  // ── Question / feedback ─────────────────────────────────────────────────────
  const isFb      = phase === 'feedback'
  const f1Wrong   = isFb && f1Ok === false, f1Correct = isFb && f1Ok === true
  const f2Wrong   = isFb && f2Ok === false, f2Correct = isFb && f2Ok === true
  const f3Wrong   = isFb && f3Ok === false, f3Correct = isFb && f3Ok === true
  const fieldStyle = (wrong, correct) => ({
    ...s.typedInput,
    ...(wrong   ? { borderColor: '#dc2626', borderWidth: 2 } : {}),
    ...(correct ? { borderColor: '#16a34a', borderWidth: 2, backgroundColor: '#16a34a', color: '#fff' } : {}),
  })
  const confirmOk = !isFb || matchResult !== 'wrong'
    ? true
    : dualConfirmOk(question, typedAnswer, typedAnswer2, typedAnswer3, f1Ok, f2Ok, f3Ok)

  return (
    <div style={s.page}><NavBar />
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
          {/* Coloured tense banner — tells the user which tense to conjugate into */}
          <div style={{ ...s.tenseBanner, backgroundColor: question.tenseMeta.bannerBg }}>
            {question.tenseMeta.label}
          </div>

          <p style={s.word}>{question.prompt}</p>

          <div style={s.typedArea}>
            {/* Input 1: pronoun (or first of two pronouns for el/ella, ellos/ellas) */}
            <input
              ref={inputRef}
              style={fieldStyle(f1Wrong, f1Correct)}
              type="text"
              value={typedAnswer}
              onChange={e => setTypedAnswer(e.target.value)}
              onFocus={() => { if (f1Wrong) setTypedAnswer('') }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (phase === 'question') inputRef2.current?.focus({ preventScroll: true })
                  else if (isFb && matchResult === 'wrong' && confirmOk) handleNext()
                }
              }}
              disabled={isFb && (matchResult !== 'wrong' || f1Correct)}
              placeholder={f1Wrong
                ? (question.tripleInput ? `${question.correctPronounCandidates[0]}…` : `Pronoun — ${question.correctPronoun}`)
                : (question.tripleInput ? 'First subject pronoun…' : 'Subject pronoun (e.g. yo)')}
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-form-type="other"
            />
            {/* Input 2: second pronoun (tripleInput) or conjugation */}
            <input
              ref={inputRef2}
              style={fieldStyle(f2Wrong, f2Correct)}
              type="text"
              value={typedAnswer2}
              onChange={e => setTypedAnswer2(e.target.value)}
              onFocus={() => { if (f2Wrong) setTypedAnswer2('') }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (phase === 'question') {
                    if (question.tripleInput) inputRef3.current?.focus({ preventScroll: true })
                    else handleTyped()
                  } else if (isFb && matchResult === 'wrong' && confirmOk) handleNext()
                }
              }}
              disabled={isFb && (matchResult !== 'wrong' || f2Correct)}
              placeholder={f2Wrong
                ? (question.tripleInput ? `${question.correctPronounCandidates[1]}…` : `Conjugation — ${question.correctConjugation}`)
                : (question.tripleInput ? 'Second subject pronoun…' : 'Conjugated verb (e.g. hablo)')}
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-form-type="other"
            />
            {/* Input 3: conjugation (tripleInput only) */}
            {question.tripleInput && (
              <input
                ref={inputRef3}
                style={fieldStyle(f3Wrong, f3Correct)}
                type="text"
                value={typedAnswer3}
                onChange={e => setTypedAnswer3(e.target.value)}
                onFocus={() => { if (f3Wrong) setTypedAnswer3('') }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (phase === 'question') handleTyped()
                    else if (isFb && matchResult === 'wrong' && confirmOk) handleNext()
                  }
                }}
                disabled={isFb && (matchResult !== 'wrong' || f3Correct)}
                placeholder={f3Wrong ? `Conjugation — ${question.correctConjugation}` : 'Conjugated verb (e.g. habla)'}
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-form-type="other"
              />
            )}
            {phase === 'question' && (
              <button
                style={{ ...s.typedBtn, backgroundColor: (typedAnswer.trim() || typedAnswer2.trim() || typedAnswer3.trim()) ? '#16a34a' : '#f59e0b', color: '#fff' }}
                onClick={handleTyped}
              >
                {(typedAnswer.trim() || typedAnswer2.trim() || typedAnswer3.trim()) ? 'Check' : 'Pass'}
              </button>
            )}
          </div>

          {isFb && (() => {
            const pronounLabel = question.tripleInput ? question.correctPronounCandidates.join(' / ') : question.correctPronoun
            const bannerBg    = matchResult === 'exact' ? '#dcfce7' : matchResult === 'close' ? '#fef3c7' : '#fee2e2'
            const bannerColor = matchResult === 'exact' ? '#16a34a' : matchResult === 'close' ? '#d97706' : '#dc2626'
            const label = matchResult === 'exact' ? 'Correct!'
              : matchResult === 'close' ? `Close — ${pronounLabel}  ·  ${question.correctConjugation}`
              : `Incorrect — ${pronounLabel}  ·  ${question.correctConjugation}`
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
    width: '100%', boxSizing: 'border-box', overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch',
  },
  loadingMsg: { padding: '3rem 2rem', textAlign: 'center', color: '#888' },
  backBtn: { padding: '0.35rem 0', fontSize: '0.875rem', color: '#555', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' },
  progressRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0' },
  progressBar: { flex: 1, height: '6px', backgroundColor: '#e5e5e5', borderRadius: '3px', overflow: 'hidden' },
  progressLabel: { margin: 0, fontSize: '0.8rem', color: '#888', flexShrink: 0, minWidth: '32px', textAlign: 'right' },
  card: {
    backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
    padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem',
  },
  tenseBanner: {
    color: '#fff', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.06em',
    textTransform: 'uppercase', textAlign: 'center', padding: '0.55rem 0.75rem',
    borderRadius: '8px',
  },
  word: { margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111' },
  typedArea: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  typedInput: { flex: 1, padding: '0.75rem 1rem', fontSize: '1rem', border: '1px solid #ccc', borderRadius: '8px', outline: 'none' },
  typedBtn: { padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600, border: 'none', borderRadius: '8px', cursor: 'pointer', width: '100%' },
  feedbackBanner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', borderRadius: '8px' },
  nextBtn: { padding: '0.5rem 1.25rem', fontSize: '0.9rem', fontWeight: 600, border: 'none', borderRadius: '6px', backgroundColor: '#111', color: '#fff', cursor: 'pointer' },
  masteryTag: {
    fontSize: '0.68rem', fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff',
    padding: '0.2rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.04em', alignSelf: 'flex-start',
  },
  tenseChip: { color: '#fff', fontWeight: 700, fontSize: '0.68rem', padding: '0.2rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.03em', minWidth: '58px', textAlign: 'center' },
  primaryBtn: { padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' },
  blueBtn: { padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600, backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', width: '100%', textAlign: 'center' },
}
