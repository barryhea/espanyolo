import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import {
  fetchVocabQuestionCount,
  saveVocabQuestionCount,
  clampQuestionCount,
  DEFAULT_VOCAB_QUESTION_COUNT,
} from '../utils/userSettings'

function CogIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export default function NavBar({ rightContent }) {
  const [open, setOpen] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [savedQuizzes, setSavedQuizzes] = useState([])
  const [loadingSaved, setLoadingSaved] = useState(false)
  const [settingsType, setSettingsType] = useState(null) // null | 'vocab' | 'verb'
  const [vocabCount, setVocabCount] = useState(DEFAULT_VOCAB_QUESTION_COUNT) // committed value
  const [vocabDraft, setVocabDraft] = useState(String(DEFAULT_VOCAB_QUESTION_COUNT)) // editable field text
  const [vocabLoading, setVocabLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const anyOpen = open || showSaved || settingsType !== null
    document.body.style.overflow = anyOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open, showSaved, settingsType])

  async function openSettings(type) {
    setOpen(false)
    setSettingsType(type)
    if (type === 'vocab' && user) {
      setVocabLoading(true)
      const count = await fetchVocabQuestionCount(user.id)
      setVocabCount(count)
      setVocabDraft(String(count))
      setVocabLoading(false)
    }
  }

  // Commit a new vocab question count: clamp, update local state, persist.
  function commitVocabCount(value) {
    const clamped = clampQuestionCount(value, vocabCount)
    setVocabCount(clamped)
    setVocabDraft(String(clamped))
    if (user) saveVocabQuestionCount(user.id, clamped)
  }

  async function openSavedQuizzes() {
    setOpen(false)
    setShowSaved(true)
    setLoadingSaved(true)
    const { data } = await supabase
      .from('saved_quizzes')
      .select('id, name, quiz_type, configuration, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setSavedQuizzes(data ?? [])
    setLoadingSaved(false)
  }

  function launchQuiz(quiz) {
    setShowSaved(false)
    if (quiz.quiz_type === 'verb') {
      const cfg = quiz.configuration
      const selections = (cfg.verbs ?? []).map(v => ({
        verb: { id: v.id, spanish_infinitive: v.spanish_infinitive, english: v.english },
        levels: v.levels,
      }))
      navigate('/verb-custom-quiz', { state: { selections, categoryTitle: cfg.categoryTitle ?? 'Custom Quiz' } })
    } else {
      const cfg = quiz.configuration
      if (cfg.selections?.length) {
        navigate('/custom-quiz', { state: { selections: cfg.selections } })
      } else {
        navigate('/custom-quiz', { state: { words: cfg.words ?? [] } })
      }
    }
  }

  async function deleteSavedQuiz(id) {
    await supabase.from('saved_quizzes').delete().eq('id', id)
    setSavedQuizzes(prev => prev.filter(q => q.id !== id))
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const vocabActive = location.pathname === '/vocabulary' ||
    location.pathname === '/hidden' ||
    location.pathname === '/polish' ||
    location.pathname === '/custom-quiz' ||
    location.pathname.startsWith('/quiz/')

  const verbActive = location.pathname === '/verbs' || location.pathname.startsWith('/verb-quiz/')
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
          <div style={styles.navRow}>
            <button
              style={{ ...styles.navItem, flex: 1, ...(vocabActive ? styles.navItemActive : {}) }}
              onClick={() => { setOpen(false); navigate('/vocabulary') }}
            >
              Vocabulary Trainer
            </button>
            <button
              style={{ ...styles.cogBtn, ...(vocabActive ? { color: '#1d4ed8' } : {}) }}
              onClick={() => openSettings('vocab')}
              aria-label="Vocabulary settings"
              title="Vocabulary settings"
            >
              <CogIcon />
            </button>
          </div>
          <div style={styles.navRow}>
            <button
              style={{ ...styles.navItem, flex: 1, ...(verbActive ? styles.navItemActive : {}) }}
              onClick={() => { setOpen(false); navigate('/verbs') }}
            >
              Verb Trainer
            </button>
            <button
              style={{ ...styles.cogBtn, ...(verbActive ? { color: '#1d4ed8' } : {}) }}
              onClick={() => openSettings('verb')}
              aria-label="Verb settings"
              title="Verb settings"
            >
              <CogIcon />
            </button>
          </div>
          <button
            style={{ ...styles.navItem, ...(dictActive ? styles.navItemActive : {}) }}
            onClick={() => { setOpen(false); navigate('/dictionary') }}
          >
            Dictionary
          </button>
          <button style={styles.navItem} onClick={openSavedQuizzes}>
            Saved Quizzes
          </button>
          <div style={styles.navDivider} />
          <button style={{ ...styles.navItem, color: '#666' }} onClick={handleSignOut}>
            Sign Out
          </button>
        </nav>
      </div>

      {showSaved && (
        <div style={styles.modalOverlay} onClick={() => setShowSaved(false)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>Saved Quizzes</span>
              <button style={styles.modalClose} onClick={() => setShowSaved(false)}>✕</button>
            </div>

            {loadingSaved ? (
              <p style={styles.modalMuted}>Loading…</p>
            ) : savedQuizzes.length === 0 ? (
              <p style={styles.modalMuted}>No saved quizzes yet. Configure a custom quiz and tap Save Quiz.</p>
            ) : (
              <div style={styles.quizList}>
                {savedQuizzes.map(quiz => (
                  <div key={quiz.id} style={styles.quizRow}>
                    <div style={styles.quizInfo}>
                      <span style={styles.quizName}>{quiz.name}</span>
                      <span style={{ ...styles.quizBadge, ...(quiz.quiz_type === 'verb' ? styles.quizBadgeVerb : styles.quizBadgeVocab) }}>
                        {quiz.quiz_type === 'verb' ? 'Verb' : 'Vocab'}
                      </span>
                    </div>
                    <div style={styles.quizActions}>
                      <button style={styles.deleteBtn} onClick={() => deleteSavedQuiz(quiz.id)} title="Delete">✕</button>
                      <button style={styles.launchBtn} onClick={() => launchQuiz(quiz)}>Launch →</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {settingsType && (
        <div style={styles.modalOverlay} onClick={() => setSettingsType(null)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>
                {settingsType === 'vocab' ? 'Vocabulary Settings' : 'Verb Settings'}
              </span>
              <button style={styles.modalClose} onClick={() => setSettingsType(null)}>✕</button>
            </div>

            {settingsType === 'verb' && (
              <p style={styles.modalMuted}>No settings available yet.</p>
            )}

            {settingsType === 'vocab' && (
              <div style={styles.settingsBody}>
                <div style={styles.settingRow}>
                  <div style={styles.settingLabelWrap}>
                    <span style={styles.settingLabel}>Number of questions</span>
                    <span style={styles.settingHint}>Per theme &amp; custom quiz (1–100)</span>
                  </div>
                  <div style={styles.stepper}>
                    <button
                      style={styles.stepBtn}
                      onClick={() => commitVocabCount(vocabCount - 1)}
                      disabled={vocabLoading}
                      aria-label="Decrease"
                    >
                      −
                    </button>
                    <input
                      style={styles.stepInput}
                      type="text"
                      inputMode="numeric"
                      value={vocabLoading ? '' : vocabDraft}
                      onChange={e => {
                        const v = e.target.value
                        if (v === '' || /^\d+$/.test(v)) setVocabDraft(v)
                      }}
                      onBlur={() => commitVocabCount(vocabDraft)}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      aria-label="Number of questions"
                    />
                    <button
                      style={styles.stepBtn}
                      onClick={() => commitVocabCount(vocabCount + 1)}
                      disabled={vocabLoading}
                      aria-label="Increase"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
    position: 'sticky',
    top: 0,
    zIndex: 200,
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
  navRow: {
    display: 'flex',
    alignItems: 'center',
  },
  cogBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#999',
    padding: '0.875rem 1.1rem',
    flexShrink: 0,
  },
  navDivider: {
    height: '1px',
    backgroundColor: '#f0f0f0',
    margin: '0.25rem 0',
  },
  modalOverlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 600, padding: '1rem',
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: '14px',
    width: '100%', maxWidth: '460px', maxHeight: '80vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1.1rem 1.25rem', borderBottom: '1px solid #f0f0f0', flexShrink: 0,
  },
  modalTitle: { fontSize: '1rem', fontWeight: 700, color: '#111' },
  modalClose: {
    background: 'none', border: 'none', fontSize: '1rem', color: '#888',
    cursor: 'pointer', padding: '0.25rem', borderRadius: '4px',
  },
  modalMuted: {
    margin: 0, padding: '1.5rem 1.25rem',
    fontSize: '0.875rem', color: '#888', textAlign: 'center',
  },
  settingsBody: {
    padding: '1.1rem 1.25rem 1.4rem',
  },
  settingRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
  },
  settingLabelWrap: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  settingLabel: { fontSize: '0.95rem', fontWeight: 600, color: '#111' },
  settingHint: { fontSize: '0.78rem', color: '#999' },
  stepper: {
    display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0,
  },
  stepBtn: {
    width: '38px', height: '38px', fontSize: '1.25rem', fontWeight: 700,
    color: '#333', backgroundColor: '#f3f4f6', border: '1px solid #e5e5e5',
    borderRadius: '8px', cursor: 'pointer', lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  stepInput: {
    width: '56px', height: '38px', textAlign: 'center',
    fontSize: '1rem', fontWeight: 700,
    color: '#111', backgroundColor: '#fff', colorScheme: 'light',
    border: '1.5px solid #d1d5db', borderRadius: '8px', outline: 'none',
    boxSizing: 'border-box', MozAppearance: 'textfield',
  },
  quizList: { overflowY: 'auto', flex: 1 },
  quizRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.75rem 1.25rem', borderBottom: '1px solid #f5f5f5', gap: '0.75rem',
  },
  quizInfo: { display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 },
  quizName: {
    fontSize: '0.9rem', fontWeight: 600, color: '#111',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  quizBadge: {
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
    textTransform: 'uppercase', padding: '0.2rem 0.45rem',
    borderRadius: '4px', flexShrink: 0,
  },
  quizBadgeVerb:  { backgroundColor: '#ede9fe', color: '#6d28d9' },
  quizBadgeVocab: { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  quizActions: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 },
  deleteBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#ccc', fontSize: '0.8rem', padding: '0.3rem',
    borderRadius: '4px', lineHeight: 1,
  },
  launchBtn: {
    padding: '0.4rem 0.85rem', fontSize: '0.82rem', fontWeight: 600,
    backgroundColor: '#16a34a', color: '#fff', border: 'none',
    borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
  },
}
