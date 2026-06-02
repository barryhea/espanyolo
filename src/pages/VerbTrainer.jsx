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

export default function VerbTrainer() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [categoryProgress, setCategoryProgress] = useState({})
  const [categoryStats, setCategoryStats] = useState({})

  useEffect(() => {
    if (user) loadProgress()
  }, [user?.id])

  async function loadProgress() {
    const [{ data: allVerbs }, { data: progressRows }] = await Promise.all([
      supabase.from('verbs').select('id, category'),
      supabase
        .from('user_verb_progress')
        .select('verb_id, stage, consecutive_correct, mastered')
        .eq('user_id', user.id),
    ])

    const verbsByCategory = {}
    for (const v of allVerbs ?? []) {
      if (!verbsByCategory[v.category]) verbsByCategory[v.category] = []
      verbsByCategory[v.category].push(v.id)
    }

    const progByVerb = {}
    for (const p of progressRows ?? []) {
      const ex = progByVerb[p.verb_id]
      if (!ex || (p.stage ?? 1) > (ex.stage ?? 1) ||
          ((p.stage ?? 1) === (ex.stage ?? 1) && p.mastered && !ex.mastered)) {
        progByVerb[p.verb_id] = {
          stage: p.stage ?? 1,
          consecutive_correct: p.consecutive_correct ?? 0,
          mastered: p.mastered ?? false,
        }
      }
    }

    // Stage-weighted %: S2=1/4, S3=2/4, S4=3/4, mastered=4/4
    const progress = {}
    const stats = {}
    for (const cat of VERB_CATEGORIES) {
      const verbIds = verbsByCategory[cat.title] ?? []
      let pts = 0, maxPts = 0, masteredCt = 0
      for (const verbId of verbIds) {
        const prog = progByVerb[verbId]
        maxPts += 4
        const isMastered = prog?.mastered || ((prog?.stage ?? 1) === 4 && (prog?.consecutive_correct ?? 0) >= 5)
        if (isMastered) { pts += 4; masteredCt++ }
        else if ((prog?.stage ?? 1) >= 4) pts += 3
        else if ((prog?.stage ?? 1) >= 3) pts += 2
        else if ((prog?.stage ?? 1) >= 2) pts += 1
      }
      progress[cat.title] = maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0
      stats[cat.title] = { total: verbIds.length, mastered: masteredCt }
    }

    setCategoryProgress(progress)
    setCategoryStats(stats)
  }

  return (
    <div style={styles.page}>
      <NavBar />

      <main style={styles.main}>
        <div style={styles.heroSpace} />

        <section style={styles.section}>
          <div style={styles.themeGrid}>
            {VERB_CATEGORIES.map((cat, idx) => {
              const prevPct = idx > 0
                ? (categoryProgress[VERB_CATEGORIES[idx - 1].title] ?? 0)
                : 100
              const locked = prevPct < 100
              const pct = categoryProgress[cat.title] ?? 0
              const stats = categoryStats[cat.title]

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
                  </div>
                  <div style={styles.cardDivider} />
                  <div style={styles.cardRight}>
                    {locked
                      ? <LockIcon />
                      : <ProgressRing pct={pct} />}
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
  heroSpace: {
    minHeight: '5rem',
  },
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
    height: '72px',
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
    height: '72px',
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
  dictBtnIcon: {
    fontSize: '1.25rem',
    flexShrink: 0,
  },
  dictBtnLabel: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#111',
    flexShrink: 0,
  },
  dictBtnSub: {
    fontSize: '0.75rem',
    color: '#aaa',
    flex: 1,
  },
  dictBtnChevron: {
    fontSize: '1.1rem',
    color: '#ccc',
    flexShrink: 0,
  },
}
