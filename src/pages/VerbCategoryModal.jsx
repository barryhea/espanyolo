import { useState, useEffect, useRef } from 'react'
import { supabase } from '../utils/supabaseClient'
import { VerbProgressRow, PronounProgressView, PRONOUNS } from './VerbProgress'
import FilteredDictionaryModal from './FilteredDictionaryModal'

const PATTERNED_SUB_CATS = [
  { id: 3, title: 'Stem-Changing O→UE' },
  { id: 4, title: 'Stem-Changing E→IE' },
  { id: 5, title: 'Stem-Changing E→I'  },
  { id: 6, title: 'Spelling Change'     },
  { id: 7, title: '-Go Verbs'           },
  { id: 8, title: 'Regular -ER/-IR'     },
]

export default function VerbCategoryModal({ card, onClose, user, navigate, categoryTense, categoryStats, onProgressChange }) {
  const [modalSubCat,      setModalSubCat]      = useState(null)
  const [modalView,        setModalView]        = useState('menu')
  const [modalVerbs,       setModalVerbs]       = useState([])
  const [modalVerbProgress,setModalVerbProgress]= useState({})
  const [modalLoading,     setModalLoading]     = useState(false)
  const [resetting,        setResetting]        = useState(false)
  const [resetTarget,      setResetTarget]      = useState(1)
  const [progressTab,      setProgressTab]      = useState(null)
  // Persisted AR conjugation per-pronoun counts from the DB (was localStorage),
  // keyed t1/t2/t3 → the most-advanced sub-stage's { pronoun: count } for that tense.
  const [conjCounts,       setConjCounts]       = useState({})
  const [showDictionary,   setShowDictionary]   = useState(false)

  const prevCardIdRef = useRef(null)

  useEffect(() => {
    document.body.style.overflow = card ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [card])

  useEffect(() => {
    if (!card) { prevCardIdRef.current = null; return }
    if (card.id === prevCardIdRef.current) return
    prevCardIdRef.current = card.id
    setModalSubCat(null)
    setModalView('menu')
    setModalVerbs([])
    setModalVerbProgress({})
    setProgressTab(null)
    setShowDictionary(false)
    loadModalData(card)
  }, [card])

  async function loadModalData(cardDesc) {
    setModalLoading(true)
    const titles = cardDesc.isPatterned
      ? PATTERNED_SUB_CATS.map(sc => sc.title)
      : [cardDesc.title]

    const { data: verbs } = await supabase
      .from('verbs')
      .select('id, spanish_infinitive, english, category')
      .in('category', titles)
      .order('spanish_infinitive')

    setModalVerbs(verbs ?? [])
    if (!verbs?.length) { setModalLoading(false); return }

    const verbIds = verbs.map(v => v.id)
    const { data: progress, error: progressErr } = await supabase
      .from('user_verb_progress')
      .select('id, verb_id, current_stage, stage2_mastery, stage3_mastery, l4_score, drag_match_score, t1_score, t2_score, t3_score, t1_cj_stage, t2_cj_stage, t3_cj_stage, hidden')
      .eq('user_id', user.id)
      .in('verb_id', verbIds)

    if (progressErr) console.error('[VerbCategoryModal] loadModalData progress error:', progressErr)

    const progMap = {}
    for (const p of progress ?? []) {
      progMap[p.verb_id] = {
        dbId:             p.id,
        stage:            p.current_stage    ?? 1,
        stage2_mastery:   p.stage2_mastery   ?? 0,
        stage3_mastery:   p.stage3_mastery   ?? 0,
        l4_score:         p.l4_score         ?? 0,
        drag_match_score: p.drag_match_score ?? 0,
        t1_score:         p.t1_score         ?? 0,
        t2_score:         p.t2_score         ?? 0,
        t3_score:         p.t3_score         ?? 0,
        t1_cj_stage:      p.t1_cj_stage       ?? 0,
        t2_cj_stage:      p.t2_cj_stage       ?? 0,
        t3_cj_stage:      p.t3_cj_stage       ?? 0,
        hidden:           p.hidden           ?? false,
      }
    }
    setModalVerbProgress(progMap)

    // AR conjugation per-pronoun progress now lives in Supabase (not localStorage).
    // For each tense, use the counts from the most-advanced sub-stage that has data.
    const { data: conjRows } = await supabase
      .from('user_verb_conjugation_progress')
      .select('tense, sub_stage, pronoun, correct_count')
      .eq('user_id', user.id)
    const grouped = {}
    for (const r of conjRows ?? []) {
      const g = `${r.tense}-${r.sub_stage}`
      ;(grouped[g] ??= {})[r.pronoun] = r.correct_count ?? 0
    }
    const numToKey = { 1: 't1', 2: 't2', 3: 't3' }
    const byTense = {}
    for (const tense of [1, 2, 3]) {
      for (let sub = 3; sub >= 1; sub--) {
        if (grouped[`${tense}-${sub}`]) { byTense[numToKey[tense]] = grouped[`${tense}-${sub}`]; break }
      }
    }
    setConjCounts(byTense)
    setModalLoading(false)
  }

  function handleModalBack() {
    if (modalView === 'stage-select' && modalSubCat) {
      setModalSubCat(null)
      setModalView('subgroup-select')
    } else if (modalView === 'confirm-reset') {
      setModalView('reset-level-select')
    } else {
      setModalView('menu')
    }
  }

  async function handleReset() {
    if (!card || !user || resetting) return
    setResetting(true)
    const target = resetTarget
    const verbIds = modalVerbs
      .filter(v => {
        const prog    = modalVerbProgress[v.id]
        const stage   = prog?.stage    ?? 1
        const l4Score = prog?.l4_score ?? 0
        if (target === 1) return true
        if (target === 2) return stage >= 2
        if (target === 3) return stage >= 3
        return stage >= 4 || l4Score > 0
      })
      .map(v => v.id)
    // Tense conjugation progress (the -AR t{n}_cj_stage sub-stage columns) is
    // downstream of infinitive mastery, so any reset must also clear it. Omitting
    // these columns previously left t{n}_cj_stage stranded at its last value with
    // no way to clear it through the app, so the home-card tense segments kept
    // reading the stale stage and reverting to green/orange after every reset.
    const clearTense = { t1_score: 0, t2_score: 0, t3_score: 0, t1_cj_stage: 0, t2_cj_stage: 0, t3_cj_stage: 0 }
    const updates =
      target === 2 ? { current_stage: 2, stage2_mastery: 0, stage3_mastery: 0, l4_score: 0, drag_match_score: 0, ...clearTense }
      : target === 3 ? { current_stage: 3, stage3_mastery: 0, l4_score: 0, drag_match_score: 0, ...clearTense }
      : target === 4 ? { current_stage: 4, l4_score: 0, drag_match_score: 0, ...clearTense }
      : { current_stage: 1, stage2_mastery: 0, stage3_mastery: 0, l4_score: 0, drag_match_score: 0, ...clearTense }
    if (verbIds.length > 0) {
      await supabase
        .from('user_verb_progress')
        .update(updates)
        .eq('user_id', user.id)
        .in('verb_id', verbIds)
    }
    setResetting(false)
    setModalView('menu')
    await Promise.all([loadModalData(card), onProgressChange()])
  }

  async function toggleHiddenInModal(verbId) {
    const prog     = modalVerbProgress[verbId]
    const willHide = !(prog?.hidden ?? false)
    setModalVerbProgress(prev => ({
      ...prev,
      [verbId]: { ...(prev[verbId] ?? {}), hidden: willHide },
    }))
    if (prog?.dbId) {
      await supabase.from('user_verb_progress').update({ hidden: willHide }).eq('id', prog.dbId)
    } else {
      const { data } = await supabase.from('user_verb_progress')
        .upsert({ user_id: user.id, verb_id: verbId, hidden: willHide, current_stage: 1 }, { onConflict: 'user_id,verb_id' })
        .select('id').single()
      if (data) setModalVerbProgress(prev => ({ ...prev, [verbId]: { ...(prev[verbId] ?? {}), dbId: data.id } }))
    }
  }

  if (!card) return null

  // ── Computed render vars ───────────────────────────────────────────────────
  const hiddenModalVerbs  = modalVerbs.filter(v => modalVerbProgress[v.id]?.hidden)
  const modalDisplayTitle = (modalView === 'stage-select' && modalSubCat) ? modalSubCat.title : card.title
  const showBackBtn       = modalView !== 'menu'

  const visibleModalVerbs = modalVerbs.filter(v => !modalVerbProgress[v.id]?.hidden)
  // Verbs -AR judges tense completion by t{n}_cj_stage (4 = mastered); other
  // categories by t{n}_score >= 3 — same sources as the stage-select locks below.
  const _isAR = card.title === 'Verbs -AR'
  const _tenseDone = (cjKey, scoreKey) => visibleModalVerbs.every(v => _isAR
    ? (modalVerbProgress[v.id]?.[cjKey] ?? 0) >= 4
    : (modalVerbProgress[v.id]?.[scoreKey] ?? 0) >= 3
  )
  const _allL4Done = !modalLoading && visibleModalVerbs.length > 0 && visibleModalVerbs.every(v => (modalVerbProgress[v.id]?.l4_score ?? 0) >= 5)
  const _allT1Done = _allL4Done && _tenseDone('t1_cj_stage', 't1_score')
  const _allT2Done = _allT1Done && _tenseDone('t2_cj_stage', 't2_score')
  const defaultProgressTab = !_allL4Done ? 1 : !_allT1Done ? 2 : !_allT2Done ? 3 : 4
  const activeProgressTab  = progressTab ?? defaultProgressTab

  return (
    <>
    <div style={mStyles.backdrop} onClick={onClose}>
      <div style={mStyles.modalBox} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={mStyles.modalHeader}>
          {showBackBtn && (
            <button style={mStyles.backBtn} onClick={handleModalBack}>←</button>
          )}
          <h2 style={mStyles.modalTitle}>{modalDisplayTitle}</h2>
          <button style={mStyles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* ── Menu view ─────────────────────────────────────────────── */}
        {modalView === 'menu' && (
          <div style={mStyles.menuList}>

            {card.locked ? (
              <div style={mStyles.menuOptionLocked}>
                <span style={mStyles.menuOptionLabelLocked}>🔒 Start Quiz</span>
                <span style={mStyles.menuOptionDesc}>{card.unlockMsg}</span>
              </div>
            ) : (
              <button
                style={mStyles.menuOption}
                onClick={() => setModalView(card.isPatterned ? 'subgroup-select' : 'stage-select')}
              >
                <span style={mStyles.menuOptionLabel}>Start Quiz</span>
                <span style={mStyles.menuOptionDesc}>Practice verbs in this category</span>
              </button>
            )}

            {!card.locked && (
              <button
                style={mStyles.menuOption}
                onClick={() => {
                  const categoryTitles = card.isPatterned
                    ? PATTERNED_SUB_CATS.map(sc => sc.title)
                    : [card.title]
                  onClose()
                  navigate('/verb-custom-quiz-select', {
                    state: {
                      verbs: modalVerbs,
                      categoryTitle: card.title,
                      categoryTitles,
                    },
                  })
                }}
                disabled={modalLoading}
              >
                <span style={mStyles.menuOptionLabel}>
                  Custom Quiz {modalLoading && <span style={mStyles.loadingDot}>…</span>}
                </span>
                <span style={mStyles.menuOptionDesc}>Choose which verbs and levels to practise</span>
              </button>
            )}

            <button
              style={mStyles.menuOption}
              onClick={() => setModalView('progress')}
              disabled={modalLoading}
            >
              <span style={mStyles.menuOptionLabel}>
                Progress {modalLoading && <span style={mStyles.loadingDot}>…</span>}
              </span>
              <span style={mStyles.menuOptionDesc}>All verbs and your current stage</span>
            </button>

            <button
              style={mStyles.menuOption}
              onClick={() => setModalView('hidden')}
              disabled={modalLoading}
            >
              <span style={mStyles.menuOptionLabel}>
                Hidden Verbs {modalLoading && <span style={mStyles.loadingDot}>…</span>}
              </span>
              <span style={mStyles.menuOptionDesc}>Verbs you've excluded from quizzes</span>
            </button>

            <button
              style={mStyles.menuOption}
              onClick={() => setShowDictionary(true)}
              disabled={modalLoading}
            >
              <span style={mStyles.menuOptionLabel}>
                Verb Dictionary {modalLoading && <span style={mStyles.loadingDot}>…</span>}
              </span>
              <span style={mStyles.menuOptionDesc}>Conjugations for this category's verbs</span>
            </button>

            <button
              style={mStyles.menuOptionDestructive}
              onClick={() => setModalView('reset-level-select')}
              disabled={modalLoading}
            >
              <span style={mStyles.menuOptionLabelDestructive}>
                Reset Level {modalLoading && <span style={mStyles.loadingDot}>…</span>}
              </span>
              <span style={mStyles.menuOptionDesc}>Roll back progress to a chosen level</span>
            </button>
          </div>
        )}

        {/* ── Reset level select ────────────────────────────────────── */}
        {modalView === 'reset-level-select' && (
          <div style={mStyles.menuList}>
            {[
              { label: 'Level One',   value: 1, desc: 'Reset all verbs back to the start of Level 1' },
              { label: 'Level Two',   value: 2, desc: 'Reset verbs at L2 or above back to Level 2'   },
              { label: 'Level Three', value: 3, desc: 'Reset verbs at L3 or above back to Level 3'   },
              { label: 'Level Four',  value: 4, desc: 'Reset verbs at L4 back to Level 4'            },
            ].map(opt => (
              <button
                key={opt.value}
                style={mStyles.menuOption}
                onClick={() => { setResetTarget(opt.value); setModalView('confirm-reset') }}
              >
                <span style={mStyles.menuOptionLabel}>{opt.label}</span>
                <span style={mStyles.menuOptionDesc}>{opt.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Sub-group select (Patterned Irregulars → Start Quiz) ───── */}
        {modalView === 'subgroup-select' && (
          <div style={mStyles.menuList}>
            {PATTERNED_SUB_CATS.map((sc, idx) => {
              const prevSc    = idx > 0 ? PATTERNED_SUB_CATS[idx - 1] : null
              const subLocked = prevSc ? !categoryTense[prevSc.title]?.t3Done : false
              const subT      = categoryTense[sc.title] ?? {}
              const subStats  = categoryStats[sc.title] ?? { total: 0, mastered: 0 }
              const subComplete = !!subT.t3Done

              return subLocked ? (
                <div key={sc.id} style={mStyles.stageOptionLocked}>
                  <div style={mStyles.stageLeft}>
                    <span style={mStyles.stageLabelLocked}>{sc.title}</span>
                    <span style={mStyles.stageSub}>{subStats.total} verbs</span>
                  </div>
                  <div style={mStyles.stageRight}>
                    <span style={mStyles.stageProgressText}>Locked</span>
                    <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>🔒</span>
                  </div>
                </div>
              ) : (
                <button
                  key={sc.id}
                  style={mStyles.stageOption}
                  onClick={() => { setModalSubCat(sc); setModalView('stage-select') }}
                >
                  <div style={mStyles.stageLeft}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: subComplete ? '#22c55e' : '#e5e7eb', flexShrink: 0 }} />
                      <span style={mStyles.stageLabel}>{sc.title}</span>
                    </div>
                    <span style={mStyles.stageSub}>{subStats.total} verbs · {subStats.mastered} mastered</span>
                  </div>
                  <div style={mStyles.stageRight}>
                    <span style={{ ...mStyles.stageProgressText, color: subComplete ? '#16a34a' : '#888' }}>
                      {subComplete ? 'Complete ✓' : `${subStats.mastered} / ${subStats.total}`}
                    </span>
                    <span style={mStyles.stageChevron}>›</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* ── Progress view ──────────────────────────────────────────── */}
        {modalView === 'progress' && !modalLoading && (
          <p style={mStyles.progressSummary}>
            {modalVerbs.length} verbs · {modalVerbs.filter(v => (modalVerbProgress[v.id]?.l4_score ?? 0) >= 5).length} L4 mastered · {hiddenModalVerbs.length} hidden
          </p>
        )}
        {modalView === 'progress' && !modalLoading && (
          <div style={mStyles.progressTabRow}>
            {[1, 2, 3, 4].map(level => (
              <button
                key={level}
                style={activeProgressTab === level ? mStyles.progressTabActive : mStyles.progressTabBtn}
                onClick={() => setProgressTab(level)}
              >
                Level {level}
              </button>
            ))}
          </div>
        )}
        {modalView === 'progress' && (
          <div style={mStyles.modalBody}>
            {modalLoading
              ? <p style={mStyles.emptyMsg}>Loading…</p>
              : modalVerbs.length === 0
                ? <p style={mStyles.emptyMsg}>No verbs in this category.</p>
                : activeProgressTab === 1
                  ? modalVerbs.map(v => (
                      <VerbProgressRow
                        key={v.id}
                        verb={v}
                        prog={modalVerbProgress[v.id]}
                        onToggleHidden={toggleHiddenInModal}
                      />
                    ))
                  : (() => {
                      const tKey = activeProgressTab === 2 ? 't1' : activeProgressTab === 3 ? 't2' : 't3'
                      // Persisted per-pronoun counts now come from the DB (loaded in
                      // loadModalData), not localStorage.
                      const pCounts = conjCounts[tKey] ?? null
                      return (
                        <PronounProgressView
                          level={activeProgressTab}
                          verbs={modalVerbs}
                          progMap={modalVerbProgress}
                          pronounCounts={pCounts}
                        />
                      )
                    })()
            }
          </div>
        )}

        {/* ── Hidden verbs view ──────────────────────────────────────── */}
        {modalView === 'hidden' && (
          <div style={mStyles.modalBody}>
            {modalLoading
              ? <p style={mStyles.emptyMsg}>Loading…</p>
              : hiddenModalVerbs.length === 0
                ? <p style={mStyles.emptyMsg}>No hidden verbs for this category.</p>
                : hiddenModalVerbs.map(v => (
                    <VerbProgressRow
                      key={v.id}
                      verb={v}
                      prog={modalVerbProgress[v.id]}
                      onToggleHidden={toggleHiddenInModal}
                    />
                  ))
            }
          </div>
        )}

        {/* ── Confirm reset view ─────────────────────────────────────── */}
        {modalView === 'confirm-reset' && (() => {
          const LEVEL_NAMES = ['Level One', 'Level Two', 'Level Three', 'Level Four']
          const levelName = LEVEL_NAMES[resetTarget - 1]
          const msg = resetTarget === 1
            ? `All progress for ${card.title} will be reset to Level One.`
            : `Verbs at Level ${resetTarget} or above in ${card.title} will be reset to ${levelName}.`
          return (
            <div style={mStyles.confirmBody}>
              <p style={mStyles.confirmText}>{msg}</p>
              <p style={mStyles.confirmSubText}>Hidden verb settings will be preserved.</p>
              <div style={mStyles.confirmBtns}>
                <button style={mStyles.cancelBtn} onClick={() => setModalView('reset-level-select')} disabled={resetting}>Cancel</button>
                <button style={mStyles.confirmResetBtn} onClick={handleReset} disabled={resetting}>
                  {resetting ? 'Resetting…' : 'Reset'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── Stage selector ─────────────────────────────────────────── */}
        {modalView === 'stage-select' && (() => {
          const activeCatTitle = modalSubCat ? modalSubCat.title : card.title
          const activeCatId    = modalSubCat ? modalSubCat.id    : card.id

          const activeVerbIds = modalSubCat
            ? modalVerbs.filter(v => v.category === modalSubCat.title).map(v => v.id)
            : modalVerbs.map(v => v.id)
          const loading    = modalLoading
          const total      = loading ? '…' : activeVerbIds.length
          const masteredCt = loading ? '…' : activeVerbIds.filter(id => (modalVerbProgress[id]?.l4_score ?? 0) >= 5).length
          const tScoreLabel = scoreKey => {
            if (loading) return '…'
            const ct = activeVerbIds.filter(id => (modalVerbProgress[id]?.[scoreKey] ?? 0) >= 3).length
            return `${ct} / ${total} verbs`
          }

          // Compute completion state from freshly loaded modal data so it reflects
          // the current DB state rather than the potentially stale categoryTense snapshot.
          // Hidden verbs are excluded from every completion check (matching the card's
          // visibleIds approach) so verbs the user marked as known never block unlocking.
          // Verbs -AR tracks tense completion via t{n}_cj_stage (4 = mastered), exactly
          // as the card and the AR quiz engine do; t{n}_score resets per sub-stage and
          // is unreliable for completion. Other categories use t{n}_score >= 3.
          const isAR = activeCatTitle === 'Verbs -AR'
          const visibleActiveIds = activeVerbIds.filter(id => !(modalVerbProgress[id]?.hidden ?? false))
          const tenseDone = (cjKey, scoreKey) => visibleActiveIds.every(id => isAR
            ? (modalVerbProgress[id]?.[cjKey] ?? 0) >= 4
            : (modalVerbProgress[id]?.[scoreKey] ?? 0) >= 3
          )
          const localAllL4Done = !loading && visibleActiveIds.length > 0
            && visibleActiveIds.every(id => (modalVerbProgress[id]?.l4_score ?? 0) >= 5)
          const localT1Done = localAllL4Done && tenseDone('t1_cj_stage', 't1_score')
          const localT2Done = localT1Done && tenseDone('t2_cj_stage', 't2_score')
          const localT3Done = localT2Done && tenseDone('t3_cj_stage', 't3_score')

          // AR Mastery unlock: Present, Past and Future all fully mastered for every
          // visible AR verb (t1/t2/t3_cj_stage all = 4), read from Supabase.
          const arMasteryUnlocked = isAR && !loading && visibleActiveIds.length > 0
            && visibleActiveIds.every(id =>
              (modalVerbProgress[id]?.t1_cj_stage ?? 0) >= 4 &&
              (modalVerbProgress[id]?.t2_cj_stage ?? 0) >= 4 &&
              (modalVerbProgress[id]?.t3_cj_stage ?? 0) >= 4)

          // "Started" = the tense has genuine stored progress on at least one
          // visible verb (AR: an advanced sub-stage or any score within the first;
          // others: any t{n}_score). Drives a grey/orange/green status dot so an
          // unstarted-but-unlocked tense shows grey rather than a false orange.
          const tenseStarted = (cjKey, scoreKey) => visibleActiveIds.some(id => isAR
            ? ((modalVerbProgress[id]?.[cjKey] ?? 0) >= 1 || (modalVerbProgress[id]?.[scoreKey] ?? 0) >= 1)
            : (modalVerbProgress[id]?.[scoreKey] ?? 0) >= 1
          )
          const infinitiveStarted = visibleActiveIds.some(id => {
            const p = modalVerbProgress[id]
            return (p?.stage ?? 1) >= 2 || (p?.drag_match_score ?? 0) >= 1 || (p?.l4_score ?? 0) >= 1
          })

          const STAGES = [
            {
              key:      'infinitive',
              name:     'Infinitive',
              sub:      'L1 → L4',
              locked:   false,
              complete: localAllL4Done,
              started:  infinitiveStarted,
              progress: `${masteredCt} / ${total} mastered`,
              color:    '#f5c518',
            },
            {
              key:      't1',
              name:     'Present Tense',
              sub:      'T1',
              locked:   !localAllL4Done,
              complete: localT1Done,
              started:  tenseStarted('t1_cj_stage', 't1_score'),
              progress: tScoreLabel('t1_score'),
              color:    '#3b82f6',
            },
            {
              key:      't2',
              name:     'Past Tense',
              sub:      'T2',
              locked:   !localT1Done,
              complete: localT2Done,
              started:  tenseStarted('t2_cj_stage', 't2_score'),
              progress: tScoreLabel('t2_score'),
              color:    '#f97316',
            },
            {
              key:      't3',
              name:     'Future Tense',
              sub:      'T3',
              locked:   !localT2Done,
              complete: localT3Done,
              started:  tenseStarted('t3_cj_stage', 't3_score'),
              progress: tScoreLabel('t3_score'),
              color:    '#16a34a',
            },
          ]

          // AR Mastery is presented as two always-accessible practice stages once
          // Present/Past/Future are all mastered; the user picks which to practise.
          const masteryRow = (key, label, sub, go) => arMasteryUnlocked ? (
            <button key={key} style={mStyles.stageOption} onClick={() => { onClose(); go() }}>
              <div style={mStyles.stageLeft}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#7c3aed', flexShrink: 0 }} />
                  <span style={mStyles.stageLabel}>{label}</span>
                </div>
                <span style={mStyles.stageSub}>{sub}</span>
              </div>
              <div style={mStyles.stageRight}>
                <span style={mStyles.stageProgressText}>Practice</span>
                <span style={mStyles.stageChevron}>›</span>
              </div>
            </button>
          ) : (
            <div key={key} style={mStyles.stageOptionLocked}>
              <div style={mStyles.stageLeft}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#e5e7eb', flexShrink: 0 }} />
                  <span style={mStyles.stageLabelLocked}>{label}</span>
                </div>
                <span style={mStyles.stageSub}>Master Present, Past &amp; Future to unlock</span>
              </div>
              <div style={mStyles.stageRight}>
                <span style={mStyles.stageProgressText}>Locked</span>
                <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>🔒</span>
              </div>
            </div>
          )

          return (
            <div style={mStyles.menuList}>
              {STAGES.map(stage => stage.locked ? (
                <div key={stage.key} style={mStyles.stageOptionLocked}>
                  <div style={mStyles.stageLeft}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#e5e7eb', flexShrink: 0 }} />
                      <span style={mStyles.stageLabelLocked}>{stage.name}</span>
                    </div>
                  </div>
                  <div style={mStyles.stageRight}>
                    <span style={mStyles.stageProgressText}>Locked</span>
                    <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>🔒</span>
                  </div>
                </div>
              ) : (
                <button
                  key={stage.key}
                  style={mStyles.stageOption}
                  onClick={() => { onClose(); navigate(`/verb-quiz/${activeCatId}`) }}
                >
                  <div style={mStyles.stageLeft}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: stage.complete ? '#22c55e' : stage.started ? '#f59e0b' : '#e5e7eb', flexShrink: 0 }} />
                      <span style={mStyles.stageLabel}>{stage.name}</span>
                    </div>
                  </div>
                  <div style={mStyles.stageRight}>
                    <span style={{ ...mStyles.stageProgressText, color: stage.complete ? '#16a34a' : '#888' }}>
                      {stage.complete ? 'Complete ✓' : stage.progress}
                    </span>
                    <span style={mStyles.stageChevron}>›</span>
                  </div>
                </button>
              ))}

              {/* AR Mastery — two always-accessible practice stages (Match Tree +
                  Mastery quiz), unlocked once Present, Past and Future are mastered. */}
              {isAR && masteryRow('mt', 'Mastery · Stage 1 — Match Tree', 'Drag/tap a verb’s Past/Present/Future by pronoun', () => navigate('/verb-match-tree'))}
              {isAR && masteryRow('mq', 'Mastery · Stage 2 — Quiz', 'Mixed Stage 4 typed · all tenses', () => navigate('/verb-mastery-quiz'))}
            </div>
          )
        })()}

      </div>
    </div>

    {/* Filtered Verb Dictionary — overlay above the category popup, showing only
        this category's verbs. Closing returns to the category popup. */}
    {showDictionary && (
      <FilteredDictionaryModal
        verbs={modalVerbs}
        title={card.title}
        showEndings={card.title === 'Verbs -AR'}
        onClose={() => setShowDictionary(false)}
      />
    )}
    </>
  )
}

// ── Modal styles ──────────────────────────────────────────────────────────────
const mStyles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: '14px',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1rem 1.25rem',
    borderBottom: '1px solid #f0f0f0',
    flexShrink: 0,
  },
  backBtn: {
    background: 'none', border: 'none', fontSize: '1.1rem',
    color: '#555', cursor: 'pointer', padding: '0 0.25rem', lineHeight: 1,
  },
  modalTitle: {
    flex: 1, margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111',
  },
  closeBtn: {
    background: 'none', border: 'none', fontSize: '1rem',
    color: '#888', cursor: 'pointer', padding: '0.25rem', lineHeight: 1, borderRadius: '4px',
  },
  menuList: {
    display: 'flex', flexDirection: 'column', padding: '0.5rem', gap: '0.25rem',
  },
  menuOption: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem',
    padding: '0.875rem 1rem', background: 'none', border: 'none',
    borderRadius: '8px', cursor: 'pointer', textAlign: 'left', transition: 'background-color 0.12s',
  },
  menuOptionLocked: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem',
    padding: '0.875rem 1rem', borderRadius: '8px', opacity: 0.45, cursor: 'default',
  },
  menuOptionLabel:         { fontSize: '0.95rem', fontWeight: 600, color: '#111' },
  menuOptionLabelLocked:   { fontSize: '0.95rem', fontWeight: 600, color: '#555' },
  menuOptionDestructive: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem',
    padding: '0.875rem 1rem', background: 'none', border: 'none',
    borderRadius: '8px', cursor: 'pointer', textAlign: 'left', transition: 'background-color 0.12s',
    borderTop: '1px solid #f0f0f0', marginTop: '0.15rem',
  },
  menuOptionLabelDestructive: { fontSize: '0.95rem', fontWeight: 600, color: '#dc2626' },
  menuOptionDesc: { fontSize: '0.8rem', color: '#888' },
  progressSummary: {
    margin: 0, padding: '0.65rem 1rem', fontSize: '0.78rem',
    color: '#888', borderBottom: '1px solid #f0f0f0',
  },
  progressTabRow: {
    display: 'flex', gap: '0.375rem', padding: '0.5rem 1rem',
    borderBottom: '1px solid #f0f0f0', flexShrink: 0,
  },
  progressTabBtn: {
    flex: 1, padding: '0.4rem 0.25rem', fontSize: '0.75rem', fontWeight: 500,
    color: '#888', backgroundColor: '#f5f5f5', border: '1px solid #e5e5e5',
    borderRadius: '6px', cursor: 'pointer',
  },
  progressTabActive: {
    flex: 1, padding: '0.4rem 0.25rem', fontSize: '0.75rem', fontWeight: 700,
    color: '#111', backgroundColor: '#fff', border: '1px solid #111',
    borderRadius: '6px', cursor: 'pointer',
  },
  modalBody:  { overflowY: 'auto', flex: 1 },
  emptyMsg:   { margin: 0, padding: '1.5rem', color: '#888', fontSize: '0.9rem' },
  confirmBody: {
    padding: '1.25rem 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
  },
  confirmText:    { margin: 0, fontSize: '0.95rem', color: '#111', lineHeight: 1.5 },
  confirmSubText: { margin: 0, fontSize: '0.85rem', color: '#666' },
  confirmBtns:    { display: 'flex', gap: '0.75rem', marginTop: '0.5rem' },
  cancelBtn: {
    flex: 1, padding: '0.7rem 1rem', fontSize: '0.95rem', fontWeight: 600,
    backgroundColor: '#f5f5f5', color: '#333', border: '1px solid #e5e5e5',
    borderRadius: '8px', cursor: 'pointer',
  },
  confirmResetBtn: {
    flex: 1, padding: '0.7rem 1rem', fontSize: '0.95rem', fontWeight: 600,
    backgroundColor: '#dc2626', color: '#fff', border: 'none',
    borderRadius: '8px', cursor: 'pointer',
  },
  loadingDot: { fontWeight: 400, color: '#aaa' },

  // Stage / sub-group selector rows
  stageOption: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.875rem 1rem', background: 'none', border: 'none',
    borderRadius: '8px', cursor: 'pointer', width: '100%', textAlign: 'left',
    transition: 'background-color 0.12s',
  },
  stageOptionLocked: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.875rem 1rem', borderRadius: '8px', opacity: 0.4, cursor: 'default',
  },
  stageLeft:        { display: 'flex', flexDirection: 'column', gap: '2px' },
  stageRight:       { display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 },
  stageLabel:       { fontSize: '0.95rem', fontWeight: 600, color: '#111' },
  stageLabelLocked: { fontSize: '0.95rem', fontWeight: 600, color: '#555' },
  stageSub:         { fontSize: '0.72rem', color: '#aaa', fontWeight: 500 },
  stageProgressText:{ fontSize: '0.78rem', color: '#888' },
  stageChevron:     { fontSize: '1.1rem', color: '#ccc' },
}
