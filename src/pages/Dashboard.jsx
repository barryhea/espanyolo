import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { VOCAB_THEMES } from '../utils/courseData'

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
    <svg viewBox="0 0 36 36" style={{ width: '100%', height: 'auto', display: 'block' }}>
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

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [themeProgress, setThemeProgress] = useState({})

  useEffect(() => {
    if (user) loadProgress()
  }, [user?.id])

  async function loadProgress() {
    const [{ data: allWords }, { data: mastered }] = await Promise.all([
      supabase.from('words').select('theme'),
      supabase
        .from('user_word_progress')
        .select('words(theme)')
        .eq('user_id', user.id)
        .eq('stage', 3),
    ])

    const totals = {}
    for (const w of allWords ?? []) {
      totals[w.theme] = (totals[w.theme] || 0) + 1
    }

    const masteredByTheme = {}
    for (const p of mastered ?? []) {
      const t = p.words?.theme
      if (t) masteredByTheme[t] = (masteredByTheme[t] || 0) + 1
    }

    const progress = {}
    for (const theme of VOCAB_THEMES) {
      const total = totals[theme.title] || 0
      const done = masteredByTheme[theme.title] || 0
      progress[theme.title] = total > 0 ? Math.round((done / total) * 100) : 0
    }

    setThemeProgress(progress)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.logo}>espanyolo</h1>
        <div style={styles.headerRight}>
          <span style={styles.email}>{user?.email}</span>
          <button style={styles.signOutBtn} onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <main style={styles.main}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>← Back</button>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Vocabulary Trainer</h2>
          <p style={styles.sectionSubtitle}>Choose a theme to practise</p>
          <div style={styles.themeGrid}>
            {VOCAB_THEMES.map((theme) => (
              <button
                key={theme.id}
                style={styles.themeCard}
                onClick={() => navigate(`/quiz/${theme.id}`)}
              >
                <div style={styles.cardLeft}>
                  <span style={styles.themeTitle}>{theme.title}</span>
                </div>
                <div style={styles.cardDivider} />
                <div style={styles.cardRight}>
                  <ProgressRing pct={themeProgress[theme.title] ?? 0} />
                </div>
              </button>
            ))}
          </div>
          <div style={styles.hiddenWordsBtnWrap}>
            <button style={styles.hiddenWordsBtn} onClick={() => navigate('/hidden')}>
              Hidden words
            </button>
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
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 2rem',
    borderBottom: '1px solid #e5e5e5',
    backgroundColor: '#fff',
  },
  logo: {
    margin: 0,
    fontSize: '1.4rem',
    fontWeight: 700,
    letterSpacing: '-0.5px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  email: {
    fontSize: '0.85rem',
    color: '#666',
  },
  signOutBtn: {
    padding: '0.35rem 0.85rem',
    fontSize: '0.85rem',
    border: '1px solid #ccc',
    borderRadius: '6px',
    background: '#fff',
    cursor: 'pointer',
  },
  main: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '3rem',
  },
  section: {},
  sectionTitle: {
    margin: '0 0 0.25rem',
    fontSize: '1.25rem',
    fontWeight: 600,
  },
  sectionSubtitle: {
    margin: '0 0 1.25rem',
    fontSize: '0.9rem',
    color: '#666',
  },
  backBtn: {
    marginBottom: '1.5rem',
    padding: '0.35rem 0',
    fontSize: '0.875rem',
    color: '#555',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
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
    flex: '2',
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem 0.875rem',
  },
  cardDivider: {
    width: '1px',
    flexShrink: 0,
    backgroundColor: '#f0f0f0',
  },
  cardRight: {
    flex: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px',
  },
  themeTitle: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#111',
    lineHeight: 1.3,
  },
  hiddenWordsBtnWrap: {
    marginTop: '1.5rem',
    display: 'flex',
    justifyContent: 'center',
  },
  hiddenWordsBtn: {
    padding: '0.4rem 1rem',
    fontSize: '0.8rem',
    color: '#888',
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: '20px',
    cursor: 'pointer',
  },
}
