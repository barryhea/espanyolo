import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import NavBar from '../components/NavBar'
import FilteredDictionaryModal from './FilteredDictionaryModal'
import { PRONOUNS, shuffle, normalise } from '../utils/arConjugation'

// AR Match Tree — Mastery Stage 1. Practice-only drag/tap quiz. One question per
// subject pronoun (5 total); for that pronoun the user places one chosen verb's
// Past / Present / Future forms into three labelled tense slots (drag or tap-to-
// place), among a few plausible distractor forms. It NEVER writes tense
// progression or conjugation counts; it only records a last-5 results metric to
// Supabase (user_verb_match_tree_results). Unlocked under the same condition as
// the Mastery quiz (Present, Past, Future all mastered for every AR verb).

const DRAG_THRESHOLD = 8
const SESSION_LENGTH = 20
const TENSE_SLOTS = [
  { tense: 'past',    label: 'Past',    conjKey: 'past_conjugations'    },
  { tense: 'present', label: 'Present', conjKey: 'present_conjugations' },
  { tense: 'future',  label: 'Future',  conjKey: 'future_conjugations'  },
]

// Build exactly the 3 correct forms (Past/Present/Future) for (verb, pronoun) —
// no distractors. The task is purely to order these three into the right tense
// slots. Note for Nosotros the -AR present and preterite are the identical form,
// which yields two chips with the same text; that is expected and both satisfy
// their slot since correctness compares the placed form to the slot's tense form.
function buildForms(verb, pkey) {
  const correctByTense = {
    past:    verb.past_conjugations?.[pkey]    ?? '',
    present: verb.present_conjugations?.[pkey] ?? '',
    future:  verb.future_conjugations?.[pkey]  ?? '',
  }
  const chips = [
    { id: 'c0', label: correctByTense.past },
    { id: 'c1', label: correctByTense.present },
    { id: 'c2', label: correctByTense.future },
  ].filter(c => c.label)
  return { correctByTense, chips }
}

