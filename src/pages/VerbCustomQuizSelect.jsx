import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import NavBar from '../components/NavBar'

const LEVELS = [
  { key: 1, label: 'L1', full: 'Level One' },
  { key: 2, label: 'L2', full: 'Level Two' },
  { key: 3, label: 'L3', full: 'Level Three' },
  { key: 4, label: 'L4', full: 'Level Four' },
]

const GLOBAL_OPTIONS = [
  { key: 'all', label: 'All Levels' },
  { key: 1,     label: 'Level One' },
  { key: 2,     label: 'Level Two' },
  { key: 3,     label: 'Level Three' },
  { key: 4,     label: 'Level Four' },
]

export default function VerbCustomQuizSelect() {
  const location = useLocation()
  const navigate = useNavigate()

  const { verbs = [], categoryTitle = 'Custom Quiz' } = location.state ?? {}

  const [verbLevels, setVerbLevels] = useState(() => {
    const map = {}
    for (const v of verbs) map[v.id] = new Set([1, 2, 3, 4])
    return map
  })
  const [globalKey, setGlobalKey] = useState('all')

  if (!verbs.length) {
    return (
      <div style={s.page}>
        <NavBar />
        <main style={s.main}>
          <button style={s.backLink} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>
          <p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>No verbs available.</p>
        </main>
      </div>
    )
  }

  function applyGlobal(key) {
    setGlobalKey(key)
    const newMap = {}
    for (const v of verbs) {
      newMap[v.id] = key === 'all' ? new Set([1, 2, 3, 4]) : new Set([key])
    }
    setVerbLevels(newMap)
  }

  function toggle(verbId, level) {
    setGlobalKey(null)
    setVerbLevels(prev => {
      const cur = new Set(prev[verbId] ?? [])
      if (cur.has(level)) {
        if (cur.size === 1) return prev
        cur.delete(level)
      } else {
        cur.add(level)
      }
      return { ...prev, [verbId]: cur }
    })
  }

  const totalQuestions = verbs.reduce((n, v) => n + (verbLevels[v.id]?.size ?? 0), 0)

  function handleStart() {
    const selections = verbs.map(v => ({
      verb: v,
      levels: [...(verbLevels[v.id] ?? new Set([1]))].sort(),
    }))
    navigate('/verb-custom-quiz', { state: { selections, categoryTitle } })
  }

  return (
    <div style={s.page}>
      <NavBar />
      <main style={s.main}>
        <button style={s.backLink} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>

        <div style={s.headerCard}>
          <div style={s.headerTitle}>Custom Quiz</div>
          <div style={s.headerSub}>{categoryTitle}</div>
          <div style={s.globalLabel}>Set all verbs to:</div>
          <div style={s.globalRow}>
            {GLOBAL_OPTIONS.map(opt => (
              <button
                key={opt.key}
                style={{ ...s.globalBtn, ...(globalKey === opt.key ? s.globalBtnActive : {}) }}
                onClick={() => applyGlobal(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={s.verbList}>
          <div style={s.columnHeader}>
            <div style={{ flex: 1 }} />
            <div style={s.levelHeaderGroup}>
              {LEVELS.map(l => (
                <div key={l.key} style={s.levelHeaderLabel}>{l.label}</div>
              ))}
            </div>
          </div>

          {verbs.map(verb => {
            const levels = verbLevels[verb.id] ?? new Set()
            return (
              <div key={verb.id} style={s.verbRow}>
                <div style={s.verbInfo}>
                  <span style={s.verbSpanish}>{verb.spanish_infinitive}</span>
                  <span style={s.verbEnglish}>{verb.english}</span>
                </div>
                <div style={s.levelToggles}>
                  {LEVELS.map(l => {
                    const active = levels.has(l.key)
                    return (
                      <button
                        key={l.key}
                        style={{ ...s.levelBtn, ...(active ? s.levelBtnActive : {}) }}
                        onClick={() => toggle(verb.id, l.key)}
                        aria-pressed={active}
                        aria-label={`${verb.spanish_infinitive} ${l.full}`}
                        title={l.full}
                      >
                        {l.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div style={s.footer}>
          <button
            style={{ ...s.startBtn, ...(totalQuestions === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
            onClick={handleStart}
            disabled={totalQuestions === 0}
          >
            Start Quiz — {totalQuestions} question{totalQuestions !== 1 ? 's' : ''} →
          </button>
        </div>
      </main>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', backgroundColor: '#f8f8f6', fontFamily: 'system-ui, sans-serif' },
  main: {
    maxWidth: '640px', margin: '0 auto', padding: '1rem 1.5rem 7rem',
    display: 'flex', flexDirection: 'column', gap: '0.75rem',
  },
  backLink: {
    padding: '0.35rem 0', fontSize: '0.875rem', color: '#555',
    background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start',
  },
  headerCard: {
    backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
    padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.625rem',
  },
  headerTitle: { fontSize: '1.05rem', fontWeight: 700, color: '#111' },
  headerSub: { fontSize: '0.82rem', color: '#888', marginTop: '-0.25rem' },
  globalLabel: {
    fontSize: '0.7rem', fontWeight: 700, color: '#999',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.1rem',
  },
  globalRow: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' },
  globalBtn: {
    padding: '0.3rem 0.7rem', fontSize: '0.8rem', fontWeight: 600,
    border: '1.5px solid #e5e5e5', borderRadius: '20px',
    backgroundColor: '#fafafa', color: '#555', cursor: 'pointer', lineHeight: 1.4,
    transition: 'all 0.1s',
  },
  globalBtnActive: { backgroundColor: '#111', color: '#fff', borderColor: '#111' },
  verbList: {
    backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
    overflow: 'hidden',
  },
  columnHeader: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.5rem 1rem 0.3rem',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
  },
  levelHeaderGroup: { display: 'flex', gap: '4px', flexShrink: 0 },
  levelHeaderLabel: {
    width: '34px', textAlign: 'center',
    fontSize: '0.68rem', fontWeight: 700, color: '#aaa',
  },
  verbRow: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.55rem 1rem', borderBottom: '1px solid #f5f5f5',
  },
  verbInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 },
  verbSpanish: {
    fontSize: '0.875rem', fontWeight: 600, color: '#111',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  verbEnglish: {
    fontSize: '0.7rem', color: '#aaa',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  levelToggles: { display: 'flex', gap: '4px', flexShrink: 0 },
  levelBtn: {
    width: '34px', height: '26px', fontSize: '0.7rem', fontWeight: 700,
    border: '1.5px solid #e5e5e5', borderRadius: '5px',
    backgroundColor: '#fafafa', color: '#bbb', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.1s',
  },
  levelBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6', color: '#fff' },
  footer: { position: 'sticky', bottom: '1.5rem', paddingTop: '0.5rem' },
  startBtn: {
    width: '100%', padding: '0.9rem', fontSize: '1rem', fontWeight: 600,
    backgroundColor: '#16a34a', color: '#fff', border: 'none',
    borderRadius: '10px', cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(22,163,74,0.3)',
  },
}
