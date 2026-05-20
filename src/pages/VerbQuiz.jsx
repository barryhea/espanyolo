import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { VERB_CATEGORIES } from '../utils/courseData'
import NavBar from '../components/NavBar'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Fuzzy matching (S3 & S4 typed answers) ────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function pickEnglishDistractors(verb, allVerbs) {
  return shuffle(allVerbs.filter(v => v.id !== verb.id))
    .slice(0, 3)
    .map(v => v.english)
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

function MasteryBar({ stage, mastered }) {
  const s1done = stage >= 2 || mastered
  const s2done = stage >= 3 || mastered
  const s3done = stage >= 4 || mastered
  const s4done = mastered
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
        Mastery
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '26px', height: '18px', borderRadius: '5px',
          backgroundColor: s1done ? '#16a34a' : '#e5e7eb',
          transition: 'background-color 0.2s',
        }}>
          <span style={{ fontSize: '0.7rem', color: s1done ? '#fff' : '#9ca3af', fontWeight: 700, lineHeight: 1 }}>✓</span>
        </div>
        <span style={{ fontSize: '1.15rem', opacity: s2done ? 1 : 0.2, transition: 'opacity 0.2s', lineHeight: 1 }}>🥉</span>
        <span style={{ fontSize: '1.15rem', opacity: s3done ? 1 : 0.2, transition: 'opacity 0.2s', lineHeight: 1 }}>🥈</span>
        <span style={{ fontSize: '1.15rem', opacity: s4done ? 1 : 0.2, transition: 'opacity 0.2s', lineHeight: 1 }}>🥇</span>
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