// ── One Match Tree question (reuses the L1 tap-to-place + drag interaction) ──────
function MatchTreeRound({ verb, pronoun, correctByTense, chips, onComplete }) {
  const [bank, setBank]               = useState(() => shuffle(chips))
  const [slots, setSlots]             = useState(() => TENSE_SLOTS.map(t => ({ tense: t.tense, label: t.label, chip: null })))
  const [checkResult, setCheckResult] = useState(null)  // null | boolean[3]
  const [selectedChip, setSelectedChip] = useState(null) // { chip, source: 'bank' | slotIdx }

  const pendingDragRef = useRef(null)
  const dragChipRef    = useRef(null)
  const ghostElRef     = useRef(null)
  const ghostOffsetRef = useRef({ x: 0, y: 0 })
  const slotRefs       = useRef([])
  const slotsStateRef  = useRef(slots)
  const selectedRef    = useRef(null)
  const checkResultRef = useRef(null)
  const autoAdvRef     = useRef(null)

  useEffect(() => { slotsStateRef.current = slots },        [slots])
  useEffect(() => { selectedRef.current   = selectedChip }, [selectedChip])
  useEffect(() => { checkResultRef.current = checkResult }, [checkResult])

  useEffect(() => {
    if (!checkResult) return
    const correct = checkResult.every(Boolean)
    const tid = setTimeout(() => onComplete(correct, checkResult), 2200)
    autoAdvRef.current = tid
    return () => clearTimeout(tid)
  }, [checkResult])

  useEffect(() => {
    const onMove = (e) => {
      if (dragChipRef.current) {
        if (ghostElRef.current) {
          ghostElRef.current.style.left = (e.clientX - ghostOffsetRef.current.x) + 'px'
          ghostElRef.current.style.top  = (e.clientY - ghostOffsetRef.current.y) + 'px'
        }
        return
      }
      const pd = pendingDragRef.current
      if (!pd) return
      if (Math.abs(e.clientX - pd.startX) > DRAG_THRESHOLD || Math.abs(e.clientY - pd.startY) > DRAG_THRESHOLD) {
        pendingDragRef.current = null
        ghostOffsetRef.current = { x: pd.offsetX, y: pd.offsetY }
        if (pd.source === 'bank') setBank(prev => prev.filter(c => c.id !== pd.chip.id))
        else setSlots(prev => prev.map((sl, i) => i === pd.source ? { ...sl, chip: null } : sl))
        setSelectedChip(null)
        setCheckResult(null)
        dragChipRef.current = pd.chip
        if (ghostElRef.current) {
          ghostElRef.current.textContent = pd.chip.label
          ghostElRef.current.style.left = (e.clientX - pd.offsetX) + 'px'
          ghostElRef.current.style.top  = (e.clientY - pd.offsetY) + 'px'
          ghostElRef.current.style.display = 'block'
        }
      }
    }

    const onUp = (e) => {
      // Drop after a real drag
      if (dragChipRef.current) {
        const chip = dragChipRef.current
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
        return
      }
      // Tap on chip (no drag)
      const pd = pendingDragRef.current
      if (!pd) return
      pendingDragRef.current = null
      if (checkResultRef.current) return
      const { chip, source } = pd
      const selected = selectedRef.current
      if (selected) {
        if (selected.chip.id === chip.id) {
          setSelectedChip(null)
        } else if (typeof source === 'number') {
          const slotIdx = source
          const { chip: selChip, source: selSrc } = selected
          setSlots(prev => {
            const next = [...prev]
            next[slotIdx] = { ...next[slotIdx], chip: selChip }
            if (typeof selSrc === 'number') next[selSrc] = { ...next[selSrc], chip: null }
            return next
          })
          if (selSrc === 'bank') setBank(prev => prev.filter(c => c.id !== selChip.id))
          setBank(prev => [...prev, chip])
          setSelectedChip(null)
          setCheckResult(null)
        } else {
          setSelectedChip({ chip, source })
        }
      } else {
        setSelectedChip({ chip, source })
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
    }
  }, [])

  function handleSlotTap(slotIdx) {
    if (checkResult) return
    if (!selectedChip) return
    const { chip, source } = selectedChip
    if (source === slotIdx) { setSelectedChip(null); return }
    const existingChip = slots[slotIdx]?.chip ?? null
    setSlots(prev => {
      const next = [...prev]
      next[slotIdx] = { ...next[slotIdx], chip }
      if (typeof source === 'number') next[source] = { ...next[source], chip: null }
      return next
    })
    if (source === 'bank') setBank(prev => prev.filter(c => c.id !== chip.id))
    if (existingChip)      setBank(prev => [...prev, existingChip])
    setSelectedChip(null)
    setCheckResult(null)
  }

  function startPendingDrag(chip, source, e) {
    e.preventDefault()
    if (dragChipRef.current || pendingDragRef.current) return
    if (checkResult) return
    const rect = e.currentTarget.getBoundingClientRect()
    pendingDragRef.current = { chip, source, startX: e.clientX, startY: e.clientY, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top }
  }

  function handleCheck() {
    setCheckResult(slots.map(sl => sl.chip != null && normalise(sl.chip.label) === normalise(correctByTense[sl.tense] ?? '')))
  }

  const allFilled    = slots.every(sl => sl.chip !== null)
  const hasSelection = selectedChip !== null

  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <span style={s.anchor}>{pronoun.label}</span>
        <span style={s.verbInf}>
          {verb.spanish_infinitive} <span style={s.verbEng}>({verb.english})</span>
        </span>
      </div>

      {/* Bank */}
      <div style={s.bank}>
        {bank.map(chip => {
          const isSel = selectedChip?.chip.id === chip.id
          return (
            <div
              key={chip.id}
              style={isSel ? s.chipSelected : s.chip}
              onPointerDown={e => startPendingDrag(chip, 'bank', e)}
            >
              {chip.label}
            </div>
          )
        })}
        {bank.length === 0 && <span style={{ color: '#aaa', fontSize: '0.85rem' }}>All placed ✓</span>}
      </div>

      {/* Tense slots */}
      <div style={s.rows}>
        {slots.map((slot, i) => {
          const chipSel   = selectedChip?.chip.id === slot.chip?.id
          const slotStyle = checkResult
            ? { ...s.slot, ...(checkResult[i] ? s.slotCorrect : s.slotWrong) }
            : hasSelection ? s.slotTarget : s.slot
          return (
            <div key={slot.tense} style={s.row}>
              <div style={s.rowLabel}>{slot.label}</div>
              <div ref={el => slotRefs.current[i] = el} style={slotStyle} onClick={() => handleSlotTap(i)}>
                {slot.chip && (
                  <div
                    style={checkResult
                      ? { ...s.chipInSlot, ...(checkResult[i] ? s.chipCorrect : s.chipWrong) }
                      : chipSel ? s.chipInSlotSelected : s.chipInSlot}
                    onPointerDown={!checkResult ? e => startPendingDrag(slot.chip, i, e) : undefined}
                    onClick={e => e.stopPropagation()}
                  >
                    {slot.chip.label}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {allFilled && !checkResult && (
        <button style={s.checkBtn} onClick={handleCheck}>Check ✓</button>
      )}
      {checkResult && (
        <div role="button" style={s.nextWrap} onClick={() => { clearTimeout(autoAdvRef.current); onComplete(checkResult.every(Boolean), checkResult) }}>
          <span style={s.nextLabel}>{checkResult.every(Boolean) ? 'Correct! Next →' : 'Some wrong — Next →'}</span>
        </div>
      )}

      <div ref={ghostElRef} style={{ ...s.ghost, display: 'none' }} />
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────────
export default function VerbMatchTree() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase]         = useState('loading') // loading|locked|error|question|summary
  const [session, setSession]     = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [results, setResults]     = useState([])
  const [arVerbs, setArVerbs]     = useState([])    // all Verbs -AR (for the dictionary overlay)
  const [showDictionary, setShowDictionary] = useState(false)
  const savedRef = useRef(false)

  useEffect(() => { if (user) loadQuiz() }, [user?.id])

  async function loadQuiz() {
    setPhase('loading')
    const { data: verbData, error } = await supabase
      .from('verbs')
      .select('id, spanish_infinitive, english, present_conjugations, past_conjugations, future_conjugations')
      .eq('category', 'Verbs -AR')
    if (error || !verbData?.length) { setPhase('error'); return }
    setArVerbs(verbData)

    const verbIds = verbData.map(v => v.id)
    const { data: progress } = await supabase
      .from('user_verb_progress')
      .select('verb_id, t1_cj_stage, t2_cj_stage, t3_cj_stage, hidden')
      .eq('user_id', user.id)
      .in('verb_id', verbIds)
    const pmap = {}
    for (const p of progress ?? []) pmap[p.verb_id] = p

    const visible = verbData.filter(v => !pmap[v.id]?.hidden)
    const unlocked = visible.length > 0 && visible.every(v => {
      const p = pmap[v.id]
      return (p?.t1_cj_stage ?? 0) >= 4 && (p?.t2_cj_stage ?? 0) >= 4 && (p?.t3_cj_stage ?? 0) >= 4
    })
    if (!unlocked) { setPhase('locked'); return }

    // A SESSION_LENGTH-question session. Pronouns are randomised, never the same
    // two questions in a row (5 pronouns ⇒ always ≥4 alternatives, so this cannot
    // stall; a repeat is only allowed in the impossible case of no alternative).
    // A pronoun that repeats uses a different verb than its previous appearance.
    const usableFor = (pkey) => {
      const u = visible.filter(v => v.past_conjugations?.[pkey] && v.present_conjugations?.[pkey] && v.future_conjugations?.[pkey])
      return u.length ? u : visible
    }
    const sess = []
    let prevKey = null
    const lastVerbByPronoun = {}
    for (let i = 0; i < SESSION_LENGTH; i++) {
      const candidates = PRONOUNS.filter(p => p.key !== prevKey)
      const prPool = candidates.length ? candidates : PRONOUNS
      const pr = prPool[Math.floor(Math.random() * prPool.length)]

      const base = usableFor(pr.key)
      const diff = base.filter(v => v.id !== lastVerbByPronoun[pr.key])
      const verbPool = diff.length ? diff : base
      const verb = verbPool[Math.floor(Math.random() * verbPool.length)]

      const { correctByTense, chips } = buildForms(verb, pr.key)
      if (chips.length < 3) continue
      sess.push({ pronoun: pr, verb, correctByTense, chips })
      prevKey = pr.key
      lastVerbByPronoun[pr.key] = verb.id
    }

    if (sess.length < 1) { setPhase('error'); return }
    setSession(sess)
    setCurrentIdx(0)
    setResults([])
    savedRef.current = false
    setPhase('question')
  }

  function handleRoundComplete(correct, perSlot) {
    const q = session[currentIdx]
    const newResults = [...results, { pronounKey: q.pronoun.key, correct, perSlot }]
    setResults(newResults)
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.length) {
      if (!savedRef.current) { savedRef.current = true; saveSession(newResults) }
      setPhase('summary')
    } else {
      setCurrentIdx(nextIdx)
    }
  }

  // Practice metric only — Supabase, last 5 sessions, newest first. No progression.
  function buildSessionResult(rs) {
    const pronoun = {}
    for (const pr of PRONOUNS) pronoun[pr.key] = { correct: 0, incorrect: 0 }
    const tense = { past: { correct: 0, incorrect: 0 }, present: { correct: 0, incorrect: 0 }, future: { correct: 0, incorrect: 0 } }
    const order = ['past', 'present', 'future']
    for (const r of rs) {
      if (pronoun[r.pronounKey]) pronoun[r.pronounKey][r.correct ? 'correct' : 'incorrect'] += 1
      ;(r.perSlot ?? []).forEach((ok, i) => { const tk = order[i]; if (tense[tk]) tense[tk][ok ? 'correct' : 'incorrect'] += 1 })
    }
    return { at: new Date().toISOString(), correct: rs.filter(r => r.correct).length, total: rs.length, tense, pronoun }
  }

  async function saveSession(rs) {
    if (!user?.id || !rs.length) return
    const sr = buildSessionResult(rs)
    try {
      const { data } = await supabase
        .from('user_verb_match_tree_results')
        .select('recent_sessions')
        .eq('user_id', user.id)
        .maybeSingle()
      const existing = Array.isArray(data?.recent_sessions) ? data.recent_sessions : []
      const recent_sessions = [sr, ...existing].slice(0, 5)
      const { error } = await supabase
        .from('user_verb_match_tree_results')
        .upsert({ user_id: user.id, recent_sessions, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) console.warn('[matchtree] save failed:', error.message)
    } catch (e) { console.warn('[matchtree] save failed:', e?.message ?? e) }
  }

  if (phase === 'loading') return <div style={s.page}><NavBar /><p style={s.muted}>Loading…</p></div>

  if (phase === 'error') {
    return (
      <div style={s.page}><NavBar />
        <main style={s.main}>
          <p style={{ color: '#c00' }}>Could not start Match Tree.</p>
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
          <div style={s.lockCard}>🔒 Match Tree is locked. Master Present, Past and Future for all Verbs -AR to unlock it.</div>
        </main>
      </div>
    )
  }

  if (phase === 'summary') {
    const correct = results.filter(r => r.correct).length
    // Aggregate per pronoun across all its appearances this session (a pronoun
    // recurs several times over 20 questions): cumulative correct / total.
    const byPronoun = PRONOUNS
      .map(pr => {
        const rs = results.filter(r => r.pronounKey === pr.key)
        return { label: pr.label, correct: rs.filter(r => r.correct).length, total: rs.length }
      })
      .filter(row => row.total > 0)
    return (
      <>
      <div style={s.page}><NavBar />
        <main style={{ ...s.main, maxWidth: '560px' }}>
          <div style={s.lockCard}>
            <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.6rem', color: '#111' }}>{correct} / {results.length} correct</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {byPronoun.map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ width: '110px', fontSize: '0.85rem', color: '#555' }}>{row.label}</span>
                  <span style={{ fontSize: '0.85rem', color: row.correct === row.total ? '#16a34a' : '#d97706', fontWeight: 600 }}>
                    {row.correct} / {row.total} correct
                  </span>
                </div>
              ))}
            </div>
          </div>
          <button style={{ ...s.primaryBtn, width: '100%' }} onClick={loadQuiz}>Play again</button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={{ ...s.blueBtn, flex: 1, width: 'auto' }} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>
            <button style={s.dictBtn} onClick={() => setShowDictionary(true)}>Verb Dictionary</button>
          </div>
        </main>
      </div>

      {/* Verb Dictionary — overlay on top of the results, filtered to Verbs -AR.
          Dismissing returns to the results screen. */}
      {showDictionary && (
        <FilteredDictionaryModal
          verbs={arVerbs}
          title="Verbs -AR"
          showEndings
          onClose={() => setShowDictionary(false)}
        />
      )}
      </>
    )
  }

  const q = session[currentIdx]
  return (
    <div style={s.scrollPage}><NavBar />
      <main style={s.scrollMain}>
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

        <MatchTreeRound
          key={currentIdx}
          verb={q.verb}
          pronoun={q.pronoun}
          correctByTense={q.correctByTense}
          chips={q.chips}
          onComplete={handleRoundComplete}
        />
      </main>
    </div>
  )
}

const s = {
  page: { position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', backgroundColor: '#f8f8f6', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' },
  scrollPage: { minHeight: '100vh', backgroundColor: '#f8f8f6', fontFamily: 'system-ui, sans-serif' },
  scrollMain: { maxWidth: '600px', margin: '0 auto', padding: '0.5rem 1.5rem 3rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', boxSizing: 'border-box' },
  main: { maxWidth: '600px', margin: '0 auto', padding: '0.5rem 1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', boxSizing: 'border-box' },
  muted: { padding: '3rem 2rem', textAlign: 'center', color: '#888' },
  backBtn: { padding: '0.35rem 0', fontSize: '0.875rem', color: '#555', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' },
  lockCard: { backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '1.25rem', color: '#555', display: 'flex', flexDirection: 'column' },
  tag: { fontSize: '0.68rem', fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '0.2rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.04em', alignSelf: 'flex-start' },
  progressRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0' },
  progressBar: { flex: 1, height: '6px', backgroundColor: '#e5e5e5', borderRadius: '3px', overflow: 'hidden' },
  progressLabel: { margin: 0, fontSize: '0.8rem', color: '#888', flexShrink: 0, minWidth: '32px', textAlign: 'right' },
  primaryBtn: { padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' },
  blueBtn: { padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600, backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', width: '100%', textAlign: 'center' },
  dictBtn: { flex: 1, padding: '0.75rem 1rem', fontSize: '1rem', fontWeight: 600, backgroundColor: '#f5f5f5', color: '#333', border: '1px solid #e5e5e5', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' },

  card: { backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  cardHead: { display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', textAlign: 'center' },
  anchor: { fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '0.2rem 0.6rem', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.04em' },
  verbInf: { fontSize: '1.5rem', fontWeight: 700, color: '#111', marginTop: '4px' },
  verbEng: { fontSize: '0.9rem', fontWeight: 400, fontStyle: 'italic', color: '#999' },
  bank: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '48px', backgroundColor: '#f8f8f6', borderRadius: '8px', padding: '0.5rem', border: '1.5px dashed #e0e0e0', alignItems: 'center', justifyContent: 'center' },
  chip: { padding: '0.45rem 0.9rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '6px', fontSize: '0.95rem', fontWeight: 500, cursor: 'grab', userSelect: 'none', touchAction: 'none', whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(59,130,246,0.3)' },
  chipSelected: { padding: '0.45rem 0.9rem', backgroundColor: '#1d4ed8', color: '#fff', borderRadius: '6px', fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', userSelect: 'none', touchAction: 'none', whiteSpace: 'nowrap', boxShadow: '0 0 0 3px rgba(59,130,246,0.45)', outline: 'none' },
  rows: { display: 'flex', flexDirection: 'column', gap: '0.625rem' },
  row: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  rowLabel: { width: '72px', fontSize: '0.9rem', color: '#333', fontWeight: 700, flexShrink: 0 },
  slot: { flex: 1, minHeight: '44px', borderRadius: '6px', border: '2px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', transition: 'border-color 0.15s, background-color 0.15s' },
  slotTarget: { flex: 1, minHeight: '44px', borderRadius: '6px', border: '2px dashed #3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff', transition: 'border-color 0.15s, background-color 0.15s', cursor: 'pointer' },
  slotCorrect: { borderColor: '#16a34a', borderStyle: 'solid', backgroundColor: '#dcfce7' },
  slotWrong: { borderColor: '#dc2626', borderStyle: 'solid', backgroundColor: '#fee2e2' },
  chipInSlot: { padding: '0.4rem 0.75rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '5px', fontSize: '0.9rem', fontWeight: 500, cursor: 'grab', userSelect: 'none', touchAction: 'none', whiteSpace: 'nowrap' },
  chipInSlotSelected: { padding: '0.4rem 0.75rem', backgroundColor: '#1d4ed8', color: '#fff', borderRadius: '5px', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer', userSelect: 'none', touchAction: 'none', whiteSpace: 'nowrap', boxShadow: '0 0 0 3px rgba(59,130,246,0.45)' },
  chipCorrect: { backgroundColor: '#16a34a', cursor: 'default' },
  chipWrong: { backgroundColor: '#dc2626', cursor: 'default' },
  checkBtn: { padding: '0.75rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', width: '100%' },
  nextWrap: { borderRadius: '8px', backgroundColor: '#16a34a', cursor: 'pointer', padding: '0.75rem', textAlign: 'center', userSelect: 'none' },
  nextLabel: { color: '#fff', fontWeight: 600, fontSize: '1rem' },
  ghost: { position: 'fixed', padding: '0.45rem 0.9rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '6px', fontSize: '0.95rem', fontWeight: 500, pointerEvents: 'none', zIndex: 9999, userSelect: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(59,130,246,0.4)', transform: 'scale(1.08)' },
}
