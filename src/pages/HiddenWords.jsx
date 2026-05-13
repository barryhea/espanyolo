import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export default function HiddenWords() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) load()
  }, [user?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('user_word_progress')
      .select('id, word_id, words(english, spanish, theme)')
      .eq('user_id', user.id)
      .eq('hidden', true)
    setRows(data ?? [])
    setLoading(false)
  }

  async function unhide(row) {
    await supabase
      .from('user_word_progress')
      .update({ hidden: false })
      .eq('id', row.id)
    setRows(prev => prev.filter(r => r.id !== row.id))
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.logo}>espanyolo</h1>
      </header>
      <main style={styles.main}>
        <button style={styles.backLink} onClick={() => navigate('/vocabulary')}>← Back to themes</button>
        <h2 style={styles.title}>Hidden Words</h2>

        {loading ? (
          <p style={styles.muted}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={styles.muted}>No hidden words yet.</p>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.thLeft}>Word</th>
                  <th style={styles.thLeft}>Spanish</th>
                  <th style={styles.thLeft}>Theme</th>
                  <th style={styles.thRight}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} style={styles.tableRow}>
                    <td style={styles.tdEn}>{row.words?.english}</td>
                    <td style={styles.tdEs}>{row.words?.spanish}</td>
                    <td style={styles.tdTheme}>{row.words?.theme}</td>
                    <td style={styles.tdAction}>
                      <button
                        style={styles.unhideBtn}
                        onClick={() => unhide(row)}
                        title="Unhide this word"
                      >
                        <EyeIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  header: {
    display: 'flex',
    alignItems: 'center',
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
  main: {
    maxWidth: '780px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  backLink: {
    padding: '0.35rem 0',
    fontSize: '0.875rem',
    color: '#555',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 600,
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
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.9rem',
  },
  thLeft: {
    padding: '0.65rem 1rem',
    textAlign: 'left',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
  },
  thRight: {
    padding: '0.65rem 0.75rem',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '36px',
  },
  tableRow: {
    borderBottom: '1px solid #f5f5f5',
  },
  tdEn: {
    padding: '0.6rem 1rem',
    color: '#333',
  },
  tdEs: {
    padding: '0.6rem 1rem',
    fontWeight: 500,
    color: '#111',
  },
  tdTheme: {
    padding: '0.6rem 1rem',
    color: '#666',
    fontSize: '0.85rem',
  },
  tdAction: {
    padding: '0.6rem 0.75rem',
    textAlign: 'right',
  },
  unhideBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px',
    lineHeight: 0,
    color: '#3b82f6',
    borderRadius: '4px',
  },
}
