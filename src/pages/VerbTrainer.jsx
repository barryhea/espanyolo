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
            {VERB_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                style={styles.themeCard}
                onClick={() => navigate(`/verb-quiz/${cat.id}`)}
              >
                <div style={styles.cardLeft}>
                  <span style={styles.themeTitle}>{cat.title}</span>
                  {categoryStats[cat.title] && (
                    <span style={styles.themeSubtitle}>
                      {categoryStats[cat.title].total} verbs · {categoryStats[cat.title].mastered} mastered
                    </span>
                  )}
                </div>
                <div style={styles.cardDivider} />
                <div style={styles.cardRight}>
                  <ProgressRing pct={categoryProgress[cat.title] ?? 0} />
                </div>
              </button>
            ))}
          </div>
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
}
