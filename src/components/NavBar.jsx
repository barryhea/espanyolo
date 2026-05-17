import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'

export default function NavBar({ rightContent }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const vocabActive = location.pathname === '/vocabulary' ||
    location.pathname === '/hidden' ||
    location.pathname === '/polish' ||
    location.pathname === '/custom-quiz' ||
    location.pathname.startsWith('/quiz/')

  const verbActive = location.pathname === '/verbs'
  const dictActive = location.pathname === '/dictionary'

  return (
    <>
      <header style={styles.header}>
        <button style={styles.hamburgerBtn} onClick={() => setOpen(true)} aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span style={styles.logo}>espanyolo</span>
        <div style={styles.right}>{rightContent ?? null}</div>
      </header>

      <div
        style={{ ...styles.panelWrap, pointerEvents: open ? 'all' : 'none' }}
        onClick={() => setOpen(false)}
      >
        <div style={{ ...styles.backdrop, opacity: open ? 1 : 0 }} />
        <nav
          style={{ ...styles.panel, transform: open ? 'translateX(0)' : 'translateX(-100%)' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={styles.panelTop}>
            <span style={styles.panelLogo}>espanyolo</span>
            <button style={styles.panelClose} onClick={() => setOpen(false)}>✕</button>
          </div>
          <button
            style={{ ...styles.navItem, ...(vocabActive ? styles.navItemActive : {}) }}
            onClick={() => { setOpen(false); navigate('/vocabulary') }}
          >
            Vocabulary Trainer
          </button>
          <button
            style={{ ...styles.navItem, ...(verbActive ? styles.navItemActive : {}) }}
            onClick={() => { setOpen(false); navigate('/verbs') }}
          >
            Verb Trainer
          </button>
          <button
            style={{ ...styles.navItem, ...(dictActive ? styles.navItemActive : {}) }}
            onClick={() => { setOpen(false); navigate('/dictionary') }}
          >
            Dictionary
          </button>
          <div style={styles.navDivider} />
          <button style={{ ...styles.navItem, color: '#666' }} onClick={handleSignOut}>
            Sign Out
          </button>
        </nav>
      </div>
    </>
  )
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    height: '56px',
    padding: '0 1rem',
    borderBottom: '1px solid #e5e5e5',
    backgroundColor: '#fff',
    position: 'relative',
    flexShrink: 0,
  },
  hamburgerBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0.5rem',
    color: '#333',
    display: 'flex',
    alignItems: 'center',
    borderRadius: '6px',
    flexShrink: 0,
  },
  logo: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '1.3rem',
    fontWeight: 700,
    letterSpacing: '-0.5px',
    pointerEvents: 'none',
    userSelect: 'none',
    color: '#111',
  },
  right: {
    marginLeft: 'auto',
    flexShrink: 0,
  },
  panelWrap: {
    position: 'fixed',
    inset: 0,
    zIndex: 500,
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    transition: 'opacity 0.25s',
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '260px',
    backgroundColor: '#fff',
    boxShadow: '4px 0 20px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.25s ease',
  },
  panelTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.25rem',
    borderBottom: '1px solid #f0f0f0',
  },
  panelLogo: {
    fontSize: '1.1rem',
    fontWeight: 700,
    letterSpacing: '-0.5px',
    color: '#111',
  },
  panelClose: {
    background: 'none',
    border: 'none',
    fontSize: '1rem',
    color: '#888',
    cursor: 'pointer',
    padding: '0.25rem',
    borderRadius: '4px',
  },
  navItem: {
    display: 'block',
    width: '100%',
    padding: '0.875rem 1.25rem',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    fontSize: '0.95rem',
    fontWeight: 500,
    color: '#333',
    cursor: 'pointer',
  },
  navItemActive: {
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    fontWeight: 600,
  },
  navDivider: {
    height: '1px',
    backgroundColor: '#f0f0f0',
    margin: '0.25rem 0',
  },
}
