import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import NavBar from '../components/NavBar'

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

function StageCell({ done, isHidden }) {
  if (isHidden) return <td style={styles.stageCell}><span style={{ color: '#d1d5db' }}>—</span></td>
  return (
    <td style={styles.stageCell}>
      <span style={{ color: done ? '#16a34a' : '#d1d5db', fontWeight: 700 }}>{done ? '✓' : '✗'}</span>
    </td>
  )
}

export default function Dictionary() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const searchRef = useRef(null)

  const [words, setWords] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  useEffect(() => {
    if (user) load()
  }, [user?.id])

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: wordData }, { data: progressData }] = await Promise.all([
      supabase.from('words').select('id, english, spanish, theme').order('english'),
      supabase.from('user_word_progress')
        .select('id, word_id, stage, consecutive_correct, mastered, hidden')
        .eq('user_id', user.id),
    ])

    const progMap = {}
    for (const p of progressData ?? []) {
      const ex = progMap[p.word_id]
      if (!ex || p.stage > ex.stage || (p.stage === ex.stage && p.consecutive_correct > ex.consecutive_correct)) {
        progMap[p.word_id] = {
          stage: p.stage ?? 1,
          consecutive_correct: p.consecutive_correct ?? 0,
          mastered: p.mastered ?? false,
          hidden: p.hidden ?? false,
          db_id: p.id,
        }
      }
    }

    const seen = new Set()
    const deduped = (wordData ?? []).filter(w => {
      const key = `${w.english.toLowerCase()}|${w.spanish.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    setWords(deduped)
    setProgress(progMap)
    setLoading(false)
  }

  async function toggleHidden(wordId) {
    const prog = progress[wordId] ?? { stage: 1, consecutive_correct: 0, hidden: false, mastered: false, db_id: null }
    const willBeHidden = !prog.hidden
    setProgress(prev => ({ ...prev, [wordId]: { ...prog, hidden: willBeHidden } }))
    if (prog.db_id) {
      await supabase.from('user_word_progress').update({ hidden: willBeHidden }).eq('id', prog.db_id)
    } else {
      const { data } = await supabase
        .from('user_word_progress')
        .insert({ user_id: user.id, word_id: wordId, stage: 1, consecutive_correct: 0, hidden: willBeHidden, mastered: false })
        .select('id').single()
      if (data) setProgress(prev => ({ ...prev, [wordId]: { ...prev[wordId], db_id: data.id } }))
    }
  }

  const q = query.trim().toLowerCase()
  const filtered = q
    ? words.filter(w => w.english.toLowerCase().includes(q) || w.spanish.toLowerCase().includes(q))
    : words

  const suggestions = q
    ? words
        .filter(w => w.english.toLowerCase().startsWith(q) || w.spanish.toLowerCase().startsWith(q))
        .concat(
          words.filter(w =>
            !w.english.toLowerCase().startsWith(q) && !w.spanish.toLowerCase().startsWith(q) &&
            (w.english.toLowerCase().includes(q) || w.spanish.toLowerCase().includes(q))
          )
        )
        .slice(0, 8)
    : []

  const totalWords = words.length
  const masteredCount = words.filter(w => progress[w.id]?.mastered).length
  const hiddenCount = words.filter(w => progress[w.id]?.hidden).length
  const remainingCount = totalWords - masteredCount - hiddenCount

  return (
    <div style={styles.page}>
      <NavBar />
      <main style={styles.main}>
        {!loading && (
          <div style={styles.statsBar}>
            <span style={styles.statsTitle}>All Themes</span>
            <span style={styles.statsSubtitle}>
              {totalWords} words · {masteredCount} mastered · {hiddenCount} hidden · {remainingCount} remaining
            </span>
          </div>
        )}
        <div style={styles.searchWrap}>
          <div style={styles.searchBox}>
            <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              style={styles.searchInput}
              type="text"
              placeholder="Search English or Spanish…"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowSuggestions(true) }}
              onFocus={() => query && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); setShowSuggestions(false) } }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            {query && (
              <button style={styles.clearBtn} onMouseDown={() => { setQuery(''); searchRef.current?.focus() }}>✕</button>
            )}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div style={styles.suggestions}>
              {suggestions.map(w => (
                <button
                  key={w.id}
                  style={styles.suggestion}
                  onMouseDown={() => { setQuery(w.english); setShowSuggestions(false) }}
                >
                  <span style={styles.suggestionEn}>{w.english}</span>
                  <span style={styles.suggestionEs}>{w.spanish}</span>
                  <span style={styles.suggestionTheme}>{w.theme}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <p style={styles.muted}>Loading…</p>
        ) : (
          <>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.thLeft, textAlign: 'center' }}>English</th>
                    <th style={{ ...styles.thLeft, textAlign: 'center' }}>Spanish</th>
                    <th style={styles.thCenter}>🥉</th>
                    <th style={styles.thCenter}>🥈</th>
                    <th style={styles.thCenter}>🥇</th>
                    <th style={styles.thRight}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(word => {
                    const prog = progress[word.id]
                    const stage = prog?.stage ?? 1
                    const consec = prog?.consecutive_correct ?? 0
                    const isHidden = prog?.hidden ?? false
                    const isMastered = prog?.mastered || (stage === 3 && consec >= 5)
                    return (
                      <tr key={word.id} style={styles.tableRow}>
                        <td style={styles.tdEn}>{word.english}</td>
                        <td style={styles.tdEs}>{word.spanish}</td>
                        <StageCell done={stage >= 2 || isMastered} isHidden={isHidden} />
                        <StageCell done={stage >= 3 || isMastered} isHidden={isHidden} />
                        <StageCell done={isMastered} isHidden={isHidden} />
                        <td style={styles.tdHide}>
                          <button
                            style={{ ...styles.hideBtn, color: isHidden ? '#3b82f6' : '#bbb' }}
                            onClick={() => toggleHidden(word.id)}
                            title={isHidden ? 'Unhide' : 'Hide'}
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
          </>
        )}
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
    padding: '1.5rem 1.5rem 3rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  statsBar: {
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    padding: '0.5rem 0.875rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  statsTitle: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#111',
  },
  statsSubtitle: {
    fontSize: '0.68rem',
    color: '#bbb',
  },
  searchWrap: {
    position: 'sticky',
    top: '56px',
    zIndex: 100,
    backgroundColor: '#f8f8f6',
    paddingBottom: '0.5rem',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    padding: '0 0.875rem',
    gap: '0.5rem',
  },
  searchIcon: {
    color: '#aaa',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    padding: '0.75rem 0',
    fontSize: '1rem',
    border: 'none',
    outline: 'none',
    background: 'none',
    color: '#111',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#aaa',
    fontSize: '0.85rem',
    padding: '0.25rem',
    lineHeight: 1,
    flexShrink: 0,
  },
  suggestions: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
    zIndex: 50,
    overflow: 'hidden',
  },
  suggestion: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.6rem',
    width: '100%',
    padding: '0.65rem 1rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    borderBottom: '1px solid #f5f5f5',
  },
  suggestionEn: {
    fontSize: '0.9rem',
    fontWeight: 500,
    color: '#111',
    flexShrink: 0,
  },
  suggestionEs: {
    fontSize: '0.85rem',
    color: '#666',
    flexShrink: 0,
  },
  suggestionTheme: {
    fontSize: '0.72rem',
    color: '#bbb',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  count: {
    margin: 0,
    fontSize: '0.78rem',
    color: '#aaa',
  },
  muted: {
    margin: 0,
    color: '#888',
    fontSize: '0.9rem',
  },
  tableWrap: {
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    overflow: 'clip',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
    tableLayout: 'fixed',
  },
  thLeft: {
    padding: '0.6rem 0.75rem',
    textAlign: 'left',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    position: 'sticky',
    top: '114px',
    zIndex: 10,
  },
  thTheme: {
    padding: '0.6rem 0.5rem',
    textAlign: 'left',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '90px',
  },
  thCenter: {
    padding: '0.5rem 0.25rem',
    textAlign: 'center',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '28px',
    position: 'sticky',
    top: '114px',
    zIndex: 10,
  },
  thRight: {
    padding: '0.6rem 0.5rem',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '36px',
    position: 'sticky',
    top: '114px',
    zIndex: 10,
  },
  tableRow: {
    borderBottom: '1px solid #f5f5f5',
  },
  tdEn: {
    padding: '0.55rem 0.75rem',
    color: '#333',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tdEs: {
    padding: '0.55rem 0.75rem',
    fontWeight: 500,
    color: '#111',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tdTheme: {
    padding: '0.55rem 0.5rem',
    color: '#aaa',
    fontSize: '0.75rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stageCell: {
    padding: '0.55rem 0.25rem',
    textAlign: 'center',
  },
  tdHide: {
    padding: '0.55rem 0.5rem',
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
