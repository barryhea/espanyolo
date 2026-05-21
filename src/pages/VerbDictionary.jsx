import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import NavBar from '../components/NavBar'

function familyLabel(f) {
  if (f === 'regular-ar') return 'Regular -AR'
  if (f === 'regular-er') return 'Regular -ER'
  if (f === 'regular-ir') return 'Regular -IR'
  return 'Irregular'
}

function familyColors(f) {
  if (f === 'regular-ar') return { bg: '#dcfce7', color: '#15803d', border: '#86efac' }
  if (f === 'regular-er') return { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' }
  if (f === 'regular-ir') return { bg: '#ede9fe', color: '#7c3aed', border: '#c4b5fd' }
  return { bg: '#ffedd5', color: '#c2410c', border: '#fdba74' }
}

export default function VerbDictionary() {
  const navigate = useNavigate()
  const searchRef = useRef(null)

  const [verbs, setVerbs] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    supabase
      .from('verbs')
      .select('id, spanish_infinitive, english, verb_family')
      .order('spanish_infinitive')
      .then(({ data }) => { setVerbs(data ?? []); setLoading(false) })
    searchRef.current?.focus()
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? verbs.filter(v =>
        v.spanish_infinitive.toLowerCase().includes(q) ||
        v.english.toLowerCase().includes(q)
      )
    : verbs

  return (
    <div style={styles.page}>
      <NavBar />
      <main style={styles.main}>
        <div style={styles.statsBar}>
          <span style={styles.statsTitle}>Verb Dictionary</span>
          <span style={styles.statsSubtitle}>{verbs.length} verbs</span>
        </div>

        <div style={styles.searchWrap}>
          <div style={styles.searchBox}>
            <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              style={styles.searchInput}
              type="text"
              placeholder="Search Spanish or English…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            {query && (
              <button style={styles.clearBtn} onMouseDown={() => { setQuery(''); searchRef.current?.focus() }}>✕</button>
            )}
          </div>
        </div>

        {loading ? (
          <p style={styles.muted}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={styles.muted}>No verbs match "{query}"</p>
        ) : (
          <div style={styles.listWrap}>
            {filtered.map(verb => {
              const fc = familyColors(verb.verb_family)
              return (
                <button
                  key={verb.id}
                  style={styles.verbRow}
                  onClick={() => navigate(`/verb-dictionary/${verb.id}`)}
                >
                  <div style={styles.verbNames}>
                    <span style={styles.spanish}>{verb.spanish_infinitive}</span>
                    <span style={styles.english}>{verb.english}</span>
                  </div>
                  <span style={{ ...styles.familyBadge, backgroundColor: fc.bg, color: fc.color, borderColor: fc.border }}>
                    {familyLabel(verb.verb_family)}
                  </span>
                  <span style={styles.chevron}>›</span>
                </button>
              )
            })}
          </div>
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
    maxWidth: '720px',
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
    paddingBottom: '0.25rem',
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
  muted: {
    margin: 0,
    color: '#888',
    fontSize: '0.9rem',
  },
  listWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  verbRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid #f5f5f5',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  },
  verbNames: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: 0,
  },
  spanish: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#111',
  },
  english: {
    fontSize: '0.78rem',
    color: '#888',
  },
  familyBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: '20px',
    border: '1px solid',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  chevron: {
    fontSize: '1.1rem',
    color: '#ccc',
    flexShrink: 0,
  },
}
