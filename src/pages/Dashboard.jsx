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

function EyeSlashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
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

function WordTable({ words, progressMap, onToggleHidden }) {
  if (words.length === 0) {
    return <p style={styles.emptyMsg}>No words to show.</p>
  }
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.thLeft}>Word</th>
            <th style={styles.thLeft}>Spanish</th>
            <th style={styles.thCenter}>S1</th>
            <th style={styles.thCenter}>S2</th>
            <th style={styles.thCenter}>S3</th>
            <th style={styles.thRight}></th>
          </tr>
        </thead>
        <tbody>
          {words.map(word => {
            const prog = progressMap[word.id]
            const stage = prog?.stage ?? 1
            const consec = prog?.consecutive_correct ?? 0
            const isHidden = prog?.hidden ?? false
            return (
              <tr key={word.id} style={styles.tableRow}>
                <td style={styles.tdEn}>{word.english}</td>
                <td style={styles.tdEs}>{word.spanish}</td>
                <StageCell done={stage >= 2} />
                <StageCell done={stage >= 3} />
                <StageCell done={stage === 3 && consec >= 5} />
                <td style={styles.tdHide}>
                  <button
                    style={{ ...styles.hideBtn, color: isHidden ? '#3b82f6' : '#bbb' }}
                    onClick={() => onToggleHidden(word.id)}
                    title={isHidden ? 'Unhide this word' : 'Hide this word'}
                  >
                    {isHidden ? <EyeIcon /> : <EyeSlashIcon />}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [themeProgress, setThemeProgress] = useState({})

  // Modal state
  const [modalTheme, setModalTheme] = useState(null)
  const [modalView, setModalView] = useState('menu')
  const [modalWords, setModalWords] = useState([])
  const [modalProgress, setModalProgress] = useState({})
  const [modalLoading, setModalLoading] = useState(false)

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

  async function openModal(theme) {
    setModalTheme(theme)
    setModalView('menu')
    setModalWords([])
    setModalProgress({})
    setModalLoading(true)

    const { data: words } = await supabase
      .from('words')
      .select('id, english, spanish')
      .eq('theme', theme.title)
      .order('english')

    const wordIds = (words ?? []).map(w => w.id)
    let progress = []
    if (wordIds.length) {
      const { data } = await supabase
        .from('user_word_progress')
        .select('id, word_id, stage, consecutive_correct, hidden')
        .eq('user_id', user.id)
        .in('word_id', wordIds)
      progress = data ?? []
    }

    const progMap = {}
    for (const p of progress) {
      const existing = progMap[p.word_id]
      if (!existing || p.stage > existing.stage ||
          (p.stage === existing.stage && p.consecutive_correct > existing.consecutive_correct)) {
        progMap[p.word_id] = {
          stage: p.stage ?? 1,
          consecutive_correct: p.consecutive_correct ?? 0,
          hidden: p.hidden ?? false,
          db_id: p.id,
        }
      }
    }

    setModalWords(words ?? [])
    setModalProgress(progMap)
    setModalLoading(false)
  }

  function closeModal() {
    setModalTheme(null)
  }

  async function toggleHiddenInModal(wordId) {
    const prog = modalProgress[wordId] ?? { stage: 1, consecutive_correct: 0, hidden: false, db_id: null }
    const willBeHidden = !prog.hidden

    setModalProgress(prev => ({ ...prev, [wordId]: { ...prog, hidden: willBeHidden } }))

    if (prog.db_id) {
      await supabase
        .from('user_word_progress')
        .update({ hidden: willBeHidden })
        .eq('id', prog.db_id)
    } else {
      const { data } = await supabase
        .from('user_word_progress')
        .insert({ user_id: user.id, word_id: wordId, stage: 1, consecutive_correct: 0, hidden: willBeHidden })
        .select('id')
        .single()
      if (data) {
        setModalProgress(prev => ({ ...prev, [wordId]: { ...prev[wordId], db_id: data.id } }))
      }
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const hiddenWords = modalWords.filter(w => modalProgress[w.id]?.hidden)

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
                onClick={() => openModal(theme)}
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

      {modalTheme && (
        <div style={styles.backdrop} onClick={closeModal}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>

            <div style={styles.modalHeader}>
              {modalView !== 'menu' && (
                <button style={styles.modalBackBtn} onClick={() => setModalView('menu')}>←</button>
              )}
              <h2 style={styles.modalTitle}>{modalTheme.title}</h2>
              <button style={styles.closeBtn} onClick={closeModal}>✕</button>
            </div>

            {modalView === 'menu' && (
              <div style={styles.menuList}>
                <button
                  style={styles.menuOption}
                  onClick={() => { closeModal(); navigate(`/quiz/${modalTheme.id}`) }}
                >
                  <span style={styles.menuOptionLabel}>Start Quiz</span>
                  <span style={styles.menuOptionDesc}>Practice words in this theme</span>
                </button>
                <button
                  style={styles.menuOption}
                  onClick={() => setModalView('progress')}
                  disabled={modalLoading}
                >
                  <span style={styles.menuOptionLabel}>
                    Progress {modalLoading && <span style={styles.loadingDot}>…</span>}
                  </span>
                  <span style={styles.menuOptionDesc}>All words and your current stage</span>
                </button>
                <button
                  style={styles.menuOption}
                  onClick={() => setModalView('hidden')}
                  disabled={modalLoading}
                >
                  <span style={styles.menuOptionLabel}>
                    Hidden Words {modalLoading && <span style={styles.loadingDot}>…</span>}
                  </span>
                  <span style={styles.menuOptionDesc}>Words you've excluded from quizzes</span>
                </button>
              </div>
            )}

            {modalView === 'progress' && (
              <div style={styles.modalBody}>
                {modalLoading
                  ? <p style={styles.emptyMsg}>Loading…</p>
                  : <WordTable words={modalWords} progressMap={modalProgress} onToggleHidden={toggleHiddenInModal} />
                }
              </div>
            )}

            {modalView === 'hidden' && (
              <div style={styles.modalBody}>
                {modalLoading
                  ? <p style={styles.emptyMsg}>Loading…</p>
                  : hiddenWords.length === 0
                    ? <p style={styles.emptyMsg}>No hidden words for this theme.</p>
                    : <WordTable words={hiddenWords} progressMap={modalProgress} onToggleHidden={toggleHiddenInModal} />
                }
              </div>
            )}

          </div>
        </div>
      )}
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

  // Modal
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
  modalBackBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1.1rem',
    color: '#555',
    cursor: 'pointer',
    padding: '0 0.25rem',
    lineHeight: 1,
  },
  modalTitle: {
    flex: 1,
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    color: '#111',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1rem',
    color: '#888',
    cursor: 'pointer',
    padding: '0.25rem',
    lineHeight: 1,
    borderRadius: '4px',
  },
  menuList: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0.5rem',
    gap: '0.25rem',
  },
  menuOption: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.2rem',
    padding: '0.875rem 1rem',
    background: 'none',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.12s',
  },
  menuOptionLabel: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#111',
  },
  menuOptionDesc: {
    fontSize: '0.8rem',
    color: '#888',
  },
  loadingDot: {
    fontWeight: 400,
    color: '#aaa',
  },
  modalBody: {
    overflowY: 'auto',
    flex: 1,
  },
  emptyMsg: {
    margin: 0,
    padding: '1.5rem',
    color: '#888',
    fontSize: '0.9rem',
  },

  // Word table (shared by Progress and Hidden views)
  tableWrap: {
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  thLeft: {
    padding: '0.6rem 1rem',
    textAlign: 'left',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    position: 'sticky',
    top: 0,
  },
  thCenter: {
    padding: '0.6rem 0.5rem',
    textAlign: 'center',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '36px',
    position: 'sticky',
    top: 0,
  },
  thRight: {
    padding: '0.6rem 0.75rem',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '36px',
    position: 'sticky',
    top: 0,
  },
  tableRow: {
    borderBottom: '1px solid #f5f5f5',
  },
  tdEn: {
    padding: '0.55rem 1rem',
    color: '#333',
  },
  tdEs: {
    padding: '0.55rem 1rem',
    fontWeight: 500,
    color: '#111',
  },
  stageCell: {
    padding: '0.55rem 0.5rem',
    textAlign: 'center',
  },
  tdHide: {
    padding: '0.55rem 0.75rem',
    textAlign: 'right',
  },
  hideBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px',
    lineHeight: 0,
    borderRadius: '4px',
    transition: 'color 0.15s',
  },
}
