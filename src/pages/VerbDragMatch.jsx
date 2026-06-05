import { useState, useEffect, useRef } from 'react'

const PRONOUNS = [
  { key: 'yo',       label: 'Yo',            english: 'I'        },
  { key: 'tu',       label: 'Tú',            english: 'You'      },
  { key: 'el',       label: 'Él / Ella',     english: 'He / She' },
  { key: 'nosotros', label: 'Nosotros',      english: 'We'       },
  { key: 'ellos',    label: 'Ellos / Ellas', english: 'They'     },
]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const DRAG_THRESHOLD = 8

const s = {
  dragCard:        { backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  dragHeader:      { display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' },
  dragSpanish:     { fontSize: '1.4rem', fontWeight: 700, color: '#111' },
  dragEnglish:     { fontSize: '0.85rem', color: '#888' },
  dragBank:        { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '48px', backgroundColor: '#f8f8f6', borderRadius: '8px', padding: '0.5rem', border: '1.5px dashed #e0e0e0', alignItems: 'center' },
  dragChip:        { padding: '0.4rem 0.875rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 500, cursor: 'grab', userSelect: 'none', touchAction: 'none', whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(59,130,246,0.3)' },
  dragChipSelected:{ padding: '0.4rem 0.875rem', backgroundColor: '#1d4ed8', color: '#fff', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer', userSelect: 'none', touchAction: 'none', whiteSpace: 'nowrap', boxShadow: '0 0 0 3px rgba(59,130,246,0.45)', outline: 'none' },
  dragPairs:       { display: 'flex', flexDirection: 'column', gap: '0.625rem' },
  dragPairRow:     { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  dragPronoun:     { flex: 1, fontSize: '0.95rem', color: '#333', fontWeight: 500, minWidth: 0 },
  dragSlot:        { width: '130px', minHeight: '40px', borderRadius: '6px', border: '2px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', flexShrink: 0, transition: 'border-color 0.15s, background-color 0.15s' },
  dragSlotTarget:  { width: '130px', minHeight: '40px', borderRadius: '6px', border: '2px dashed #3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff', flexShrink: 0, transition: 'border-color 0.15s, background-color 0.15s', cursor: 'pointer' },
  slotCorrect:     { borderColor: '#16a34a', borderStyle: 'solid', backgroundColor: '#dcfce7' },
  slotWrong:       { borderColor: '#dc2626', borderStyle: 'solid', backgroundColor: '#fee2e2' },
  chipInSlot:      { padding: '0.35rem 0.625rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '5px', fontSize: '0.85rem', fontWeight: 500, cursor: 'grab', userSelect: 'none', touchAction: 'none', whiteSpace: 'nowrap', maxWidth: '118px', overflow: 'hidden', textOverflow: 'ellipsis' },
  chipInSlotSelected: { padding: '0.35rem 0.625rem', backgroundColor: '#1d4ed8', color: '#fff', borderRadius: '5px', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', userSelect: 'none', touchAction: 'none', whiteSpace: 'nowrap', maxWidth: '118px', overflow: 'hidden', textOverflow: 'ellipsis', boxShadow: '0 0 0 3px rgba(59,130,246,0.45)' },
  chipCorrect:     { backgroundColor: '#16a34a', cursor: 'default' },
  chipWrong:       { backgroundColor: '#dc2626', cursor: 'default' },
  checkBtn:        { padding: '0.75rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', width: '100%' },
  progressBtnWrap: { position: 'relative', overflow: 'hidden', borderRadius: '8px', backgroundColor: '#dcfce7', cursor: 'pointer', padding: '0.75rem', textAlign: 'center', userSelect: 'none', boxSizing: 'border-box' },
  progressFill:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#16a34a', transformOrigin: 'left center', transform: 'scaleX(0)', animation: 'cjFill 2.5s linear forwards' },
  progressLabel:   { position: 'relative', zIndex: 1, color: '#fff', fontWeight: 600, fontSize: '1rem', textShadow: '0 1px 3px rgba(0,0,0,0.35)' },
  dragChipGhost:   { position: 'fixed', padding: '0.4rem 0.875rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 500, pointerEvents: 'none', zIndex: 9999, userSelect: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(59,130,246,0.4)', transform: 'scale(1.08)' },
}

export function ConjDragRound({ verb, conjKey, onComplete }) {
  const forms = PRONOUNS.map(p => ({ pronounKey: p.key, label: p.label, form: verb[conjKey]?.[p.key] ?? '' }))

  const [bank, setBank]               = useState(() => shuffle(forms.map(f => ({ id: f.pronounKey, label: f.form }))))
  const [slots, setSlots]             = useState(() => forms.map(f => ({ pronounKey: f.pronounKey, label: f.label, chip: null })))
  const [checkResult, setCheckResult] = useState(null)
  const [selectedChip, setSelectedChip] = useState(null) // { chip, source: 'bank' | slotIdx }

  const pendingDragRef  = useRef(null) // { chip, source, startX, startY, offsetX, offsetY }
  const dragChipRef     = useRef(null) // set when drag is active
  const ghostElRef      = useRef(null)
  const ghostOffsetRef  = useRef({ x: 0, y: 0 })
  const slotRefs        = useRef([])
  const slotsStateRef   = useRef(slots)
  const selectedRef     = useRef(null)
  const checkResultRef  = useRef(null)
  const autoAdvRef      = useRef(null)

  useEffect(() => { slotsStateRef.current = slots },        [slots])
  useEffect(() => { selectedRef.current   = selectedChip }, [selectedChip])
  useEffect(() => { checkResultRef.current = checkResult }, [checkResult])

  useEffect(() => {
    if (!checkResult) return
    const correct = checkResult.every(Boolean)
    const tid = setTimeout(() => onComplete(correct, checkResult), 2500)
    autoAdvRef.current = tid
    return () => clearTimeout(tid)
  }, [checkResult])

  useEffect(() => {
    const onMove = (e) => {
      // Active drag — move ghost
      if (dragChipRef.current) {
        if (ghostElRef.current) {
          ghostElRef.current.style.left = (e.clientX - ghostOffsetRef.current.x) + 'px'
          ghostElRef.current.style.top  = (e.clientY - ghostOffsetRef.current.y) + 'px'
        }
        return
      }

      const pd = pendingDragRef.current
      if (!pd) return

      // Start drag once movement exceeds threshold
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
          ghostElRef.current.style.left  = (e.clientX - pd.offsetX) + 'px'
          ghostElRef.current.style.top   = (e.clientY - pd.offsetY) + 'px'
          ghostElRef.current.style.display = 'block'
        }
      }
    }

    const onUp = (e) => {
      // ── Drop after drag ───────────────────────────────────────────────────
      if (dragChipRef.current) {
        const chip = dragChipRef.current
        dragChipRef.current = null
        if (ghostElRef.current) ghostElRef.current.style.display = 'none'

        let targetIdx = -1
        for (let i = 0; i < slotRefs.current.length; i++) {
          const el = slotRefs.current[i]
          if (!el) continue
          const r = el.getBoundingClientRect()
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            targetIdx = i; break
          }
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

      // ── Tap on chip (no drag occurred) ────────────────────────────────────
      const pd = pendingDragRef.current
      if (!pd) return
      pendingDragRef.current = null

      if (checkResultRef.current) return

      const { chip, source } = pd
      const selected = selectedRef.current

      if (selected) {
        if (selected.chip.id === chip.id) {
          // Tapping the already-selected chip → deselect
          setSelectedChip(null)
        } else if (typeof source === 'number') {
          // Tapping a different chip in a slot while one is selected → place selected chip here
          const slotIdx = source
          const { chip: selChip, source: selSrc } = selected
          setSlots(prev => {
            const next = [...prev]
            next[slotIdx] = { ...next[slotIdx], chip: selChip }
            if (typeof selSrc === 'number') next[selSrc] = { ...next[selSrc], chip: null }
            return next
          })
          if (selSrc === 'bank') setBank(prev => prev.filter(c => c.id !== selChip.id))
          setBank(prev => [...prev, chip]) // displaced chip returns to bank
          setSelectedChip(null)
          setCheckResult(null)
        } else {
          // Tapping a different bank chip → change selection
          setSelectedChip({ chip, source })
        }
      } else {
        // Nothing selected → select this chip
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

  // Tap on a slot (empty area, or via slot onClick when chip inside stops propagation)
  function handleSlotTap(slotIdx) {
    if (checkResult) return
    if (!selectedChip) return

    const { chip, source } = selectedChip

    if (source === slotIdx) {
      // Tapped the source slot → deselect
      setSelectedChip(null)
      return
    }

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
    pendingDragRef.current = {
      chip, source,
      startX: e.clientX, startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    }
  }

  const allFilled    = slots.every(sl => sl.chip !== null)
  const hasSelection = selectedChip !== null

  return (
    <div style={s.dragCard}>
      <div style={s.dragHeader}>
        <span style={s.dragSpanish}>{verb.spanish_infinitive}</span>
        <span style={s.dragEnglish}>{verb.english}</span>
      </div>

      {/* ── Options bank ───────────────────────────────────────────────────── */}
      <div style={s.dragBank}>
        {bank.map(chip => {
          const isSel = selectedChip?.chip.id === chip.id
          return (
            <div
              key={chip.id}
              style={isSel ? s.dragChipSelected : s.dragChip}
              onPointerDown={e => startPendingDrag(chip, 'bank', e)}
            >
              {chip.label}
            </div>
          )
        })}
        {bank.length === 0 && <span style={{ color: '#aaa', fontSize: '0.85rem' }}>All placed ✓</span>}
      </div>

      {/* ── Pronoun slots ───────────────────────────────────────────────────── */}
      <div style={s.dragPairs}>
        {slots.map((slot, i) => {
          const chipSel    = selectedChip?.chip.id === slot.chip?.id
          const slotStyle  = checkResult
            ? { ...s.dragSlot, ...(checkResult[i] ? s.slotCorrect : s.slotWrong) }
            : hasSelection ? s.dragSlotTarget : s.dragSlot

          return (
            <div key={slot.pronounKey} style={s.dragPairRow}>
              <div style={s.dragPronoun}>{slot.label}</div>
              <div
                ref={el => slotRefs.current[i] = el}
                style={slotStyle}
                onClick={() => handleSlotTap(i)}
              >
                {slot.chip && (
                  <div
                    style={{
                      ...(checkResult
                        ? { ...s.chipInSlot, ...(checkResult[i] ? s.chipCorrect : s.chipWrong) }
                        : chipSel ? s.chipInSlotSelected : s.chipInSlot),
                    }}
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
        <button style={s.checkBtn} onClick={() => setCheckResult(slots.map(sl => sl.chip?.id === sl.pronounKey))}>Check ✓</button>
      )}
      {checkResult && (
        <>
          <style>{`@keyframes cjFill{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
          <div role="button" style={s.progressBtnWrap} onClick={() => { clearTimeout(autoAdvRef.current); onComplete(checkResult.every(Boolean), checkResult) }}>
            <div style={s.progressFill} />
            <span style={s.progressLabel}>{checkResult.every(Boolean) ? 'Correct! Next →' : 'Some wrong — Next →'}</span>
          </div>
        </>
      )}

      <div ref={ghostElRef} style={{ ...s.dragChipGhost, display: 'none' }} />
    </div>
  )
}
