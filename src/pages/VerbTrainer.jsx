import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { VERB_CATEGORIES } from '../utils/courseData'
import NavBar from '../components/NavBar'

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

function LockIcon() {
  return (
    <svg
      width="20" height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ccc"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

// State: 'locked' | 'active' | 'done'
function TenseRow({ t1, t2, t3 }) {
  const INDIGO = '#6366f1'
  const entries = [
    { label: 'Present', state: t1 },
    { label: 'Past',    state: t2 },
    { label: 'Future',  state: t3 },
  ]
  return (
    <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
      {entries.map(({ label, state }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{
            width: '20px',
            height: '4px',
            borderRadius: '2px',
            backgroundColor: state === 'done' ? INDIGO : '#e5e7eb',
            outline: state === 'active' ? `1.5px solid ${INDIGO}` : 'none',
            boxSizing: 'border-box',
          }} />
          <span style={{
            fontSize: '0.52rem',
            fontWeight: 600,
            color: state === 'locked' ? '#d1d5db' : INDIGO,
            lineHeight: 1,
          }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

export default function VerbTrainer() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [categoryProgress, setCategoryProgress] = useState({})
  const [categoryStats, setCategoryStats]       = useState({})
  const [categoryTense, setCategoryTense]       = useState({})

  useEffect(() => {
    if (user) loadProgress()
  }, [user?.id])

  async function loadProgress() {
    const [{ data: allVerbs }, { data: progressRows }] = await Promise.all([
      supabase.from('verbs').select('id, category'),
      supabase
        .from('user_verb_progress')
        .select('verb_id, current_stage, l4_score, t1_score, t2_score, t3_score')
        .eq('user_id', user.id),
    ])

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

    // Stage-weighted %: S2=1/4, S3=2/4, S4=3/4, mastered(l4≥5)=4/4
    const progress = {}
    const stats    = {}
    const tense    = {}

    for (const cat of VERB_CATEGORIES) {
      const verbIds = verbsByCategory[cat.title] ?? []
      let pts = 0, maxPts = 0, masteredCt = 0

      for (const id of verbIds) {
        const prog = progByVerb[id]
        const stage   = prog?.stage    ?? 1
        const l4Score = prog?.l4_score ?? 0
        maxPts += 4
        if (l4Score >= 5)  { pts += 4; masteredCt++ }
        else if (stage >= 4) pts += 3
        else if (stage >= 3) pts += 2
        else if (stage >= 2) pts += 1
      }

      progress[cat.title] = maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0
      stats[cat.title]    = { total: verbIds.length, mastered: masteredCt }

      const allL4Done = verbIds.length > 0 && verbIds.every(id => (progByVerb[id]?.l4_score ?? 0) >= 5)
      const t1Done    = allL4Done && verbIds.every(id => (progByVerb[id]?.t1_score ?? 0) >= 3)
      const t2Done    = t1Done    && verbIds.every(id => (progByVerb[id]?.t2_score ?? 0) >= 3)
      const t3Done    = t2Done    && verbIds.every(id => (progByVerb[id]?.t3_score ?? 0) >= 3)
      tense[cat.title] = { allL4Done, t1Done, t2Done, t3Done }
    }

    setCategoryProgress(progress)
    setCategoryStats(stats)
    setCategoryTense(tense)
  }

  return (
    <div style={styles.page}>
      <NavBar />

      <main style={styles.main}>
        <div style={styles.heroSpace} />

        <section style={styles.section}>
          <div style={styles.themeGrid}>
            {VERB_CATEGORIES.map((cat, idx) => {
              const prevPct  = idx > 0 ? (categoryProgress[VERB_CATEGORIES[idx - 1].title] ?? 0) : 100
              const locked   = prevPct < 100
              const pct      = categoryProgress[cat.title] ?? 0
              const stats    = categoryStats[cat.title]
              const t        = categoryTense[cat.title] ?? { allL4Done: false, t1Done: false, t2Done: false, t3Done: false }

              // Tense rect states — each stage locked until its prerequisite is met
              const t1State = locked || !t.allL4Done ? 'locked' : t.t1Done ? 'done' : 'active'
              const t2State = locked || !t.t1Done    ? 'locked' : t.t2Done ? 'done' : 'active'
              const t3State = locked || !t.t2Done    ? 'locked' : t.t3Done ? 'done' : 'active'

              return (
                <button
                  key={cat.id}
                  style={locked ? styles.themeCardLocked : styles.themeCard}
                  onClick={locked ? undefined : () => navigate(`/verb-quiz/${cat.id}`)}
                >
                  <div style={styles.cardLeft}>
                    <span style={locked ? styles.themeTitleLocked : styles.themeTitle}>
                      {cat.title}
                    </span>
                    {stats && (
                      <span style={styles.themeSubtitle}>
                        {locked
                          ? `${stats.total} verbs`
                          : `${stats.total} verbs · ${stats.mastered} mastered`}
                      </span>
                    )}
                    <TenseRow t1={t1State} t2={t2State} t3={t3State} />
                  </div>
                  <div style={styles.cardDivider} />
                  <div style={styles.cardRight}>
                    {locked ? <LockIcon /> : <ProgressRing pct={pct} />}
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
    </div>
  )
}

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
    cursor: 'default',
    textAlign: 'left',
    overflow: 'hidden',
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
  cardDivider: {
    width: '1px',
    flexShrink: 0,
    backgroundColor: '#f0f0f0',
  },
  cardRight: {
    width: '56px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px 0 0',
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
