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

// ── Fuzzy matching (L3 & L4 typed answers) ────────────────────────────────────
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

function getAnswerCandidates(englishStr) {
  return englishStr.split(' / ').map(s => s.replace(/\s*\(.*?\)/g, '').trim()).filter(Boolean)
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

function MasteryBar({ stage, stage2_mastery, stage3_mastery, l4_score }) {
  const effectiveStage = Math.max(stage ?? 1, 2)
  let count, filled
  if (effectiveStage === 2) { count = 3; filled = stage2_mastery ?? 0 }
  else if (effectiveStage === 3) { count = 3; filled = stage3_mastery ?? 0 }
  else { count = 5; filled = l4_score ?? 0 }
  return (
    <div style={{ display: 'flex', gap: '3px' }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{
          flex: 1,
          height: '8px',
          borderRadius: '3px',
          backgroundColor: i < filled ? '#3b82f6' : '#fff',
          border: `1.5px solid ${i < filled ? '#3b82f6' : '#d1d5db'}`,
          boxSizing: 'border-box',
        }} />
      ))}
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

// ── L1: Drag & Match ──────────────────────────────────────────────────────────
// Props: roundVerbs [{id, english, spanish_infinitive}], onComplete(verbIds[])
function DragMatchRound({ roundVerbs, onComplete, roundsInBlock = 0 }) {
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
  const autoAdvanceRef = useRef(null)
  useEffect(() => { slotsStateRef.current = slots }, [slots])

  // Auto-advance 3 s after any Check result
  useEffect(() => {
    if (!checkResult) return
    const correctIds = slotsStateRef.current
      .map((slot, i) => checkResult[i] ? slot.verbId : null)
      .filter(Boolean)
    const wrongIds = slotsStateRef.current
      .map((slot, i) => checkResult[i] ? null : slot.verbId)
      .filter(Boolean)
    const tid = setTimeout(() => onComplete(correctIds, wrongIds), 3000)
    autoAdvanceRef.current = tid
    return () => clearTimeout(tid)
  }, [checkResult])

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
  const correctVerbIds = checkResult
    ? slots.map((slot, i) => checkResult[i] ? slot.verbId : null).filter(Boolean)
    : []
  const wrongVerbIds = checkResult
    ? slots.map((slot, i) => checkResult[i] ? null : slot.verbId).filter(Boolean)
    : []

  return (
    <div style={styles.dmCard}>
      {/* Round counter */}
      <div style={{ display: 'flex', gap: '3px' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            flex: 1,
            height: '5px',
            borderRadius: '3px',
            backgroundColor: i < roundsInBlock ? '#3b82f6' : '#e5e7eb',
            transition: 'background-color 0.2s',
          }} />
        ))}
      </div>

      {/* Chip bank */}
      <div>
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
        <>
          <style>{`@keyframes dmFill{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
          <div
            role="button"
            style={styles.dmProgressBtnWrap}
            onClick={() => { clearTimeout(autoAdvanceRef.current); onComplete(correctVerbIds, wrongVerbIds) }}
          >
            <div style={styles.dmProgressFill} />
            <span style={styles.dmProgressLabel}>Next round →</span>
          </div>
        </>
      )}

      {/* Ghost chip — positioned via DOM ref, no re-render on move */}
      <div ref={ghostElRef} style={{ ...styles.dmChipGhost, display: 'none' }} />
    </div>
  )
}

// ── Question builder (L2/L3/L4 — unchanged) ───────────────────────────────────
function makeQuestion(verb, allVerbs, progMap) {
  const stage = progMap[verb.id]?.stage ?? 1
  if (stage <= 2) {
    // L2: MC — Spanish infinitive shown, pick English
    const distractors = pickEnglishDistractors(verb, allVerbs)
    return {
      type: 'mc',
      verb,
      options: shuffle([verb.english, ...distractors]),
      correct: verb.english,
    }
  }
  if (stage === 3) {
    // L3: typed ES→EN — Spanish infinitive shown, type English
    const candidates = getAnswerCandidates(verb.english)
    if (verb.requires_all_answers && candidates.length > 1) {
      return { type: 'typed', verb, correctAll: candidates, multiInput: true, placeholder: 'Type the English meaning…' }
    }
    return { type: 'typed', verb, correct: candidates[0], correctCandidates: candidates, placeholder: 'Type the English meaning…' }
  }
  // L4: typed EN→ES — English shown, type Spanish infinitive
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
  const inputRefsArr = useRef([])
  const recentlyUsedRef = useRef([])
  const feedbackTimerRef = useRef(null)
  const l1RoundCountRef = useRef(0)

  const [phase, setPhase] = useState('loading')
  const [allVerbs, setAllVerbs] = useState([])
  const [roundVerbs, setRoundVerbs] = useState([])             // L1 current round
  const [session, setSession] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [question, setQuestion] = useState(null)
  const [selectedOption, setSelectedOption] = useState(null)   // L2 MC
  const [isCorrect, setIsCorrect] = useState(null)             // L2 MC feedback
  const [typedAnswer, setTypedAnswer] = useState('')           // L3 single / L4
  const [matchResult, setMatchResult] = useState(null)         // L3/L4 overall fuzzy result
  const [typedAnswers, setTypedAnswers] = useState([])         // L3 multi
  const [matchResults, setMatchResults] = useState([])         // L3 multi per-answer
  const [results, setResults] = useState([])

  useEffect(() => {
    if (category && user) loadQuiz()
  }, [category?.id, user?.id])

  // Auto-focus typed input when a typed question loads
  useEffect(() => {
    if (question?.type === 'typed' && phase === 'question') {
      if (question.multiInput) {
        inputRefsArr.current[0]?.focus({ preventScroll: true })
      } else {
        inputRef.current?.focus({ preventScroll: true })
      }
    }
  }, [question, phase])

  // Enter to advance when feedback banner is showing
  useEffect(() => {
    if (phase !== 'feedback') return
    const onKey = (e) => { if (e.key === 'Enter') handleNext() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, currentIdx])

  // Auto-advance after 3 s on wrong typed answers (L3/L4)
  useEffect(() => {
    if (phase !== 'feedback' || question?.type !== 'typed' || matchResult !== 'wrong') return
    feedbackTimerRef.current = setTimeout(handleNext, 3000)
    return () => clearTimeout(feedbackTimerRef.current)
  }, [phase, matchResult])

  async function loadQuiz() {
    setPhase('loading')

    await supabase
      .from('profiles')
      .upsert({ id: user.id, email: user.email }, { onConflict: 'id' })

    const { data: verbs, error } = await supabase
      .from('verbs')
      .select('id, english, spanish_infinitive, english_alt1, english_alt2, requires_all_answers')
      .eq('category', category.title)

    if (error || !verbs?.length) {
      setPhase('error')
      return
    }

    const verbIds = verbs.map(v => v.id)
    const { data: progress } = await supabase
      .from('user_verb_progress')
      .select('id, verb_id, current_stage, stage2_mastery, stage3_mastery, l4_score, drag_match_score')
      .eq('user_id', user.id)
      .in('verb_id', verbIds)

    const progMap = {}
    for (const p of progress ?? []) {
      const l4 = p.l4_score ?? 0
      progMap[p.verb_id] = {
        stage: p.current_stage ?? 1,
        stage2_mastery: p.stage2_mastery ?? 0,
        stage3_mastery: p.stage3_mastery ?? 0,
        l4_score: l4,
        drag_match_score: p.drag_match_score ?? 0,
        mastered: l4 >= 5,
        db_id: p.id,
        consecutive_incorrect: 0,
      }
    }
    progressRef.current = progMap

    // ── L1: if any verbs still at stage 1, run a drag-match round ────────────
    const l1All = verbs.filter(v => (progMap[v.id]?.stage ?? 1) === 1)
    if (l1All.length > 0) {
      // Exclude recently wrong verbs if enough others are available
      const exclude = recentlyUsedRef.current
      recentlyUsedRef.current = []
      const l1Pool = l1All.filter(v => !exclude.includes(v.id)).length >= 5
        ? l1All.filter(v => !exclude.includes(v.id))
        : l1All
      // Split into in-progress (1–4 matches) and fresh (0 matches)
      const inProgress = shuffle(l1Pool.filter(v => (progMap[v.id]?.drag_match_score ?? 0) > 0))
      const fresh = shuffle(l1Pool.filter(v => (progMap[v.id]?.drag_match_score ?? 0) === 0))
      // Up to 2 in-progress + fill to 5 with fresh, then top up with more in-progress
      const ipSlice = inProgress.slice(0, 2)
      const frSlice = fresh.slice(0, 5 - ipSlice.length)
      const extra = inProgress.slice(2, 2 + Math.max(0, 5 - ipSlice.length - frSlice.length))
      const round = shuffle([...ipSlice, ...frSlice, ...extra])
      setAllVerbs(verbs)
      setRoundVerbs(round)
      setPhase('l1')
      return
    }

    // ── L2 first; fall back to L3 only when no L2 verbs remain ───────────────
    const l2 = verbs.filter(v => {
      const stage = progMap[v.id]?.stage ?? 1
      return stage <= 2 && !progMap[v.id]?.mastered
    })
    let sess
    if (l2.length > 0) {
      sess = shuffle(l2).slice(0, 5) // TESTING STATE
    } else {
      const l3 = verbs.filter(v => (progMap[v.id]?.stage ?? 1) === 3 && !progMap[v.id]?.mastered)
      if (l3.length > 0) {
        sess = shuffle(l3).slice(0, 5) // TESTING STATE
      } else {
        const l4 = verbs.filter(v => (progMap[v.id]?.stage ?? 1) === 4 && !progMap[v.id]?.mastered)
        sess = shuffle(l4).slice(0, 5) // TESTING STATE
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
    const { stage, stage2_mastery, stage3_mastery, l4_score, drag_match_score, db_id } = prog
    const payload = {
      current_stage: stage,
      stage2_mastery: stage2_mastery ?? 0,
      stage3_mastery: stage3_mastery ?? 0,
      l4_score: l4_score ?? 0,
      drag_match_score: drag_match_score ?? 0,
    }
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

  // ── L1: round complete — increment drag_match_score per credited verb ────────
  async function handleL1RoundComplete(creditedIds, wrongIds) {
    recentlyUsedRef.current = wrongIds ?? []
    console.log(`[L1] round complete — ${creditedIds.length} credited, ${(wrongIds ?? []).length} wrong`)
    for (const verbId of creditedIds) {
      const prog = progressRef.current[verbId] ?? {
        stage: 1, stage2_mastery: 0, stage3_mastery: 0, l4_score: 0, drag_match_score: 0, mastered: false, db_id: null, consecutive_incorrect: 0,
      }
      const newScore = (prog.drag_match_score ?? 0) + 1
      const graduated = newScore >= 5
      progressRef.current[verbId] = {
        ...prog,
        drag_match_score: newScore,
        stage: graduated ? 2 : 1,
        stage2_mastery: graduated ? 0 : prog.stage2_mastery,
      }
      const verbName = allVerbs.find(v => v.id === verbId)?.spanish_infinitive ?? String(verbId)
      console.log(`[L1] ${verbName}: match count ${newScore}/5${graduated ? ' → graduated to L2' : ''}`)
    }
    await Promise.all(creditedIds.map(saveProgress))
    l1RoundCountRef.current += 1
    if (l1RoundCountRef.current % 5 === 0) {
      setPhase('l1summary')
    } else {
      loadQuiz()
    }
  }

  // ── L2: multiple choice answer (unchanged) ────────────────────────────────
  function handleAnswer(option) {
    const correct = option === question.correct
    const verbId = question.verb.id
    const prog = progressRef.current[verbId] ?? {
      stage: 1, stage2_mastery: 0, stage3_mastery: 0, l4_score: 0, drag_match_score: 0, mastered: false, db_id: null, consecutive_incorrect: 0,
    }

    const effectiveStage = Math.max(prog.stage, 2)
    let newProg

    if (correct) {
      const newMastery = (prog.stage2_mastery ?? 0) + 1
      if (newMastery >= 3 && effectiveStage === 2) {
        newProg = { ...prog, stage: 3, stage2_mastery: 0, consecutive_incorrect: 0 }
      } else {
        newProg = { ...prog, stage: effectiveStage, stage2_mastery: newMastery, consecutive_incorrect: 0 }
      }
    } else {
      const newConsecIncorrect = (prog.consecutive_incorrect ?? 0) + 1
      if (newConsecIncorrect >= 2) {
        newProg = { ...prog, stage: 1, stage2_mastery: 0, consecutive_incorrect: 0 }
      } else {
        newProg = { ...prog, stage: effectiveStage, stage2_mastery: 0, consecutive_incorrect: newConsecIncorrect }
      }
    }

    progressRef.current[verbId] = newProg
    saveProgress(verbId)
    setSelectedOption(option)
    setIsCorrect(correct)
    setResults(r => [...r, { verb: question.verb, correct, matchResult: correct ? 'exact' : 'wrong' }])
    setPhase('feedback')
  }

  // ── L3 & L4: typed answer ──────────────────────────────────────────────────
  function updateL3Progress(verbId, correct) {
    const prog = progressRef.current[verbId] ?? {
      stage: 3, stage2_mastery: 0, stage3_mastery: 0, l4_score: 0, drag_match_score: 0, mastered: false, db_id: null, consecutive_incorrect: 0,
    }
    let newProg
    if (correct) {
      const newMastery = (prog.stage3_mastery ?? 0) + 1
      newProg = newMastery >= 3
        ? { ...prog, stage: 4, stage3_mastery: 0, consecutive_incorrect: 0 }
        : { ...prog, stage3_mastery: newMastery, consecutive_incorrect: 0 }
    } else {
      const newConsecIncorrect = (prog.consecutive_incorrect ?? 0) + 1
      newProg = newConsecIncorrect >= 2
        ? { ...prog, stage3_mastery: 0, consecutive_incorrect: 0 }
        : { ...prog, consecutive_incorrect: newConsecIncorrect }
    }
    progressRef.current[verbId] = newProg
    saveProgress(verbId)
  }

  function handleTyped() {
    const verbId = question.verb.id
    const stage = progressRef.current[verbId]?.stage ?? 3

    // L3 multi-input — iterate over correctAll so missing inputs are always 'wrong'
    if (question.multiInput) {
      // Order-independent best-fit with duplicate input guard.
      // A typed input that is near-identical to an earlier input (same 80% threshold)
      // is rejected before matching — prevents "say / say" claiming two different answers.
      const usedExpected = new Set()
      const perResult = question.correctAll.map((_, i) => {
        const typed = (typedAnswers[i] ?? '').trim()
        if (!typed) return 'wrong'
        for (let j = 0; j < i; j++) {
          const earlier = (typedAnswers[j] ?? '').trim()
          if (earlier && fuzzyMatch(typed, earlier) !== 'wrong') return 'wrong'
        }
        let best = 'wrong', bestIdx = -1
        question.correctAll.forEach((expected, j) => {
          if (usedExpected.has(j)) return
          const res = fuzzyMatch(typed, expected)
          if (res === 'exact' && best !== 'exact') { best = 'exact'; bestIdx = j }
          else if (res === 'close' && best === 'wrong') { best = 'close'; bestIdx = j }
        })
        if (bestIdx >= 0) usedExpected.add(bestIdx)
        return best
      })
      const correct = perResult.every(r => r !== 'wrong')
      const overallResult = perResult.every(r => r === 'exact') ? 'exact' : correct ? 'close' : 'wrong'
      updateL3Progress(verbId, correct)
      setMatchResults(perResult)
      setMatchResult(overallResult)
      setResults(r => [...r, { verb: question.verb, correct, matchResult: overallResult }])
      setPhase('feedback')
      return
    }

    // L4: EN→ES — mastery via l4_score (5 consecutive correct)
    if (stage === 4) {
      const result = fuzzyMatch(typedAnswer, question.correct.replace(/\s*\(.*?\)/g, '').trim())
      const correct = result !== 'wrong'
      const prog = progressRef.current[verbId] ?? {
        stage: 4, stage2_mastery: 0, stage3_mastery: 0, l4_score: 0, drag_match_score: 0, mastered: false, db_id: null, consecutive_incorrect: 0,
      }
      let newProg
      if (correct) {
        const newL4 = (prog.l4_score ?? 0) + 1
        newProg = newL4 >= 5
          ? { ...prog, l4_score: newL4, mastered: true, consecutive_incorrect: 0 }
          : { ...prog, l4_score: newL4, consecutive_incorrect: 0 }
      } else {
        newProg = { ...prog, l4_score: 0 }
      }
      progressRef.current[verbId] = newProg
      saveProgress(verbId)
      setMatchResult(result)
      setResults(r => [...r, { verb: question.verb, correct, matchResult: result }])
      setPhase('feedback')
      return
    }

    // L3 single-input — match against all slash-separated candidates
    const candidateResults = question.correctCandidates.map(c => fuzzyMatch(typedAnswer, c))
    const result = candidateResults.includes('exact') ? 'exact' : candidateResults.includes('close') ? 'close' : 'wrong'
    const correct = result !== 'wrong'
    updateL3Progress(verbId, correct)
    setMatchResult(result)
    setResults(r => [...r, { verb: question.verb, correct, matchResult: result }])
    setPhase('feedback')
  }

  function handleNext() {
    clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = null
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
    setTypedAnswers([])
    setMatchResult(null)
    setMatchResults([])
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

  // ── L1: drag & match round ────────────────────────────────────────────────
  if (phase === 'l1') {
    return (
      <div style={styles.l1Page}>
        <NavBar />
        <main style={styles.l1Main}>
          <DragMatchRound
            key={roundVerbs.map(v => v.id).join('-')}
            roundVerbs={roundVerbs}
            onComplete={handleL1RoundComplete}
            roundsInBlock={l1RoundCountRef.current % 5}
          />
        </main>
      </div>
    )
  }

  // ── L1 mid-session summary (every 10 rounds) ─────────────────────────────
  if (phase === 'l1summary') {
    const sorted = [...allVerbs].sort((a, b) => {
      const cntA = (progressRef.current[a.id]?.stage ?? 1) >= 2 ? 5 : (progressRef.current[a.id]?.drag_match_score ?? 0)
      const cntB = (progressRef.current[b.id]?.stage ?? 1) >= 2 ? 5 : (progressRef.current[b.id]?.drag_match_score ?? 0)
      return cntB - cntA
    })
    return (
      <div style={styles.l1Page}>
        <NavBar />
        <main style={styles.l1Main}>
          <div style={styles.l1SummaryCard}>
            <div style={styles.l1SummaryHeader}>
              <span style={styles.l1SummaryTitle}>Level 1 Progress</span>
              <span style={styles.l1SummarySubtitle}>{category.title}</span>
            </div>
            {sorted.map(verb => {
              const prog = progressRef.current[verb.id]
              const matchCount = (prog?.stage ?? 1) >= 2 ? 5 : Math.min(prog?.drag_match_score ?? 0, 5)
              return (
                <div key={verb.id} style={styles.l1SummaryRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.l1SummarySpanish}>{verb.spanish_infinitive}</div>
                    <div style={styles.l1SummaryEnglish}>{verb.english}</div>
                  </div>
                  <div style={styles.l1MatchDots}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} style={{
                        width: '11px',
                        height: '11px',
                        borderRadius: '50%',
                        backgroundColor: i < matchCount ? '#16a34a' : 'transparent',
                        border: `2px solid ${i < matchCount ? '#16a34a' : '#d1d5db'}`,
                        flexShrink: 0,
                        boxSizing: 'border-box',
                      }} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={styles.summaryActions}>
            <button style={{ ...styles.primaryBtn, width: '100%', textAlign: 'center' }} onClick={loadQuiz}>
              Continue
            </button>
            <button style={styles.backToThemesBtn} onClick={() => navigate('/verbs')}>
              ← Back to verbs
            </button>
          </div>
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
      const isMastered = prog?.mastered || ((prog?.stage ?? 1) === 4 && (prog?.l4_score ?? 0) >= 5)
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
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>L1</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>L2</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>L3</th>
                  <th style={{ ...styles.thCenter, position: 'sticky', top: 0 }}>L4</th>
                </tr>
              </thead>
              <tbody>
                {session.map(verb => {
                  const prog = progressRef.current[verb.id]
                  const stage = prog?.stage ?? 1
                  const isMastered = prog?.mastered ?? false
                  const l4Score = prog?.l4_score ?? 0
                  const l1done = stage >= 2 || isMastered
                  const l2done = stage >= 3 || isMastered
                  const l3done = stage >= 4 || isMastered
                  const l4done = isMastered || (stage === 4 && l4Score >= 5)
                  const verbResult = resultByVerbId[verb.id]
                  const textColor = verbResult === 'exact' ? '#16a34a' : verbResult === 'close' ? '#d97706' : verbResult === 'wrong' ? '#dc2626' : '#333'
                  return (
                    <tr key={verb.id} style={styles.tableRow}>
                      <td style={{ ...styles.tdEn, color: textColor }}>{verb.spanish_infinitive}</td>
                      <td style={{ ...styles.tdEs, color: textColor }}>{verb.english}</td>
                      <StageCell done={l1done} />
                      <StageCell done={l2done} />
                      <StageCell done={l3done} />
                      <StageCell done={l4done} />
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

  // ── Question (L2/L3/L4) ───────────────────────────────────────────────────
  const currentProg = progressRef.current[question?.verb?.id]

  return (
    <div style={styles.page}>
      <NavBar />
      <main style={styles.main}>
        <div style={styles.progressRow}>
          <div style={styles.progressBar}>
            <div style={{ display: 'flex', height: '100%' }}>
              {session.map((_, i) => {
                const r = results[i]
                const bg = r ? (r.correct ? '#16a34a' : '#dc2626') : '#e5e5e5'
                return <div key={i} style={{ flex: 1, backgroundColor: bg }} />
              })}
            </div>
          </div>
          <span style={styles.progressLabel}>{currentIdx + 1} / {session.length}</span>
        </div>

        <div style={styles.card}>
          <p style={styles.word}>{question.prompt ?? question.verb.spanish_infinitive}</p>

          <MasteryBar
            stage={currentProg?.stage ?? 1}
            stage2_mastery={currentProg?.stage2_mastery ?? 0}
            stage3_mastery={currentProg?.stage3_mastery ?? 0}
            l4_score={currentProg?.l4_score ?? 0}
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

          {question.type === 'typed' && !question.multiInput && (
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

          {question.type === 'typed' && question.multiInput && (
            <div style={styles.typedArea}>
              {question.correctAll.map((_, i) => (
                <input
                  key={i}
                  ref={el => { inputRefsArr.current[i] = el }}
                  style={{
                    ...styles.typedInput,
                    ...(phase === 'feedback' && matchResults[i] ? {
                      borderColor: matchResults[i] === 'wrong' ? '#dc2626' : matchResults[i] === 'close' ? '#d97706' : '#16a34a',
                      borderWidth: 2,
                    } : {}),
                  }}
                  type="text"
                  value={typedAnswers[i] ?? ''}
                  onChange={e => {
                    const v = e.target.value
                    setTypedAnswers(prev => { const a = [...prev]; a[i] = v; return a })
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && phase === 'question') {
                      if (i < question.correctAll.length - 1) {
                        inputRefsArr.current[i + 1]?.focus()
                      } else {
                        handleTyped()
                      }
                    }
                  }}
                  disabled={phase === 'feedback'}
                  placeholder={`Meaning ${i + 1}…`}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-form-type="other"
                />
              ))}
              {phase === 'question' && (
                <button
                  style={{ ...styles.typedBtn, backgroundColor: typedAnswers.some(t => t?.trim()) ? '#16a34a' : '#f59e0b', color: '#fff' }}
                  onClick={handleTyped}
                >
                  {typedAnswers.some(t => t?.trim()) ? 'Check' : 'Pass'}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{
                  fontWeight: 600,
                  color: question.type === 'typed'
                    ? (matchResult === 'exact' ? '#16a34a' : matchResult === 'close' ? '#d97706' : '#dc2626')
                    : (isCorrect ? '#16a34a' : '#dc2626'),
                }}>
                  {(() => {
                    if (question.type === 'typed') {
                      if (matchResult === 'exact') return 'Correct!'
                      if (question.multiInput) {
                        const label = `Correct answers: ${question.correctAll.join(' / ')}`
                        return matchResult === 'close' ? `Close — ${label}` : label
                      }
                      const displayAnswer = question.correct.replace(/\s*\(.*?\)\s*/g, '').trim()
                      if (matchResult === 'close') return `Close — ${displayAnswer}`
                      return `Incorrect — ${displayAnswer}`
                    }
                    const displayAnswer = question.correct.replace(/\s*\(.*?\)\s*/g, '').trim()
                    return isCorrect ? 'Correct!' : `Incorrect — ${displayAnswer}`
                  })()}
                </span>
                {question.type === 'typed' && !question.prompt && !question.multiInput && question.verb.english_alt1 && (
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                    {'* also means: "'}
                    {question.verb.english_alt1}
                    {question.verb.english_alt2 ? ` / ${question.verb.english_alt2}` : ''}
                    {'"'}
                  </span>
                )}
              </div>
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
  // ── L2/L3/L4 quiz layout (fixed, no scroll — keyboard-safe) ──────────────
  page: {
    position: 'fixed',
    top: 0, right: 0, bottom: 0, left: 0,
    overflow: 'hidden',
    backgroundColor: '#f8f8f6',
    fontFamily: 'system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
  },
  // ── L1 layout (scrollable — no keyboard, more vertical space needed) ──────
  l1Page: {
    minHeight: '100vh',
    backgroundColor: '#f8f8f6',
    fontFamily: 'system-ui, sans-serif',
  },
  l1Main: {
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

  // ── L1 Drag & Match styles ─────────────────────────────────────────────────
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
  dmProgressBtnWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: '8px',
    backgroundColor: '#dcfce7',
    cursor: 'pointer',
    padding: '0.75rem',
    textAlign: 'center',
    userSelect: 'none',
    boxSizing: 'border-box',
  },
  dmProgressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#16a34a',
    transformOrigin: 'left center',
    transform: 'scaleX(0)',
    animation: 'dmFill 3s linear forwards',
  },
  dmProgressLabel: {
    position: 'relative',
    zIndex: 1,
    color: '#fff',
    fontWeight: 600,
    fontSize: '1rem',
    textShadow: '0 1px 3px rgba(0,0,0,0.35)',
  },
  // ── L1 mid-session summary styles ─────────────────────────────────────────
  l1SummaryCard: {
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  l1SummaryHeader: {
    padding: '1rem 1.25rem 0.75rem',
    borderBottom: '1px solid #f0f0f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  l1SummaryTitle: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: '#111',
  },
  l1SummarySubtitle: {
    fontSize: '0.75rem',
    color: '#888',
  },
  l1SummaryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.6rem 1.25rem',
    borderBottom: '1px solid #f5f5f5',
  },
  l1SummarySpanish: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#111',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  l1SummaryEnglish: {
    fontSize: '0.78rem',
    color: '#666',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  l1MatchDots: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
    flexShrink: 0,
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
