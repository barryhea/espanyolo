import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { VERB_CATEGORIES } from '../utils/courseData'
import NavBar from '../components/NavBar'

const PATTERNED_SUB_CATS = [
  { id: 3, title: 'Stem-Changing O→UE' },
  { id: 4, title: 'Stem-Changing E→IE' },
  { id: 5, title: 'Stem-Changing E→I'  },
  { id: 6, title: 'Spelling Change'     },
  { id: 7, title: '-Go Verbs'           },
  { id: 8, title: 'Regular -ER/-IR'     },
]

// ── Stage strip ───────────────────────────────────────────────────────────────
function segColors(complete, active) {
  if (complete) return { bar: '#22c55e', text: '#22c55e' }
  if (active)   return { bar: '#f59e0b', text: '#f59e0b' }
  return          { bar: '#e5e7eb', text: '#d1d5db' }
}

function MasteryStrip7({ l1, l2, l3, l4, t1, t2, t3, locked }) {
  const tenseSegs = [
    { label: 'Inf.',  ...segColors(!!l4,       !locked && !l4)                },
    { label: 'Pres.', ...segColors(!!t1,       !locked && !!l4 && !t1)        },
    { label: 'Past',  ...segColors(!!t2,       !locked && !!t1 && !t2)        },
    { label: 'Fut.',  ...segColors(!!t3,       !locked && !!t2 && !t3)        },
  ]
  // Once all verbs have reached L4 mastery the tense phase begins.
  // Re-map the L-bars to show tense stage progress so they reset rather
  // than carrying over all-green from the infinitive phase.
  const inTensePhase = !!l4
  const lSegs = inTensePhase
    ? [
        { label: 'L1', ...segColors(!!t1,                !locked && !t1)         },
        { label: 'L2', ...segColors(!!t2,                !locked && !!t1 && !t2) },
        { label: 'L3', ...segColors(!!t3,                !locked && !!t2 && !t3) },
        { label: 'L4', ...segColors(!!(t1 && t2 && t3),  false)                  },
      ]
    : [
        { label: 'L1', ...segColors(!!l1, !locked && !l1)              },
        { label: 'L2', ...segColors(!!l2, !locked && !!l1 && !l2)      },
        { label: 'L3', ...segColors(!!l3, !locked && !!l2 && !l3)      },
        { label: 'L4', ...segColors(!!l4, !locked && !!l3 && !l4)      },
      ]
  const seg = ({ label, bar, text }) => (
    <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      <div style={{ width: '14px', height: '5px', borderRadius: '2px', backgroundColor: bar }} />
      <span style={{ fontSize: '0.46rem', fontWeight: 700, lineHeight: 1, color: text }}>{label}</span>
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: '3px', marginTop: '5px', alignItems: 'flex-end' }}>
      {tenseSegs.map(seg)}
      <div style={{ width: '1px', height: '14px', backgroundColor: '#e5e7eb', margin: '0 1px', flexShrink: 0 }} />
      {lSegs.map(seg)}
    </div>
  )
}

// ── Card icons ────────────────────────────────────────────────────────────────
function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ccc"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" style={{ display: 'block' }}>
      <circle cx="13" cy="13" r="12" fill="#f0fdf4" stroke="#22c55e" strokeWidth="1.5" />
      <polyline points="8,13 11.5,16.5 18,9.5" stroke="#22c55e" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

// ── Modal eye icons ───────────────────────────────────────────────────────────
function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeSlashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

// ── Medal icon (SVG, no emoji) ────────────────────────────────────────────────
function MedalIcon({ color, earned }) {
  const c = earned ? color : '#e5e7eb'
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" style={{ display: 'block', flexShrink: 0 }}>
      <rect x="4.5" y="0" width="5" height="6" rx="1" fill={c} />
      <circle cx="7" cy="13" r="5" fill={c} />
    </svg>
  )
}

