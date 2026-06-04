import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import NavBar from '../components/NavBar'

// ── Constants ─────────────────────────────────────────────────────────────────

const PRONOUNS = [
  { key: 'yo',       label: 'Yo'            },
  { key: 'tu',       label: 'Tú'            },
  { key: 'el',       label: 'Él / Ella'     },
  { key: 'nosotros', label: 'Nosotros'      },
  { key: 'ellos',    label: 'Ellos / Ellas' },
]

const TENSE_CFG = {
  t1: { conjKey: 'present_conjugations', label: 'Present Tense',  cjCol: 't1_cj_stage', scoreCol: 't1_score' },
  t2: { conjKey: 'past_conjugations',    label: 'Past Tense',     cjCol: 't2_cj_stage', scoreCol: 't2_score' },
  t3: { conjKey: 'future_conjugations',  label: 'Future Tense',   cjCol: 't3_cj_stage', scoreCol: 't3_score' },
}

// Mirror L1/L2/L3/L4 pass thresholds
const SUB_THRESHOLD = { 0: 5, 1: 3, 2: 3, 3: 5 }
const SUB_LABEL     = ['Drag & Match', 'Multiple Choice', 'Recognition', 'Conjugation']

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((_, j) => j === 0 ? i : 0))
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    }
  }
  return dp[m][n]
}

function normalise(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9\s]/g, '').toLowerCase().trim()
}

function fuzzyMatch(typed, correct) {
  const a = normalise(typed), b = normalise(correct)
  if (a === b) return 'exact'
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 'exact'
  return (1 - levenshtein(a, b) / maxLen) >= 0.8 ? 'close' : 'wrong'
}

// ── Conjugation Drag & Match ──────────────────────────────────────────────────