// ── S1: Drag & Match ──────────────────────────────────────────────────────────
// Props: roundVerbs [{id, english, spanish_infinitive}], onComplete(verbIds[])
function DragMatchRound({ roundVerbs, onComplete }) {
  const [bank, setBank] = useState(() =>
    shuffle(roundVerbs.map(v => ({ id: v.id, label: v.spanish_infinitive })))
  )
  const [slots, setSlots] = useState(() =>
    roundVerbs.map(v => ({ verbId: v.id, english: v.english, chip: null }))
  )
  const [checkResult, setCheckResult] = useState(null) // null | boolean[]

  // Drag state stored in refs so window handlers never go stale
  const dragChipRef = useRef(null)
  const ghostElRef = useRef(null)
  const ghostOffsetRef = useRef({ x: 0, y: 0 })
  const slotRefs = useRef([])
  const slotsStateRef = useRef(slots)
  useEffect(() => { slotsStateRef.current = slots }, [slots])

  // Attach global pointer listeners once on mount
  useEffect(() => {
    const onMove = (e) => {
      if (!dragChipRef.current || !ghostElRef.current) return
      ghostElRef.current.style.left = (e.clientX - ghostOffsetRef.current.x) + 'px'
      ghostElRef.current.style.top = (e.clientY - ghostOffsetRef.current.y) + 'px'
    }

    const onUp = (e) => {
      const chip = dragChipRef.current
      if (!chip) return
      dragChipRef.current = null
      if (ghostElRef.current) ghostElRef.current.style.display = 'none'

      // Hit-test against slot bounding rects
      let targetIdx = -1
      for (let i = 0; i < slotRefs.current.length; i++) {
        const el = slotRefs.current[i]
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          targetIdx = i
          break
        }
      }

      if (targetIdx >= 0) {
        const existing = slotsStateRef.current[targetIdx]?.chip ?? null
        setSlots(prev => {
          const next = [...prev]
          next[targetIdx] = { ...next[targetIdx], chip }
          return next
        })
        if (existing) setBank(prev => [...prev, existing])
      } else {
        // Dropped outside any slot — return to bank
        setBank(prev => [...prev, chip])
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, []) // attach once

  function startDrag(chip, source, e) {
    e.preventDefault()
    if (dragChipRef.current) return // already dragging

    // Measure grab offset so ghost doesn't jump
    const rect = e.currentTarget.getBoundingClientRect()
    ghostOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }

    // Remove from source immediately
    if (source === 'bank') {
      setBank(prev => prev.filter(c => c.id !== chip.id))
    } else {
      // source is a slot index
      setSlots(prev => prev.map((s, i) => i === source ? { ...s, chip: null } : s))
    }

    dragChipRef.current = chip
    setCheckResult(null)

    if (ghostElRef.current) {
      ghostElRef.current.textContent = chip.label
      ghostElRef.current.style.left = (e.clientX - ghostOffsetRef.current.x) + 'px'
      ghostElRef.current.style.top = (e.clientY - ghostOffsetRef.current.y) + 'px'
      ghostElRef.current.style.display = 'block'
    }
  }

  function handleCheck() {
    const results = slots.map(slot => slot.chip?.id === slot.verbId)
    setCheckResult(results)
  }

  const allFilled = slots.every(s => s.chip !== null)
  const allCorrect = checkResult !== null && checkResult.every(Boolean)
  const wrongVerbIds = checkResult
    ? slots.map((slot, i) => checkResult[i] ? null : slot.verbId).filter(Boolean)
    : []

  return (
    <div style={styles.dmCard}>
      {/* Chip bank */}
      <div>
        <span style={styles.dmBankLabel}>Drag to match</span>
        <div style={styles.dmBank}>
          {bank.map(chip => (
            <div
              key={chip.id}
              style={styles.dmChip}
              onPointerDown={e => startDrag(chip, 'bank', e)}
            >
              {chip.label}
            </div>
          ))}
          {bank.length === 0 && (
            <span style={{ color: '#aaa', fontSize: '0.85rem' }}>All placed ✓</span>
          )}
        </div>
      </div>

      {/* Pair rows */}
      <div style={styles.dmPairs}>
        {slots.map((slot, i) => (
          <div key={slot.verbId} style={styles.dmPairRow}>
            <div style={styles.dmEnglish}>{slot.english}</div>
            <div
              ref={el => slotRefs.current[i] = el}
              style={{
                ...styles.dmSlot,
                ...(checkResult ? (checkResult[i] ? styles.dmSlotCorrect : styles.dmSlotWrong) : {}),
              }}
            >
              {slot.chip && (
                <div
                  style={{
                    ...styles.dmChipInSlot,
                    ...(checkResult ? (checkResult[i] ? styles.dmChipCorrect : styles.dmChipWrong) : {}),
                  }}
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
        <button style={styles.dmCheckBtn} onClick={handleCheck}>Check ✓</button>
      )}
      {checkResult && (
        <button
          style={allCorrect ? styles.dmCheckBtn : styles.dmNextBtn}
          onClick={() => onComplete(allCorrect ? roundVerbs.map(v => v.id) : [], wrongVerbIds)}
        >
          {allCorrect ? '✓ Next round →' : 'Next round →'}
        </button>
      )}

      {/* Ghost chip — positioned via DOM ref, no re-render on move */}
      <div ref={ghostElRef} style={{ ...styles.dmChipGhost, display: 'none' }} />
    </div>
  )
}

// ── Question builder (S2/S3/S4 — unchanged) ───────────────────────────────────
function makeQuestion(verb, allVerbs, progMap) {
  const stage = progMap[verb.id]?.stage ?? 1
  if (stage <= 2) {
    // S2: MC — Spanish infinitive shown, pick English
    const distractors = pickEnglishDistractors(verb, allVerbs)
    return {
      type: 'mc',
      verb,
      options: shuffle([verb.english, ...distractors]),
      correct: verb.english,
    }
  }
  if (stage === 3) {
    // S3: typed ES→EN — Spanish infinitive shown, type English
    return {
      type: 'typed',
      verb,
      correct: verb.english,
      placeholder: 'Type the English meaning…',
    }
  }
  // S4: typed EN→ES — English shown, type Spanish infinitive
  return {
    type: 'typed',
    verb,
    prompt: verb.english,
    correct: verb.spanish_infinitive,
    placeholder: 'Type the Spanish infinitive…',
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function VerbQuiz() {
  const { categoryId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const category = VERB_CATEGORIES.find(c => c.id === Number(categoryId))
  const progressRef = useRef({})
  const inputRef = useRef(null)
  const recentlyUsedRef = useRef([])

  const [phase, setPhase] = useState('loading')
  const [allVerbs, setAllVerbs] = useState([])
  const [roundVerbs, setRoundVerbs] = useState([])             // S1 current round
  const [session, setSession] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [question, setQuestion] = useState(null)
  const [selectedOption, setSelectedOption] = useState(null)   // S2 MC
  const [isCorrect, setIsCorrect] = useState(null)             // S2 MC feedback
  const [typedAnswer, setTypedAnswer] = useState('')           // S3/S4 typed
  const [matchResult, setMatchResult] = useState(null)         // S3/S4 fuzzy result
  const [results, setResults] = useState([])

  useEffect(() => {
    if (category && user) loadQuiz()
  }, [category?.id, user?.id])

  // Auto-focus typed input when a typed question loads
  useEffect(() => {
    if (question?.type === 'typed' && phase === 'question') {
      inputRef.current?.focus({ preventScroll: true })
    }
  }, [question, phase])

  async function loadQuiz() {
    setPhase('loading')

    await supabase
      .from('profiles')
      .upsert({ id: user.id, email: user.email }, { onConflict: 'id' })

    const { data: verbs, error } = await supabase
      .from('verbs')
      .select('id, english, spanish_infinitive')
      .eq('category', category.title)

    if (error || !verbs?.length) {
      setPhase('error')
      return
    }

    const verbIds = verbs.map(v => v.id)
    const { data: progress } = await supabase
      .from('user_verb_progress')
      .select('id, verb_id, stage, consecutive_correct, mastered, s4_score')
      .eq('user_id', user.id)
      .in('verb_id', verbIds)

    const progMap = {}
    for (const p of progress ?? []) {
      progMap[p.verb_id] = {
        stage: p.stage ?? 1,
        consecutive_correct: p.consecutive_correct ?? 0,
        mastered: p.mastered ?? false,
        s4_score: p.s4_score ?? 0,
        db_id: p.id,
        consecutive_incorrect: 0,
      }
    }
    progressRef.current = progMap

    // ── S1: if any verbs still at stage 1, run a drag-match round ────────────
    const s1All = verbs.filter(v => (progMap[v.id]?.stage ?? 1) === 1)
    if (s1All.length > 0) {
      // Exclude recently wrong verbs if enough others are available
      const exclude = recentlyUsedRef.current
      recentlyUsedRef.current = []
      const s1Pool = s1All.filter(v => !exclude.includes(v.id)).length >= 5
        ? s1All.filter(v => !exclude.includes(v.id))
        : s1All
      // Split into in-progress (1–4 matches) and fresh (0 matches)
      const inProgress = shuffle(s1Pool.filter(v => (progMap[v.id]?.consecutive_correct ?? 0) > 0))
      const fresh = shuffle(s1Pool.filter(v => (progMap[v.id]?.consecutive_correct ?? 0) === 0))
      // Up to 2 in-progress + fill to 5 with fresh, then top up with more in-progress
      const ipSlice = inProgress.slice(0, 2)
      const frSlice = fresh.slice(0, 5 - ipSlice.length)
      const extra = inProgress.slice(2, 2 + Math.max(0, 5 - ipSlice.length - frSlice.length))
      const round = shuffle([...ipSlice, ...frSlice, ...extra])
      setAllVerbs(verbs)
      setRoundVerbs(round)
      setPhase('s1')
      return
    }

    // ── S2 first; fall back to S3 only when no S2 verbs remain ───────────────
    const s2 = verbs.filter(v => {
      const stage = progMap[v.id]?.stage ?? 1
      return stage <= 2 && !progMap[v.id]?.mastered
    })
    let sess
    if (s2.length > 0) {
      sess = shuffle(s2).slice(0, 25)
    } else {
      const s3 = verbs.filter(v => (progMap[v.id]?.stage ?? 1) === 3 && !progMap[v.id]?.mastered)
      if (s3.length > 0) {
        sess = shuffle(s3).slice(0, 10)
      } else {
        const s4 = verbs.filter(v => (progMap[v.id]?.stage ?? 1) === 4 && !progMap[v.id]?.mastered)
        sess = shuffle(s4).slice(0, 10)
      }
    }

    setAllVerbs(verbs)
    setSession(sess)
    setCurrentIdx(0)
    setResults([])
    setSelectedOption(null)
    setIsCorrect(null)
    setTypedAnswer('')
    setMatchResult(null)

    if (!sess.length) {
      setPhase('empty')
      return
    }

    setQuestion(makeQuestion(sess[0], verbs, progMap))
    setPhase('question')
  }

  async function saveProgress(verbId) {
    const prog = progressRef.current[verbId]
    if (!prog) return
    const { stage, consecutive_correct, mastered, s4_score, db_id } = prog
    const payload = { stage, consecutive_correct, mastered, s4_score: s4_score ?? 0 }
    if (db_id) {
      await supabase.from('user_verb_progress')
        .update(payload)
        .eq('id', db_id)
    } else {
      const { data } = await supabase.from('user_verb_progress')
        .upsert(
          { user_id: user.id, verb_id: verbId, ...payload },
          { onConflict: 'user_id,verb_id' }
        )
        .select('id').single()
      if (data) progressRef.current[verbId] = { ...prog, db_id: data.id }
    }
  }

  // ── S1: round complete — only credit fully-correct rounds, track wrong verbs ─
  async function handleS1RoundComplete(creditedIds, wrongIds) {
    recentlyUsedRef.current = wrongIds ?? []
    for (const verbId of creditedIds) {
      const prog = progressRef.current[verbId] ?? {
        stage: 1, consecutive_correct: 0, mastered: false, db_id: null, consecutive_incorrect: 0,
      }
      const newCount = (prog.consecutive_correct ?? 0) + 1
      const graduated = newCount >= 5
      progressRef.current[verbId] = {
        ...prog,
        stage: graduated ? 2 : 1,
        consecutive_correct: graduated ? 0 : newCount,
      }
    }
    await Promise.all(creditedIds.map(saveProgress))
    loadQuiz()
  }

  // ── S2: multiple choice answer (unchanged) ────────────────────────────────
  function handleAnswer(option) {
    const correct = option === question.correct
    const verbId = question.verb.id
    const prog = progressRef.current[verbId] ?? {
      stage: 1, consecutive_correct: 0, mastered: false, db_id: null, consecutive_incorrect: 0,
    }

    const effectiveStage = Math.max(prog.stage, 2)
    let newProg

    if (correct) {
      const newConsec = prog.consecutive_correct + 1
      if (newConsec >= 3 && effectiveStage === 2) {
        newProg = { ...prog, stage: 3, consecutive_correct: 0, consecutive_incorrect: 0 }
      } else {
        newProg = { ...prog, stage: effectiveStage, consecutive_correct: newConsec, consecutive_incorrect: 0 }
      }
    } else {
      const newConsecIncorrect = (prog.consecutive_incorrect ?? 0) + 1
      if (newConsecIncorrect >= 2) {
        newProg = { ...prog, stage: 1, consecutive_correct: 0, consecutive_incorrect: 0 }
      } else {
        newProg = { ...prog, stage: effectiveStage, consecutive_correct: 0, consecutive_incorrect: newConsecIncorrect }
      }
    }

    progressRef.current[verbId] = newProg
    saveProgress(verbId)
    setSelectedOption(option)
    setIsCorrect(correct)
    setResults(r => [...r, { verb: question.verb, correct, matchResult: correct ? 'exact' : 'wrong' }])
    setPhase('feedback')
  }

  // ── S3 & S4: typed answer (unchanged) ─────────────────────────────────────
  function handleTyped() {
    const result = fuzzyMatch(typedAnswer, question.correct)
    const correct = result !== 'wrong'
    const verbId = question.verb.id
    const stage = progressRef.current[verbId]?.stage ?? 3

    if (stage === 4) {
      // S4: EN→ES — mastery via s4_score (5 consecutive correct)
      const prog = progressRef.current[verbId] ?? {
        stage: 4, consecutive_correct: 0, s4_score: 0, mastered: false, db_id: null, consecutive_incorrect: 0,
      }
      let newProg
      if (correct) {
        const newS4 = (prog.s4_score ?? 0) + 1
        newProg = newS4 >= 5
          ? { ...prog, s4_score: newS4, mastered: true, consecutive_incorrect: 0 }
          : { ...prog, s4_score: newS4, consecutive_incorrect: 0 }
      } else {
        newProg = { ...prog, s4_score: 0 }
      }
      progressRef.current[verbId] = newProg
      saveProgress(verbId)
      setMatchResult(result)
      setResults(r => [...r, { verb: question.verb, correct, matchResult: result }])
      setPhase('feedback')
      return
    }

    // S3: ES→EN — graduate to stage 4 on 3 consecutive correct
    const prog = progressRef.current[verbId] ?? {
      stage: 3, consecutive_correct: 0, mastered: false, db_id: null, consecutive_incorrect: 0,
    }
    let newProg
    if (correct) {
      const newConsec = prog.consecutive_correct + 1
      if (newConsec >= 3) {
        newProg = { ...prog, stage: 4, consecutive_correct: 0, consecutive_incorrect: 0 }
      } else {
        newProg = { ...prog, consecutive_correct: newConsec, consecutive_incorrect: 0 }
      }
    } else {
      const newConsecIncorrect = (prog.consecutive_incorrect ?? 0) + 1
      if (newConsecIncorrect >= 2) {
        newProg = { ...prog, consecutive_correct: 0, consecutive_incorrect: 0 }
      } else {
        newProg = { ...prog, consecutive_incorrect: newConsecIncorrect }
      }
    }
    progressRef.current[verbId] = newProg
    saveProgress(verbId)
    setMatchResult(result)
    setResults(r => [...r, { verb: question.verb, correct, matchResult: result }])
    setPhase('feedback')
  }

  function handleNext() {
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.length) {
      setPhase('summary')
      return
    }
    setCurrentIdx(nextIdx)
    setQuestion(makeQuestion(session[nextIdx], allVerbs, progressRef.current))
    setSelectedOption(null)
    setIsCorrect(null)
    setTypedAnswer('')
    setMatchResult(null)
    setPhase('question')
  }

  // ── Guard renders ─────────────────────────────────────────────────────────
  if (!category) {
    return (
      <div style={styles.page}>
        <NavBar />
        <p style={{ padding: '2rem' }}>Category not found.</p>
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
          <p style={{ color: '#c00' }}>
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
            <p style={{ margin: 0, color: '#555' }}>
              All verbs in this category have passed the available stages. Great work!
            </p>
          </div>
        </main>
      </div>
    )
  }

  // ── S1: drag & match round ────────────────────────────────────────────────
  if (phase === 's1') {
    return (
      <div style={styles.s1Page}>
        <NavBar />
        <main style={styles.s1Main}>
          <DragMatchRound
            key={roundVerbs.map(v => v.id).join('-')}
            roundVerbs={roundVerbs}
            onComplete={handleS1RoundComplete}
          />
        </main>
      </div>
    )
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (phase === 'summary') {
    const resultByVerbId = Object.fromEntries(results.map(r => [r.verb.id, r.matchResult]))
    const masteredCount = allVerbs.filter(v => progressRef.current[v.id]?.mastered).length

    let pts = 0, maxPts = 0
    for (const v of allVerbs) {
      const prog = progressRef.current[v.id]
      maxPts += 4
      const isMastered = prog?.mastered || ((prog?.stage ?? 1) === 4 && (prog?.s4_score ?? 0) >= 5)
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

          <div className="results-table-wrap" style={{ ...styles.tableWrap, maxHeight: '260px', overflowY: 'scroll' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.thLeft, textAlign: 'center', position: 'sticky', top: 0 }}>Spanish</th>
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
                  const isMastered = prog?.mastered ?? false
                  const s4Score = prog?.s4_score ?? 0
                  const s1done = stage >= 2 || isMastered
                  const s2done = stage >= 3 || isMastered
                  const s3done = stage >= 4 || isMastered
                  const s4done = isMastered || (stage === 4 && s4Score >= 5)
                  const verbResult = resultByVerbId[verb.id]
                  const textColor = verbResult === 'exact' ? '#16a34a' : verbResult === 'close' ? '#d97706' : verbResult === 'wrong' ? '#dc2626' : '#333'
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

  // ── Question (S2/S3/S4) ───────────────────────────────────────────────────
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
          <p style={styles.word}>{question.prompt ?? question.verb.spanish_infinitive}</p>

          <MasteryBar
            stage={currentProg?.stage ?? 1}
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
                onKeyDown={e => { if (e.key === 'Enter' && phase === 'question') handleTyped() }}
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
                  onClick={handleTyped}
                >
                  {typedAnswer.trim() ? 'Check' : 'Pass'}
                </button>
              )}
            </div>
          )}

          {phase === 'feedback' && (
            <div style={{
              ...styles.feedbackBanner,
              backgroundColor: question.type === 'typed'
                ? (matchResult === 'exact' ? '#dcfce7' : matchResult === 'close' ? '#fef3c7' : '#fee2e2')
                : (isCorrect ? '#dcfce7' : '#fee2e2'),
            }}>
              <span style={{
                fontWeight: 600,
                color: question.type === 'typed'
                  ? (matchResult === 'exact' ? '#16a34a' : matchResult === 'close' ? '#d97706' : '#dc2626')
                  : (isCorrect ? '#16a34a' : '#dc2626'),
              }}>
                {question.type === 'typed'
                  ? (matchResult === 'exact' ? 'Correct!' : matchResult === 'close' ? `Close — ${question.correct}` : `Incorrect — ${question.correct}`)
                  : (isCorrect ? 'Correct!' : `Incorrect — ${question.correct}`)}
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
  // ── S2/S3/S4 quiz layout (fixed, no scroll — keyboard-safe) ──────────────
  page: {
    position: 'fixed',
    top: 0, right: 0, bottom: 0, left: 0,
    overflow: 'hidden',
    backgroundColor: '#f8f8f6',
    fontFamily: 'system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
  },
  // ── S1 layout (scrollable — no keyboard, more vertical space needed) ──────
  s1Page: {
    minHeight: '100vh',
    backgroundColor: '#f8f8f6',
    fontFamily: 'system-ui, sans-serif',
  },
  s1Main: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '0.5rem 1.5rem 3rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
    boxSizing: 'border-box',
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
    flexShrink: 0,
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

  // ── S1 Drag & Match styles ─────────────────────────────────────────────────
  dmCard: {
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  dmBankLabel: {
    display: 'block',
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
  },
  dmBank: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    minHeight: '48px',
    backgroundColor: '#f8f8f6',
    borderRadius: '8px',
    padding: '0.5rem',
    border: '1.5px dashed #e0e0e0',
    alignItems: 'center',
  },
  dmChip: {
    padding: '0.4rem 0.875rem',
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'grab',
    userSelect: 'none',
    touchAction: 'none',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 3px rgba(59,130,246,0.3)',
  },
  dmPairs: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
  },
  dmPairRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  dmEnglish: {
    flex: 1,
    fontSize: '0.95rem',
    color: '#333',
    fontWeight: 500,
    minWidth: 0,
  },
  dmSlot: {
    width: '130px',
    minHeight: '40px',
    borderRadius: '6px',
    border: '2px dashed #d1d5db',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    flexShrink: 0,
    transition: 'border-color 0.15s, background-color 0.15s',
  },
  dmSlotCorrect: {
    borderColor: '#16a34a',
    borderStyle: 'solid',
    backgroundColor: '#dcfce7',
  },
  dmSlotWrong: {
    borderColor: '#dc2626',
    borderStyle: 'solid',
    backgroundColor: '#fee2e2',
  },
  dmChipInSlot: {
    padding: '0.35rem 0.625rem',
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderRadius: '5px',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'grab',
    userSelect: 'none',
    touchAction: 'none',
    whiteSpace: 'nowrap',
    maxWidth: '118px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dmChipCorrect: {
    backgroundColor: '#16a34a',
    cursor: 'default',
  },
  dmChipWrong: {
    backgroundColor: '#dc2626',
    cursor: 'default',
  },
  dmCheckBtn: {
    padding: '0.75rem',
    backgroundColor: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  dmNextBtn: {
    padding: '0.75rem',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  dmChipGhost: {
    position: 'fixed',
    padding: '0.4rem 0.875rem',
    backgroundColor: '#3b82f6',
    color: '#fff',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: 500,
    pointerEvents: 'none',
    zIndex: 9999,
    userSelect: 'none',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 16px rgba(59,130,246,0.4)',
    transform: 'scale(1.08)',
  },
}