// ── In-modal verb progress row ────────────────────────────────────────────────
function VerbProgressRow({ verb, prog, onToggleHidden }) {
  const stage   = prog?.stage    ?? 1
  const l4Score = prog?.l4_score ?? 0
  const hidden  = prog?.hidden   ?? false
  const l2 = stage >= 3 || l4Score >= 5
  const l3 = stage >= 4 || l4Score >= 5
  const l4 = l4Score >= 5
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.6rem 1rem', borderBottom: '1px solid #f5f5f5',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: hidden ? '#bbb' : '#111' }}>
          {verb.spanish_infinitive}
        </div>
        <div style={{ fontSize: '0.72rem', color: '#aaa' }}>{verb.english}</div>
      </div>
      <MedalIcon color="#cd7f32" earned={l2} />
      <MedalIcon color="#a8a9ad" earned={l3} />
      <MedalIcon color="#f5c518" earned={l4} />
      <button
        onClick={() => onToggleHidden(verb.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', marginLeft: '2px', flexShrink: 0, color: hidden ? '#3b82f6' : '#ccc' }}
      >
        {hidden ? <EyeSlashIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function VerbTrainer() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [categoryStats, setCategoryStats] = useState({})
  const [categoryTense, setCategoryTense] = useState({})

  // Modal state
  const [modalCat, setModalCat]                   = useState(null)
  // { id, title, locked, isPatterned, unlockMsg }
  const [modalSubCat, setModalSubCat]             = useState(null)
  // { id, title } — active sub-group in stage-select, null otherwise
  const [modalView, setModalView]                 = useState('menu')
  // 'menu' | 'subgroup-select' | 'stage-select' | 'progress' | 'hidden' | 'confirm-reset'
  const [modalVerbs, setModalVerbs]               = useState([])
  const [modalVerbProgress, setModalVerbProgress] = useState({})
  const [modalLoading, setModalLoading]           = useState(false)
  const [resetting, setResetting]                 = useState(false)
  const [resetTarget, setResetTarget]             = useState(1)

  useEffect(() => {
    if (user) loadProgress()
  }, [user?.id])

  useEffect(() => {
    document.body.style.overflow = modalCat ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [modalCat])

  async function loadProgress() {
    const [{ data: allVerbs, error: verbsErr }, { data: progressRows, error: progressErr }] = await Promise.all([
      supabase.from('verbs').select('id, category'),
      supabase
        .from('user_verb_progress')
        .select('verb_id, current_stage, l4_score, t1_score, t2_score, t3_score')
        .eq('user_id', user.id),
    ])

    if (verbsErr)    console.error('[VerbTrainer] loadProgress verbs error:', verbsErr)
    if (progressErr) console.error('[VerbTrainer] loadProgress progress error:', progressErr)

    const verbsByCategory = {}
    for (const v of allVerbs ?? []) {
      if (!verbsByCategory[v.category]) verbsByCategory[v.category] = []
      verbsByCategory[v.category].push(v.id)
    }

    const progByVerb = {}
    for (const p of progressRows ?? []) {
      progByVerb[p.verb_id] = {
        stage:    p.current_stage ?? 1,
        l4_score: p.l4_score     ?? 0,
        t1_score: p.t1_score     ?? 0,
        t2_score: p.t2_score     ?? 0,
        t3_score: p.t3_score     ?? 0,
      }
    }

    const stats = {}
    const tense = {}

    for (const cat of VERB_CATEGORIES) {
      const verbIds = verbsByCategory[cat.title] ?? []
      let pts = 0, maxPts = 0, masteredCt = 0

      for (const id of verbIds) {
        const prog    = progByVerb[id]
        const stage   = prog?.stage    ?? 1
        const l4Score = prog?.l4_score ?? 0
        maxPts += 4
        if (l4Score >= 5)  { pts += 4; masteredCt++ }
        else if (stage >= 4) pts += 3
        else if (stage >= 3) pts += 2
        else if (stage >= 2) pts += 1
      }

      stats[cat.title] = {
        total:       verbIds.length,
        mastered:    masteredCt,
        t1Mastered:  verbIds.filter(id => (progByVerb[id]?.t1_score ?? 0) >= 3).length,
        t2Mastered:  verbIds.filter(id => (progByVerb[id]?.t2_score ?? 0) >= 3).length,
        t3Mastered:  verbIds.filter(id => (progByVerb[id]?.t3_score ?? 0) >= 3).length,
      }

      const any       = verbIds.length > 0
      const allL1Done = any && verbIds.every(id => (progByVerb[id]?.stage    ?? 1) >= 2)
      const allL2Done = any && verbIds.every(id => (progByVerb[id]?.stage    ?? 1) >= 3)
      const allL3Done = any && verbIds.every(id => (progByVerb[id]?.stage    ?? 1) >= 4)
      const allL4Done = any && verbIds.every(id => (progByVerb[id]?.l4_score ?? 0) >= 5)
      const t1Done = allL4Done && verbIds.every(id => (progByVerb[id]?.t1_score ?? 0) >= 3)
      const t2Done = t1Done    && verbIds.every(id => (progByVerb[id]?.t2_score ?? 0) >= 3)
      const t3Done = t2Done    && verbIds.every(id => (progByVerb[id]?.t3_score ?? 0) >= 3)
      tense[cat.title] = { allL1Done, allL2Done, allL3Done, allL4Done, t1Done, t2Done, t3Done }
    }

    setCategoryStats(stats)
    setCategoryTense(tense)
  }

  // ── Patterned Irregulars aggregate helpers ────────────────────────────────
  function getPatternedTense(t) {
    return {
      allL1Done: PATTERNED_SUB_CATS.every(sc => t[sc.title]?.allL1Done),
      allL2Done: PATTERNED_SUB_CATS.every(sc => t[sc.title]?.allL2Done),
      allL3Done: PATTERNED_SUB_CATS.every(sc => t[sc.title]?.allL3Done),
      allL4Done: PATTERNED_SUB_CATS.every(sc => t[sc.title]?.allL4Done),
      t1Done:    PATTERNED_SUB_CATS.every(sc => t[sc.title]?.t1Done),
      t2Done:    PATTERNED_SUB_CATS.every(sc => t[sc.title]?.t2Done),
      t3Done:    PATTERNED_SUB_CATS.every(sc => t[sc.title]?.t3Done),
    }
  }

  function getPatternedStats(s) {
    return {
      total:   PATTERNED_SUB_CATS.reduce((n, sc) => n + (s[sc.title]?.total   ?? 0), 0),
      mastered:PATTERNED_SUB_CATS.reduce((n, sc) => n + (s[sc.title]?.mastered ?? 0), 0),
    }
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────
  function openModal(cardDesc) {
    setModalCat(cardDesc)
    setModalSubCat(null)
    setModalView('menu')
    setModalVerbs([])
    setModalVerbProgress({})
    loadModalData(cardDesc)
  }

  function closeModal() {
    setModalCat(null)
    setModalSubCat(null)
    setModalView('menu')
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
      .select('id, verb_id, current_stage, stage2_mastery, stage3_mastery, l4_score, drag_match_score, t1_score, t2_score, t3_score, hidden')
      .eq('user_id', user.id)
      .in('verb_id', verbIds)

    if (progressErr) console.error('[VerbTrainer] loadModalData progress error:', progressErr)

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
        hidden:           p.hidden           ?? false,
      }
    }
    setModalVerbProgress(progMap)
    setModalLoading(false)
  }

  async function handleReset() {
    if (!modalCat || !user || resetting) return
    setResetting(true)
    const target = resetTarget
    const verbIds = modalVerbs
      .filter(v => {
        const prog = modalVerbProgress[v.id]
        const stage   = prog?.stage    ?? 1
        const l4Score = prog?.l4_score ?? 0
        if (target === 1) return true
        if (target === 2) return stage >= 2
        if (target === 3) return stage >= 3
        return stage >= 4 || l4Score > 0
      })
      .map(v => v.id)
    const updates =
      target === 2 ? { current_stage: 2, stage2_mastery: 0, stage3_mastery: 0, l4_score: 0, drag_match_score: 0, t1_score: 0, t2_score: 0, t3_score: 0 }
      : target === 3 ? { current_stage: 3, stage3_mastery: 0, l4_score: 0, drag_match_score: 0, t1_score: 0, t2_score: 0, t3_score: 0 }
      : target === 4 ? { current_stage: 4, l4_score: 0, drag_match_score: 0, t1_score: 0, t2_score: 0, t3_score: 0 }
      : { current_stage: 1, stage2_mastery: 0, stage3_mastery: 0, l4_score: 0, drag_match_score: 0, t1_score: 0, t2_score: 0, t3_score: 0 }
    if (verbIds.length > 0) {
      await supabase
        .from('user_verb_progress')
        .update(updates)
        .eq('user_id', user.id)
        .in('verb_id', verbIds)
    }
    setResetting(false)
    setModalView('menu')
    await Promise.all([loadModalData(modalCat), loadProgress()])
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

  // ── Build home cards ──────────────────────────────────────────────────────
  const patternedTense = getPatternedTense(categoryTense)
  const patternedStats = getPatternedStats(categoryStats)

  const homeCards = [
    {
      id:          1,
      title:       'Verbs -AR',
      isPatterned: false,
      locked:      false,
      unlockMsg:   null,
      t:           categoryTense['Verbs -AR'] ?? {},
      stats:       categoryStats['Verbs -AR'],
    },
    {
      id:          2,
      title:       'Core Verbs',
      isPatterned: false,
      locked:      !categoryTense['Verbs -AR']?.t3Done,
      unlockMsg:   'Complete "Verbs -AR" to unlock',
      t:           categoryTense['Core Verbs'] ?? {},
      stats:       categoryStats['Core Verbs'],
    },
    {
      id:          'patterned-irregulars',
      title:       'Patterned Irregulars',
      isPatterned: true,
      locked:      !categoryTense['Core Verbs']?.t3Done,
      unlockMsg:   'Complete "Core Verbs" to unlock',
      t:           patternedTense,
      stats:       patternedStats,
    },
    {
      id:          9,
      title:       'True Irregulars',
      isPatterned: false,
      locked:      !patternedTense.t3Done,
      unlockMsg:   'Complete all Patterned Irregulars to unlock',
      t:           categoryTense['True Irregulars'] ?? {},
      stats:       categoryStats['True Irregulars'],
    },
  ]

  // ── Render ─────────────────────────────────────────────────────────────────
  const hiddenModalVerbs    = modalVerbs.filter(v => modalVerbProgress[v.id]?.hidden)
  const modalDisplayTitle   = (modalView === 'stage-select' && modalSubCat) ? modalSubCat.title : modalCat?.title
  const showBackBtn         = modalView !== 'menu'

  return (
    <div style={styles.page}>
      <NavBar />

      <main style={styles.main}>
        <div style={styles.heroSpace} />

        <section style={styles.section}>
          <div style={styles.themeGrid}>
            {homeCards.map(card => {
              const complete = !!card.t.t3Done
              return (
                <button
                  key={card.id}
                  style={card.locked ? styles.themeCardLocked : complete ? styles.themeCardComplete : styles.themeCard}
                  onClick={() => openModal(card)}
                >
                  <div style={styles.cardLeft}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                      <span style={{ ...(card.locked ? styles.themeTitleLocked : styles.themeTitle), flex: 1 }}>
                        {card.title}
                      </span>
                      {card.locked ? <LockIcon /> : complete ? <CheckIcon /> : null}
                    </div>
                    {card.stats && (
                      <span style={styles.themeSubtitle}>
                        {card.locked
                          ? `${card.stats.total} verbs`
                          : `${card.stats.total} verbs · ${card.stats.mastered} mastered`}
                      </span>
                    )}
                    <MasteryStrip7
                      l1={!!card.t.allL1Done} l2={!!card.t.allL2Done} l3={!!card.t.allL3Done} l4={!!card.t.allL4Done}
                      t1={!!card.t.t1Done}    t2={!!card.t.t2Done}    t3={!!card.t.t3Done}
                      locked={card.locked}
                    />
                  </div>
                </button>
              )
            })}
          </div>

          <button style={styles.dictBtn} onClick={() => navigate('/verb-dictionary')}>
            <span style={styles.dictBtnIcon}>📖</span>
            <span style={styles.dictBtnLabel}>Verb Dictionary</span>
            <span style={styles.dictBtnSub}>All 70 verbs with conjugations</span>
            <span style={styles.dictBtnChevron}>›</span>
          </button>
        </section>
      </main>

      {/* ── Modal ─────────────────────────────────────────────────────────────── */}
      {modalCat && (
        <div style={mStyles.backdrop} onClick={closeModal}>
          <div style={mStyles.modalBox} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={mStyles.modalHeader}>
              {showBackBtn && (
                <button style={mStyles.backBtn} onClick={handleModalBack}>←</button>
              )}
              <h2 style={mStyles.modalTitle}>{modalDisplayTitle}</h2>
              <button style={mStyles.closeBtn} onClick={closeModal}>✕</button>
            </div>

            {/* ── Menu view ─────────────────────────────────────────────── */}
            {modalView === 'menu' && (
              <div style={mStyles.menuList}>

                {modalCat.locked ? (
                  <div style={mStyles.menuOptionLocked}>
                    <span style={mStyles.menuOptionLabelLocked}>🔒 Start Quiz</span>
                    <span style={mStyles.menuOptionDesc}>{modalCat.unlockMsg}</span>
                  </div>
                ) : (
                  <button
                    style={mStyles.menuOption}
                    onClick={() => setModalView(modalCat.isPatterned ? 'subgroup-select' : 'stage-select')}
                  >
                    <span style={mStyles.menuOptionLabel}>Start Quiz</span>
                    <span style={mStyles.menuOptionDesc}>Practice verbs in this category</span>
                  </button>
                )}

                {!modalCat.locked && (
                  <button
                    style={mStyles.menuOption}
                    onClick={() => {
                      const categoryTitles = modalCat.isPatterned
                        ? PATTERNED_SUB_CATS.map(sc => sc.title)
                        : [modalCat.title]
                      closeModal()
                      navigate('/verb-custom-quiz-select', {
                        state: {
                          verbs: modalVerbs,
                          categoryTitle: modalCat.title,
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
            {modalView === 'progress' && (
              <div style={mStyles.modalBody}>
                {modalLoading
                  ? <p style={mStyles.emptyMsg}>Loading…</p>
                  : modalVerbs.length === 0
                    ? <p style={mStyles.emptyMsg}>No verbs in this category.</p>
                    : modalVerbs.map(v => (
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
                ? `All progress for ${modalCat.title} will be reset to Level One.`
                : `Verbs at Level ${resetTarget} or above in ${modalCat.title} will be reset to ${levelName}.`
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
              const activeCatTitle = modalSubCat ? modalSubCat.title : modalCat.title
              const activeCatId    = modalSubCat ? modalSubCat.id    : modalCat.id
              const t              = categoryTense[activeCatTitle] ?? {}

              // Compute fresh counts from loaded verb progress (filtered to active category)
              const activeVerbIds = modalSubCat
                ? modalVerbs.filter(v => v.category === modalSubCat.title).map(v => v.id)
                : modalVerbs.map(v => v.id)
              const loading       = modalLoading
              const total         = loading ? '…' : activeVerbIds.length
              const masteredCt    = loading ? '…' : activeVerbIds.filter(id => (modalVerbProgress[id]?.l4_score ?? 0) >= 5).length
              const tCount        = key => loading
                ? '…'
                : activeVerbIds.filter(id => (modalVerbProgress[id]?.[`${key}_score`] ?? 0) >= 3).length

              // Compute completion state from freshly loaded modal data so it reflects
              // the current DB state rather than the potentially stale categoryTense snapshot.
              const localAllL4Done = !loading && activeVerbIds.length > 0
                && activeVerbIds.every(id => (modalVerbProgress[id]?.l4_score ?? 0) >= 5)
              const localT1Done = localAllL4Done
                && activeVerbIds.every(id => (modalVerbProgress[id]?.t1_score ?? 0) >= 3)
              const localT2Done = localT1Done
                && activeVerbIds.every(id => (modalVerbProgress[id]?.t2_score ?? 0) >= 3)
              const localT3Done = localT2Done
                && activeVerbIds.every(id => (modalVerbProgress[id]?.t3_score ?? 0) >= 3)

              const STAGES = [
                {
                  key:      'infinitive',
                  name:     'Infinitive',
                  sub:      'L1 → L4',
                  locked:   false,
                  complete: localAllL4Done,
                  progress: `${masteredCt} / ${total} mastered`,
                  color:    '#f5c518',
                },
                {
                  key:      't1',
                  name:     'Present Tense',
                  sub:      'T1',
                  locked:   !localAllL4Done,
                  complete: localT1Done,
                  progress: `${tCount('t1')} / ${total} mastered`,
                  color:    '#3b82f6',
                },
                {
                  key:      't2',
                  name:     'Past Tense',
                  sub:      'T2',
                  locked:   !localT1Done,
                  complete: localT2Done,
                  progress: `${tCount('t2')} / ${total} mastered`,
                  color:    '#f97316',
                },
                {
                  key:      't3',
                  name:     'Future Tense',
                  sub:      'T3',
                  locked:   !localT2Done,
                  complete: localT3Done,
                  progress: `${tCount('t3')} / ${total} mastered`,
                  color:    '#16a34a',
                },
              ]

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
                      onClick={() => { closeModal(); navigate(`/verb-quiz/${activeCatId}`) }}
                    >
                      <div style={mStyles.stageLeft}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: stage.complete ? '#22c55e' : '#f59e0b', flexShrink: 0 }} />
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
                </div>
              )
            })()}

          </div>
        </div>
      )}
    </div>
  )
}

// ── Card styles ───────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f8f8f6',
    fontFamily: 'system-ui, sans-serif',
  },
  main: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '3rem',
  },
  heroSpace: { minHeight: '5rem' },
  section: {},
  themeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '0.75rem',
  },
  themeCard: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 'auto',
    minHeight: '76px',
    padding: 0,
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    cursor: 'pointer',
    textAlign: 'left',
    overflow: 'hidden',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  themeCardLocked: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 'auto',
    minHeight: '76px',
    padding: 0,
    background: '#f7f7f7',
    border: '1px solid #ebebeb',
    borderRadius: '10px',
    cursor: 'pointer',
    textAlign: 'left',
    overflow: 'hidden',
  },
  themeCardComplete: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 'auto',
    minHeight: '76px',
    padding: 0,
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '10px',
    cursor: 'pointer',
    textAlign: 'left',
    overflow: 'hidden',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  cardLeft: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '2px',
    padding: '0.45rem 0.875rem',
    minWidth: 0,
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
  themeTitleLocked: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#bbb',
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
  dictBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    padding: '0.875rem 1rem',
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    cursor: 'pointer',
    textAlign: 'left',
    marginTop: '0.25rem',
  },
  dictBtnIcon:    { fontSize: '1.25rem', flexShrink: 0 },
  dictBtnLabel:   { fontSize: '0.9rem', fontWeight: 600, color: '#111', flexShrink: 0 },
  dictBtnSub:     { fontSize: '0.75rem', color: '#aaa', flex: 1 },
  dictBtnChevron: { fontSize: '1.1rem', color: '#ccc', flexShrink: 0 },
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