function ConjDragRound({ verb, conjKey, onComplete }) {
  const forms = PRONOUNS.map(p => ({ pronounKey: p.key, label: p.label, form: verb[conjKey]?.[p.key] ?? '' }))

  const [bank, setBank]         = useState(() => shuffle(forms.map(f => ({ id: f.pronounKey, label: f.form }))))
  const [slots, setSlots]       = useState(() => forms.map(f => ({ pronounKey: f.pronounKey, label: f.label, chip: null })))
  const [checkResult, setCheckResult] = useState(null)

  const dragChipRef    = useRef(null)
  const ghostElRef     = useRef(null)
  const ghostOffsetRef = useRef({ x: 0, y: 0 })
  const slotRefs       = useRef([])
  const slotsStateRef  = useRef(slots)
  const autoAdvRef     = useRef(null)
  useEffect(() => { slotsStateRef.current = slots }, [slots])

  useEffect(() => {
    if (!checkResult) return
    const correct = checkResult.every(Boolean)
    const tid = setTimeout(() => onComplete(correct), 2500)
    autoAdvRef.current = tid
    return () => clearTimeout(tid)
  }, [checkResult])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragChipRef.current || !ghostElRef.current) return
      ghostElRef.current.style.left = (e.clientX - ghostOffsetRef.current.x) + 'px'
      ghostElRef.current.style.top  = (e.clientY - ghostOffsetRef.current.y) + 'px'
    }
    const onUp = (e) => {
      const chip = dragChipRef.current
      if (!chip) return
      dragChipRef.current = null
      if (ghostElRef.current) ghostElRef.current.style.display = 'none'
      let targetIdx = -1
      for (let i = 0; i < slotRefs.current.length; i++) {
        const el = slotRefs.current[i]
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { targetIdx = i; break }
      }
      if (targetIdx >= 0) {
        const existing = slotsStateRef.current[targetIdx]?.chip ?? null
        setSlots(prev => { const next = [...prev]; next[targetIdx] = { ...next[targetIdx], chip }; return next })
        if (existing) setBank(prev => [...prev, existing])
      } else {
        setBank(prev => [...prev, chip])
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [])

  function startDrag(chip, source, e) {
    e.preventDefault()
    if (dragChipRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    ghostOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    if (source === 'bank') setBank(prev => prev.filter(c => c.id !== chip.id))
    else setSlots(prev => prev.map((s, i) => i === source ? { ...s, chip: null } : s))
    dragChipRef.current = chip
    setCheckResult(null)
    if (ghostElRef.current) {
      ghostElRef.current.textContent = chip.label
      ghostElRef.current.style.left = (e.clientX - ghostOffsetRef.current.x) + 'px'
      ghostElRef.current.style.top  = (e.clientY - ghostOffsetRef.current.y) + 'px'
      ghostElRef.current.style.display = 'block'
    }
  }

  const allFilled = slots.every(s => s.chip !== null)

  return (
    <div style={s.dragCard}>
      <div style={s.dragHeader}>
        <span style={s.dragSpanish}>{verb.spanish_infinitive}</span>
        <span style={s.dragEnglish}>{verb.english}</span>
      </div>

      <div style={s.dragBank}>
        {bank.map(chip => (
          <div key={chip.id} style={s.dragChip} onPointerDown={e => startDrag(chip, 'bank', e)}>{chip.label}</div>
        ))}
        {bank.length === 0 && <span style={{ color: '#aaa', fontSize: '0.85rem' }}>All placed ✓</span>}
      </div>

      <div style={s.dragPairs}>
        {slots.map((slot, i) => (
          <div key={slot.pronounKey} style={s.dragPairRow}>
            <div style={s.dragPronoun}>{slot.label}</div>
            <div ref={el => slotRefs.current[i] = el} style={{ ...s.dragSlot, ...(checkResult ? (checkResult[i] ? s.slotCorrect : s.slotWrong) : {}) }}>
              {slot.chip && (
                <div
                  style={{ ...s.chipInSlot, ...(checkResult ? (checkResult[i] ? s.chipCorrect : s.chipWrong) : {}) }}
                  onPointerDown={!checkResult ? e => startDrag(slot.chip, i, e) : undefined}
                >
                  {slot.chip.label}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {allFilled && !checkResult && (
        <button style={s.checkBtn} onClick={() => setCheckResult(slots.map(sl => sl.chip?.id === sl.pronounKey))}>Check ✓</button>
      )}
      {checkResult && (
        <>
          <style>{`@keyframes cjFill{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
          <div role="button" style={s.progressBtnWrap} onClick={() => { clearTimeout(autoAdvRef.current); onComplete(checkResult.every(Boolean)) }}>
            <div style={s.progressFill} />
            <span style={s.progressLabel}>{checkResult.every(Boolean) ? 'Correct! Next →' : 'Some wrong — Next →'}</span>
          </div>
        </>
      )}

      <div ref={ghostElRef} style={{ ...s.dragChipGhost, display: 'none' }} />
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function VerbArTenseQuiz() {
  const navigate  = useNavigate()
  const { user }  = useAuth()

  const [phase,         setPhase]         = useState('loading')
  const [allVerbs,      setAllVerbs]      = useState([])
  const [activeTense,   setActiveTense]   = useState(null)   // 't1'|'t2'|'t3'
  const [activeSub,     setActiveSub]     = useState(0)      // 0-3
  const [roundVerb,     setRoundVerb]     = useState(null)
  const [dragCount,     setDragCount]     = useState(0)
  const [session,       setSession]       = useState([])
  const [currentIdx,    setCurrentIdx]    = useState(0)
  const [question,      setQuestion]      = useState(null)
  const [selectedOpt,   setSelectedOpt]   = useState(null)
  const [typedAnswer,   setTypedAnswer]   = useState('')
  const [matchResult,   setMatchResult]   = useState(null)
  const [results,       setResults]       = useState([])

  const progressRef = useRef({})
  const inputRef    = useRef(null)

  useEffect(() => { if (user) loadQuiz() }, [user?.id])

  useEffect(() => {
    if ((question?.type === 'conj-typed-rev' || question?.type === 'conj-typed') && phase === 'question') {
      inputRef.current?.focus({ preventScroll: true })
    }
  }, [question, phase])

  async function loadQuiz() {
    setPhase('loading')

    const { data: verbData } = await supabase
      .from('verbs')
      .select('id, english, spanish_infinitive, present_conjugations, past_conjugations, future_conjugations')
      .eq('category', 'Verbs -AR')

    if (!verbData?.length) { setPhase('error'); return }
    setAllVerbs(verbData)

    const verbIds = verbData.map(v => v.id)
    const { data: progressData } = await supabase
      .from('user_verb_progress')
      .select('id, verb_id, t1_score, t2_score, t3_score, t1_cj_stage, t2_cj_stage, t3_cj_stage, hidden')
      .eq('user_id', user.id)
      .in('verb_id', verbIds)

    const progMap = {}
    for (const p of progressData ?? []) {
      progMap[p.verb_id] = {
        db_id:       p.id,
        t1_score:    p.t1_score    ?? 0,
        t2_score:    p.t2_score    ?? 0,
        t3_score:    p.t3_score    ?? 0,
        t1_cj_stage: p.t1_cj_stage ?? 0,
        t2_cj_stage: p.t2_cj_stage ?? 0,
        t3_cj_stage: p.t3_cj_stage ?? 0,
        hidden:      p.hidden      ?? false,
      }
    }
    progressRef.current = progMap

    const visible = verbData.filter(v => !progMap[v.id]?.hidden)

    const t1Done = visible.every(v => (progMap[v.id]?.t1_cj_stage ?? 0) >= 4)
    const t2Done = t1Done && visible.every(v => (progMap[v.id]?.t2_cj_stage ?? 0) >= 4)
    const t3Done = t2Done && visible.every(v => (progMap[v.id]?.t3_cj_stage ?? 0) >= 4)

    if (t3Done) { setPhase('all-done'); return }

    const tenseKey = !t1Done ? 't1' : !t2Done ? 't2' : 't3'
    const cfg      = TENSE_CFG[tenseKey]
    setActiveTense(tenseKey)

    // Active sub-stage = minimum across visible verbs for this tense
    const minSub = Math.min(...visible.map(v => Math.min(progMap[v.id]?.[cfg.cjCol] ?? 0, 3)))
    setActiveSub(minSub)

    const needsWork = visible.filter(v => (progMap[v.id]?.[cfg.cjCol] ?? 0) === minSub)

    if (minSub === 0) {
      // Sub-stage 1: drag & match — pick one verb
      const verb = shuffle(needsWork)[0]
      setRoundVerb(verb)
      setPhase('drag')
    } else {
      startSession(minSub, tenseKey, needsWork, verbData, progMap)
    }
  }

  function startSession(subStage, tenseKey, needsWork, allVerbData, progMap) {
    const cfg  = TENSE_CFG[tenseKey]
    let sess   = []

    if (subStage === 1) {
      // MC: pronoun shown, pick correct conjugation
      for (let rep = 0; sess.length < Math.max(15, needsWork.length); rep++) {
        for (const verb of shuffle(needsWork)) {
          if (sess.length >= Math.max(15, needsWork.length * 3)) break
          const pronoun    = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)]
          const correct    = verb[cfg.conjKey]?.[pronoun.key] ?? ''
          const distractors = shuffle(
            allVerbData.filter(v => v.id !== verb.id).map(v => v[cfg.conjKey]?.[pronoun.key]).filter(Boolean)
          ).slice(0, 3)
          sess.push({ type: 'conj-mc', verb, pronoun, correct, options: shuffle([correct, ...distractors]), tenseKey })
        }
      }
    } else if (subStage === 2) {
      // Typed conj → English: show conjugated form, type English meaning
      for (let rep = 0; sess.length < Math.max(15, needsWork.length); rep++) {
        for (const verb of shuffle(needsWork)) {
          if (sess.length >= Math.max(15, needsWork.length * 3)) break
          const pronoun  = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)]
          const form     = verb[cfg.conjKey]?.[pronoun.key] ?? ''
          const cands    = verb.english.split(' / ').map(s => s.replace(/\s*\(.*?\)/g, '').trim()).filter(Boolean)
          if (cands[0] && !cands[0].startsWith('to ')) cands.push(`to ${cands[0]}`)
          sess.push({
            type: 'conj-typed-rev', verb, pronoun,
            prompt: `${pronoun.label}  ·  ${form}`,
            correct: cands[0],
            correctCandidates: cands,
            placeholder: 'Type the English meaning…',
            tenseKey,
          })
        }
      }
    } else if (subStage === 3) {
      // Typed English → conjugation
      for (let rep = 0; sess.length < Math.max(15, needsWork.length); rep++) {
        for (const verb of shuffle(needsWork)) {
          if (sess.length >= Math.max(15, needsWork.length * 3)) break
          const pronoun = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)]
          const correct = verb[cfg.conjKey]?.[pronoun.key] ?? ''
          const tLabel  = cfg.label.replace(' Tense', '')
          sess.push({
            type: 'conj-typed', verb, pronoun,
            prompt: `${pronoun.label}  ·  ${verb.english}  (${tLabel})`,
            correct,
            correctCandidates: [correct],
            placeholder: 'Type the Spanish conjugation…',
            tenseKey,
          })
        }
      }
    }

    sess = shuffle(sess).slice(0, Math.max(15, needsWork.length * 2))
    if (!sess.length) { loadQuiz(); return }

    setSession(sess)
    setCurrentIdx(0)
    setResults([])
    setSelectedOpt(null)
    setTypedAnswer('')
    setMatchResult(null)
    setQuestion(sess[0])
    setPhase('question')
  }

  // ── Progress ──────────────────────────────────────────────────────────────

  async function saveProgress(verbId) {
    const prog = progressRef.current[verbId]
    if (!prog) return
    const payload = {
      t1_score: prog.t1_score ?? 0, t2_score: prog.t2_score ?? 0, t3_score: prog.t3_score ?? 0,
      t1_cj_stage: prog.t1_cj_stage ?? 0, t2_cj_stage: prog.t2_cj_stage ?? 0, t3_cj_stage: prog.t3_cj_stage ?? 0,
    }
    if (prog.db_id) {
      await supabase.from('user_verb_progress').update(payload).eq('id', prog.db_id)
    } else {
      const { data } = await supabase.from('user_verb_progress')
        .upsert({ user_id: user.id, verb_id: verbId, current_stage: 4, l4_score: 5, ...payload }, { onConflict: 'user_id,verb_id' })
        .select('id').single()
      if (data) progressRef.current[verbId] = { ...progressRef.current[verbId], db_id: data.id }
    }
  }

  function recordAnswer(verbId, tenseKey, correct) {
    const prog      = progressRef.current[verbId] ?? {}
    const cfg       = TENSE_CFG[tenseKey]
    const curStage  = prog[cfg.cjCol]   ?? 0
    const curScore  = prog[cfg.scoreCol] ?? 0
    const threshold = SUB_THRESHOLD[curStage] ?? 5

    if (correct) {
      const newScore = curScore + 1
      if (newScore >= threshold) {
        progressRef.current[verbId] = { ...prog, [cfg.cjCol]: curStage + 1, [cfg.scoreCol]: 0 }
      } else {
        progressRef.current[verbId] = { ...prog, [cfg.scoreCol]: newScore }
      }
    } else {
      progressRef.current[verbId] = { ...prog, [cfg.scoreCol]: 0 }
    }
    saveProgress(verbId)
  }

  // ── Drag round ────────────────────────────────────────────────────────────

  async function handleDragComplete(correct) {
    if (!roundVerb || !activeTense) return
    if (correct) recordAnswer(roundVerb.id, activeTense, true)
    // Don't record wrong drag rounds (no penalty, just don't advance)

    const newCount = dragCount + 1
    setDragCount(newCount)

    if (newCount % 5 === 0) {
      setPhase('drag-summary')
    } else {
      loadQuiz()
    }
  }

  // ── MC answer ─────────────────────────────────────────────────────────────

  function handleMC(option) {
    if (phase !== 'question') return
    const correct = option === question.correct
    recordAnswer(question.verb.id, question.tenseKey, correct)
    setSelectedOpt(option)
    setResults(r => [...r, { verb: question.verb, correct }])
    setPhase('feedback')
  }

  // ── Typed answer ──────────────────────────────────────────────────────────

  function handleTyped() {
    const cands  = question.correctCandidates ?? [question.correct]
    const result = cands
      .map(c => fuzzyMatch(typedAnswer, c))
      .reduce((best, r) => r === 'exact' ? 'exact' : best === 'exact' ? 'exact' : r === 'close' ? 'close' : best, 'wrong')
    const correct = result !== 'wrong'
    recordAnswer(question.verb.id, question.tenseKey, correct)
    setMatchResult(result)
    setResults(r => [...r, { verb: question.verb, correct, matchResult: result }])
    setPhase('feedback')
    if (!correct) setTypedAnswer('')
  }

  function handleNext() {
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.length) { setPhase('session-summary'); return }
    setCurrentIdx(nextIdx)
    setQuestion(session[nextIdx])
    setSelectedOpt(null)
    setTypedAnswer('')
    setMatchResult(null)
    setPhase('question')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'loading') return <div style={s.page}><NavBar /><p style={s.loadingMsg}>Loading…</p></div>

  if (phase === 'error') {
    return (
      <div style={s.page}><NavBar />
        <main style={s.main}>
          <p style={{ color: '#c00' }}>Could not load Verbs -AR.</p>
          <button style={s.backBtn} onClick={() => navigate('/verbs')}>← Back</button>
        </main>
      </div>
    )
  }

  if (phase === 'all-done') {
    return (
      <div style={s.page}><NavBar />
        <main style={s.main}>
          <button style={s.backBtn} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>
          <div style={s.card}><p style={{ margin: 0, color: '#555' }}>All conjugation stages for Verbs -AR are complete. Excellent work!</p></div>
        </main>
      </div>
    )
  }

  const tenseLabel   = activeTense ? TENSE_CFG[activeTense].label : ''
  const subLabel     = activeSub < SUB_LABEL.length ? SUB_LABEL[activeSub] : ''

  // ── Drag phase ────────────────────────────────────────────────────────────

  if (phase === 'drag') {
    return (
      <div style={s.scrollPage}><NavBar />
        <main style={s.scrollMain}>
          <div style={s.phaseRow}>
            <span style={s.tenseTag}>{tenseLabel}</span>
            <span style={s.subTag}>Stage 1 · {subLabel}</span>
          </div>
          {roundVerb && (
            <ConjDragRound
              key={`${roundVerb.id}-${dragCount}`}
              verb={roundVerb}
              conjKey={TENSE_CFG[activeTense].conjKey}
              onComplete={handleDragComplete}
            />
          )}
        </main>
      </div>
    )
  }

  // ── Drag summary ──────────────────────────────────────────────────────────

  if (phase === 'drag-summary') {
    const cfg = TENSE_CFG[activeTense]
    return (
      <div style={s.scrollPage}><NavBar />
        <main style={s.scrollMain}>
          <div style={s.summaryCard}>
            <div style={s.summaryHeader}>
              <span style={s.summaryTitle}>{tenseLabel} · Drag & Match</span>
              <span style={s.summarySub}>Match conjugations to their pronoun</span>
            </div>
            {allVerbs.filter(v => !progressRef.current[v.id]?.hidden).map(v => {
              const prog  = progressRef.current[v.id]
              const stage = prog?.[cfg.cjCol]    ?? 0
              const score = stage === 0 ? Math.min(prog?.[cfg.scoreCol] ?? 0, 5) : 5
              return (
                <div key={v.id} style={s.summaryRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.summarySpanish}>{v.spanish_infinitive}</div>
                    <div style={s.summaryEnglish}>{v.english}</div>
                  </div>
                  <div style={s.dots}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} style={{
                        width: '11px', height: '11px', borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0,
                        backgroundColor: i < score ? '#16a34a' : 'transparent',
                        border: `2px solid ${i < score ? '#16a34a' : '#d1d5db'}`,
                      }} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <button style={{ ...s.primaryBtn, width: '100%' }} onClick={loadQuiz}>Continue</button>
          <button style={s.blueBtn} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>
        </main>
      </div>
    )
  }

  // ── Session summary ───────────────────────────────────────────────────────

  if (phase === 'session-summary') {
    const correct = results.filter(r => r.correct).length
    return (
      <div style={s.page}><NavBar />
        <main style={{ ...s.main, maxWidth: '560px' }}>
          <div style={s.card}>
            <span style={s.tenseTag}>{tenseLabel}</span>
            <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.25rem 0 0', color: '#111' }}>
              {correct} / {results.length} correct
            </p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#888' }}>Stage {activeSub + 1} · {subLabel}</p>
          </div>
          <button style={{ ...s.primaryBtn, width: '100%' }} onClick={loadQuiz}>Continue</button>
          <button style={s.blueBtn} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>
        </main>
      </div>
    )
  }

  // ── Question / feedback ───────────────────────────────────────────────────

  const confirmOk = (() => {
    if (phase !== 'feedback' || !matchResult) return true
    if (matchResult !== 'wrong') return true
    const cands = question.correctCandidates ?? [question.correct]
    return cands.some(c => fuzzyMatch(typedAnswer, c) !== 'wrong')
  })()

  return (
    <div style={s.page}><NavBar />
      <main style={s.main}>
        <div style={s.progressRow}>
          <div style={s.progressBar}>
            <div style={{ display: 'flex', height: '100%' }}>
              {session.map((_, i) => {
                const r  = results[i]
                const bg = r ? (r.correct ? '#16a34a' : '#dc2626') : '#e5e5e5'
                return <div key={i} style={{ flex: 1, backgroundColor: bg }} />
              })}
            </div>
          </div>
          <span style={s.progressLabel}>{currentIdx + 1} / {session.length}</span>
        </div>

        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={s.tenseTag}>{tenseLabel}</span>
            <span style={s.subTagSm}>Stage {activeSub + 1} · {subLabel}</span>
          </div>

          <p style={s.word}>{question.prompt}</p>

          {question.type === 'conj-mc' && (
            <div style={s.optionGrid}>
              {question.options.map(opt => {
                let bg = '#fff'
                if (phase === 'feedback') {
                  if (opt === question.correct) bg = '#dcfce7'
                  else if (opt === selectedOpt) bg = '#fee2e2'
                }
                return (
                  <button
                    key={opt}
                    style={{ ...s.optionBtn, backgroundColor: bg }}
                    onClick={() => phase === 'question' && handleMC(opt)}
                    disabled={phase === 'feedback'}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          )}

          {(question.type === 'conj-typed-rev' || question.type === 'conj-typed') && (
            <div style={s.typedArea}>
              <input
                ref={inputRef}
                style={{ ...s.typedInput, ...(phase === 'feedback' && matchResult === 'wrong' ? { borderColor: '#3b82f6', borderWidth: 2 } : {}) }}
                type="text"
                value={typedAnswer}
                onChange={e => setTypedAnswer(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (phase === 'question') handleTyped()
                    else if (phase === 'feedback' && matchResult === 'wrong' && confirmOk) handleNext()
                  }
                }}
                disabled={phase === 'feedback' && matchResult !== 'wrong'}
                placeholder={phase === 'feedback' && matchResult === 'wrong' ? 'Type the correct answer to continue…' : question.placeholder}
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-form-type="other"
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
            const isMC       = question.type === 'conj-mc'
            const isCorrect  = isMC ? selectedOpt === question.correct : matchResult !== 'wrong'
            const bannerBg   = isMC
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

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page: {
    position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
    overflow: 'hidden', backgroundColor: '#f8f8f6',
    fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column',
  },
  scrollPage: { minHeight: '100vh', backgroundColor: '#f8f8f6', fontFamily: 'system-ui, sans-serif' },
  scrollMain: {
    maxWidth: '600px', margin: '0 auto', padding: '0.5rem 1.5rem 3rem',
    display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', boxSizing: 'border-box',
  },
  main: {
    maxWidth: '600px', margin: '0 auto', padding: '0.5rem 1.5rem 2rem',
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
    width: '100%', boxSizing: 'border-box', overflowY: 'auto', flex: 1,
    WebkitOverflowScrolling: 'touch',
  },
  loadingMsg: { padding: '3rem 2rem', textAlign: 'center', color: '#888' },
  backBtn: { padding: '0.35rem 0', fontSize: '0.875rem', color: '#555', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' },
  phaseRow: { display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.25rem 0' },
  tenseTag: {
    fontSize: '0.68rem', fontWeight: 700, color: '#3b82f6',
    backgroundColor: '#eff6ff', padding: '0.2rem 0.5rem',
    borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
  },
  subTag:   { fontSize: '0.78rem', color: '#888', fontWeight: 500 },
  subTagSm: { fontSize: '0.72rem', color: '#999', fontWeight: 400 },
  progressRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0' },
  progressBar: { flex: 1, height: '6px', backgroundColor: '#e5e5e5', borderRadius: '3px', overflow: 'hidden' },
  progressLabel: { margin: 0, fontSize: '0.8rem', color: '#888', flexShrink: 0, minWidth: '32px', textAlign: 'right' },
  card: {
    backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
    padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem',
  },
  word: { margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111' },
  optionGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  optionBtn: {
    padding: '0.85rem 1rem', fontSize: '1rem', color: '#111',
    border: '1px solid #e5e5e5', borderRadius: '8px', cursor: 'pointer',
    textAlign: 'left', transition: 'background-color 0.15s',
  },
  typedArea: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  typedInput: { flex: 1, padding: '0.75rem 1rem', fontSize: '1rem', border: '1px solid #ccc', borderRadius: '8px', outline: 'none' },
  typedBtn: { padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600, border: 'none', borderRadius: '8px', cursor: 'pointer', width: '100%' },
  feedbackBanner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', borderRadius: '8px' },
  nextBtn: { padding: '0.5rem 1.25rem', fontSize: '0.9rem', fontWeight: 600, border: 'none', borderRadius: '6px', backgroundColor: '#111', color: '#fff', cursor: 'pointer' },
  primaryBtn: { padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' },
  blueBtn: { padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600, backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', width: '100%', textAlign: 'center' },
  // Drag styles
  dragCard: { backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  dragHeader: { display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' },
  dragSpanish: { fontSize: '1.4rem', fontWeight: 700, color: '#111' },
  dragEnglish: { fontSize: '0.85rem', color: '#888' },
  dragBank: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '48px', backgroundColor: '#f8f8f6', borderRadius: '8px', padding: '0.5rem', border: '1.5px dashed #e0e0e0', alignItems: 'center' },
  dragChip: { padding: '0.4rem 0.875rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 500, cursor: 'grab', userSelect: 'none', touchAction: 'none', whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(59,130,246,0.3)' },
  dragPairs: { display: 'flex', flexDirection: 'column', gap: '0.625rem' },
  dragPairRow: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  dragPronoun: { flex: 1, fontSize: '0.95rem', color: '#333', fontWeight: 500, minWidth: 0 },
  dragSlot: { width: '130px', minHeight: '40px', borderRadius: '6px', border: '2px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', flexShrink: 0, transition: 'border-color 0.15s, background-color 0.15s' },
  slotCorrect: { borderColor: '#16a34a', borderStyle: 'solid', backgroundColor: '#dcfce7' },
  slotWrong:   { borderColor: '#dc2626', borderStyle: 'solid', backgroundColor: '#fee2e2' },
  chipInSlot: { padding: '0.35rem 0.625rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '5px', fontSize: '0.85rem', fontWeight: 500, cursor: 'grab', userSelect: 'none', touchAction: 'none', whiteSpace: 'nowrap', maxWidth: '118px', overflow: 'hidden', textOverflow: 'ellipsis' },
  chipCorrect: { backgroundColor: '#16a34a', cursor: 'default' },
  chipWrong:   { backgroundColor: '#dc2626', cursor: 'default' },
  checkBtn: { padding: '0.75rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', width: '100%' },
  progressBtnWrap: { position: 'relative', overflow: 'hidden', borderRadius: '8px', backgroundColor: '#dcfce7', cursor: 'pointer', padding: '0.75rem', textAlign: 'center', userSelect: 'none', boxSizing: 'border-box' },
  progressFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#16a34a', transformOrigin: 'left center', transform: 'scaleX(0)', animation: 'cjFill 2.5s linear forwards' },
  progressLabel: { position: 'relative', zIndex: 1, color: '#fff', fontWeight: 600, fontSize: '1rem', textShadow: '0 1px 3px rgba(0,0,0,0.35)' },
  dragChipGhost: { position: 'fixed', padding: '0.4rem 0.875rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 500, pointerEvents: 'none', zIndex: 9999, userSelect: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(59,130,246,0.4)', transform: 'scale(1.08)' },
  // Summary
  summaryCard: { backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden' },
  summaryHeader: { padding: '1rem 1.25rem 0.75rem', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '2px' },
  summaryTitle: { fontSize: '0.9rem', fontWeight: 700, color: '#111' },
  summarySub:   { fontSize: '0.75rem', color: '#888' },
  summaryRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1.25rem', borderBottom: '1px solid #f5f5f5' },
  summarySpanish: { fontSize: '0.9rem', fontWeight: 600, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  summaryEnglish: { fontSize: '0.78rem', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  dots: { display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 },
}
