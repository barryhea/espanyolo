import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { VERB_CATEGORIES } from '../utils/courseData'
import NavBar from '../components/NavBar'
import VerbCategoryModal from './VerbCategoryModal'

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

function MasteryStrip7({ l1, l2, l3, l4, t1, t2, t3, t1Started, t2Started, t3Started, locked }) {
  // A tense segment is green when mastered (done), orange only when it has real
  // stored progress (started but not done), and grey when untouched. "Started"
  // is derived from the actual stage values (t{n}_cj_stage / t{n}_score), so a
  // tense with no conjugation work shows grey rather than an "up next" orange.
  const tenseSegs = [
    { label: 'Inf.',  ...segColors(!!l4,       !locked && !l4)                },
    { label: 'Pres.', ...segColors(!!t1,       !locked && !t1 && !!t1Started) },
    { label: 'Past',  ...segColors(!!t2,       !locked && !t2 && !!t2Started) },
    { label: 'Fut.',  ...segColors(!!t3,       !locked && !t3 && !!t3Started) },
  ]
  // L bars always reflect the actual L-stage completion from the DB
  // (allL1Done/allL2Done/allL3Done/allL4Done, derived from current_stage and l4_score).
  // The tense segs above already show tense progress separately.
  const lSegs = [
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

// ── Main component ─────────────────────────────────────────────────────────────
export default function VerbTrainer() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [categoryStats, setCategoryStats] = useState({})
  const [categoryTense, setCategoryTense] = useState({})
  const [activeCard,    setActiveCard]    = useState(null)

  const location = useLocation()

  useEffect(() => {
    if (user) loadProgress()
  }, [user?.id, location.key])

  async function loadProgress() {
    const [{ data: allVerbs, error: verbsErr }, { data: progressRows, error: progressErr }] = await Promise.all([
      supabase.from('verbs').select('id, category'),
      supabase
        .from('user_verb_progress')
        .select('verb_id, current_stage, l4_score, t1_score, t2_score, t3_score, t1_cj_stage, t2_cj_stage, t3_cj_stage, hidden')
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
        stage:       p.current_stage ?? 1,
        l4_score:    p.l4_score      ?? 0,
        t1_score:    p.t1_score      ?? 0,
        t2_score:    p.t2_score      ?? 0,
        t3_score:    p.t3_score      ?? 0,
        t1_cj_stage: p.t1_cj_stage  ?? 0,
        t2_cj_stage: p.t2_cj_stage  ?? 0,
        t3_cj_stage: p.t3_cj_stage  ?? 0,
        hidden:      p.hidden        ?? false,
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

      // Exclude hidden verbs from all completion checks — they should not block progress.
      const visibleIds = verbIds.filter(id => !(progByVerb[id]?.hidden ?? false))
      const any       = visibleIds.length > 0
      const allL1Done = any && visibleIds.every(id => (progByVerb[id]?.stage    ?? 1) >= 2)
      const allL2Done = any && visibleIds.every(id => (progByVerb[id]?.stage    ?? 1) >= 3)
      const allL3Done = any && visibleIds.every(id => (progByVerb[id]?.stage    ?? 1) >= 4)
      const allL4Done = any && visibleIds.every(id => (progByVerb[id]?.l4_score ?? 0) >= 5)
      // Verbs -AR uses a 4-sub-stage conjugation flow tracked by t{n}_cj_stage (0–4).
      // t{n}_score resets to 0 on every sub-stage boundary so it cannot reliably
      // indicate completion for this category. All other categories use t{n}_score >= 3.
      const isAR = cat.title === 'Verbs -AR'
      const t1Done = allL4Done && visibleIds.every(id => isAR
        ? (progByVerb[id]?.t1_cj_stage ?? 0) >= 4
        : (progByVerb[id]?.t1_score    ?? 0) >= 3
      )
      const t2Done = t1Done && visibleIds.every(id => isAR
        ? (progByVerb[id]?.t2_cj_stage ?? 0) >= 4
        : (progByVerb[id]?.t2_score    ?? 0) >= 3
      )
      const t3Done = t2Done && visibleIds.every(id => isAR
        ? (progByVerb[id]?.t3_cj_stage ?? 0) >= 4
        : (progByVerb[id]?.t3_score    ?? 0) >= 3
      )
      // "Started" = the tense has genuine stored progress on at least one visible
      // verb. For -AR that means an advanced sub-stage (t{n}_cj_stage >= 1) or any
      // score within the first sub-stage; other categories use t{n}_score. A tense
      // with no work done stays false → its card segment renders grey, not orange.
      const tStarted = (cjKey, scoreKey) => any && visibleIds.some(id => isAR
        ? ((progByVerb[id]?.[cjKey] ?? 0) >= 1 || (progByVerb[id]?.[scoreKey] ?? 0) >= 1)
        : (progByVerb[id]?.[scoreKey] ?? 0) >= 1
      )
      const t1Started = tStarted('t1_cj_stage', 't1_score')
      const t2Started = tStarted('t2_cj_stage', 't2_score')
      const t3Started = tStarted('t3_cj_stage', 't3_score')
      tense[cat.title] = { allL1Done, allL2Done, allL3Done, allL4Done, t1Done, t2Done, t3Done, t1Started, t2Started, t3Started }
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
      t1Started: PATTERNED_SUB_CATS.some(sc => t[sc.title]?.t1Started),
      t2Started: PATTERNED_SUB_CATS.some(sc => t[sc.title]?.t2Started),
      t3Started: PATTERNED_SUB_CATS.some(sc => t[sc.title]?.t3Started),
    }
  }

  function getPatternedStats(s) {
    return {
      total:   PATTERNED_SUB_CATS.reduce((n, sc) => n + (s[sc.title]?.total   ?? 0), 0),
      mastered:PATTERNED_SUB_CATS.reduce((n, sc) => n + (s[sc.title]?.mastered ?? 0), 0),
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
                  onClick={() => setActiveCard(card)}
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
                      t1Started={!!card.t.t1Started} t2Started={!!card.t.t2Started} t3Started={!!card.t.t3Started}
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

      <VerbCategoryModal
        card={activeCard}
        onClose={() => setActiveCard(null)}
        user={user}
        navigate={navigate}
        categoryTense={categoryTense}
        categoryStats={categoryStats}
        onProgressChange={loadProgress}
      />
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
