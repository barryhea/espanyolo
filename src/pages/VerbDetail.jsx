import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import NavBar from '../components/NavBar'

const PERSONS = [
  { label: 'Yo',          key: 'yo'       },
  { label: 'Tú',          key: 'tu'       },
  { label: 'Él/Ella',     key: 'el'       },
  { label: 'Nosotros',    key: 'nosotros' },
  { label: 'Ellos/Ellas', key: 'ellos'   },
]

function familyLabel(f) {
  if (f === 'regular-ar') return 'Regular\n–AR'
  if (f === 'regular-er') return 'Regular\n–ER'
  if (f === 'regular-ir') return 'Regular\n–IR'
  return 'Irregular'
}

function familyStampColors(f) {
  if (f === 'regular-ar') return { border: '#15803d', color: '#15803d', bg: '#f0fdf4' }
  if (f === 'regular-er') return { border: '#1d4ed8', color: '#1d4ed8', bg: '#eff6ff' }
  if (f === 'regular-ir') return { border: '#7c3aed', color: '#7c3aed', bg: '#faf5ff' }
  return { border: '#c2410c', color: '#c2410c', bg: '#fff7ed' }
}

function FamilyStamp({ family }) {
  const c = familyStampColors(family)
  const lines = familyLabel(family).split('\n')
  return (
    <div style={{
      width: '80px',
      height: '80px',
      borderRadius: '50%',
      border: `2.5px solid ${c.border}`,
      backgroundColor: c.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1px',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: '0.5rem', fontWeight: 600, color: c.color, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        Verb Family
      </span>
      {lines.map((line, i) => (
        <span key={i} style={{ fontSize: lines.length > 1 && i === 0 ? '0.72rem' : '0.85rem', fontWeight: 700, color: c.color, lineHeight: 1.1, textAlign: 'center' }}>
          {line}
        </span>
      ))}
    </div>
  )
}

function segColors(complete, active) {
  if (complete) return { bar: '#22c55e', text: '#22c55e' }
  if (active)   return { bar: '#f59e0b', text: '#f59e0b' }
  return          { bar: '#e5e7eb', text: '#d1d5db' }
}

export default function VerbDetail() {
  const { verbId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [verb, setVerb] = useState(null)
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const verbPromise = supabase
        .from('verbs')
        .select('id, spanish_infinitive, english, verb_family, present_conjugations, past_conjugations, future_conjugations')
        .eq('id', verbId)
        .single()

      const progressPromise = user
        ? supabase
            .from('user_verb_progress')
            .select('current_stage, stage2_mastery, stage3_mastery, l4_score, drag_match_score, t1_score, t2_score, t3_score, t1_cj_stage, t2_cj_stage, t3_cj_stage')
            .eq('user_id', user.id)
            .eq('verb_id', Number(verbId))
            .maybeSingle()
        : Promise.resolve({ data: null })

      const [{ data: verbData }, { data: progressData }] = await Promise.all([verbPromise, progressPromise])
      setVerb(verbData)
      setProgress(progressData)
      setLoading(false)
    }
    load()
  }, [verbId, user?.id])

  if (loading) {
    return (
      <div style={styles.page}>
        <NavBar />
        <main style={styles.main}><p style={styles.muted}>Loading…</p></main>
      </div>
    )
  }

  if (!verb) {
    return (
      <div style={styles.page}>
        <NavBar />
        <main style={styles.main}><p style={styles.muted}>Verb not found.</p></main>
      </div>
    )
  }

  const stage   = progress?.current_stage ?? 1
  const l4Score = progress?.l4_score     ?? 0

  const l1 = stage >= 2 || l4Score >= 5
  const l2 = stage >= 3 || l4Score >= 5
  const l3 = stage >= 4 || l4Score >= 5
  const l4 = l4Score >= 5
  const t1 = (progress?.t1_cj_stage ?? 0) >= 4
  const t2 = (progress?.t2_cj_stage ?? 0) >= 4
  const t3 = (progress?.t3_cj_stage ?? 0) >= 4

  const tenseSegs = [
    { label: 'Inf.',  ...segColors(l4,      !l4)           },
    { label: 'Pres.', ...segColors(t1, l4 && !t1)          },
    { label: 'Past',  ...segColors(t2, t1 && !t2)          },
    { label: 'Fut.',  ...segColors(t3, t2 && !t3)          },
  ]
  const lSegs = [
    { label: 'L1', ...segColors(l1,        !l1)            },
    { label: 'L2', ...segColors(l2, l1 && !l2)             },
    { label: 'L3', ...segColors(l3, l2 && !l3)             },
    { label: 'L4', ...segColors(l4, l3 && !l4)             },
  ]

  return (
    <div style={styles.page}>
      <NavBar />
      <main style={styles.main}>
        <button style={styles.backBtn} onClick={() => navigate('/verb-dictionary')}>
          ← Verb Dictionary
        </button>

        {/* Header card */}
        <div style={styles.headerCard}>
          <div style={styles.headerLeft}>
            <h1 style={styles.spanishTitle}>{verb.spanish_infinitive}</h1>
            <p style={styles.englishSub}>{verb.english}</p>
          </div>
          <FamilyStamp family={verb.verb_family} />
        </div>

        {/* Stage progress */}
        <div style={styles.stageCard}>
          <span style={styles.stageCardTitle}>Stage Progress</span>
          <div style={styles.stageRow}>
            {tenseSegs.map(({ label, bar, text }) => (
              <div key={label} style={styles.stageSeg}>
                <div style={{ ...styles.stageRect, backgroundColor: bar }} />
                <span style={{ ...styles.stageLabel, color: text }}>{label}</span>
              </div>
            ))}
            <div style={styles.stageDivider} />
            {lSegs.map(({ label, bar, text }) => (
              <div key={label} style={styles.stageSeg}>
                <div style={{ ...styles.stageRect, backgroundColor: bar }} />
                <span style={{ ...styles.stageLabel, color: text }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Conjugation table */}
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.thPerson} />
                <th style={{ ...styles.thTense, backgroundColor: '#dbeafe', color: '#1e40af' }}>Past</th>
                <th style={{ ...styles.thTense, backgroundColor: '#f3f4f6', color: '#374151' }}>Present</th>
                <th style={{ ...styles.thTense, backgroundColor: '#dcfce7', color: '#166534' }}>Future</th>
              </tr>
            </thead>
            <tbody>
              {PERSONS.map(({ label, key }) => (
                <tr key={label} style={styles.tableRow}>
                  <td style={styles.tdPerson}>{label}</td>
                  <td style={styles.tdConj}>{key ? (verb.past_conjugations?.[key]    ?? '—') : '—'}</td>
                  <td style={styles.tdConj}>{key ? (verb.present_conjugations?.[key] ?? '—') : '—'}</td>
                  <td style={styles.tdConj}>{key ? (verb.future_conjugations?.[key]  ?? '—') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button style={styles.quizBtn} disabled>
          Start Custom Quiz?
        </button>
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
    maxWidth: '600px',
    margin: '0 auto',
    padding: '1.5rem 1.5rem 3rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  muted: {
    margin: 0,
    color: '#888',
    fontSize: '0.9rem',
  },
  backBtn: {
    alignSelf: 'flex-start',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#3b82f6',
    fontSize: '0.875rem',
    fontWeight: 500,
    padding: '0.25rem 0',
  },
  headerCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '1.25rem 1.25rem',
    gap: '1rem',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    minWidth: 0,
  },
  spanishTitle: {
    margin: 0,
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#111',
  },
  englishSub: {
    margin: 0,
    fontSize: '1rem',
    color: '#666',
  },
  stageCard: {
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    padding: '0.875rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  stageCardTitle: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  stageRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'flex-end',
  },
  stageDivider: {
    width: '1px',
    height: '18px',
    backgroundColor: '#e5e7eb',
    margin: '0 1px',
    flexShrink: 0,
  },
  stageSeg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  stageRect: {
    width: '32px',
    height: '8px',
    borderRadius: '3px',
  },
  stageLabel: {
    fontSize: '0.62rem',
    fontWeight: 600,
    lineHeight: 1,
  },
  tableWrap: {
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    overflow: 'hidden',
    width: '100%',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.75rem',
    tableLayout: 'fixed',
  },
  thPerson: {
    width: '28%',
    padding: '0.5rem 0.5rem',
    textAlign: 'left',
    fontSize: '0.68rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #e5e5e5',
    backgroundColor: '#fafafa',
  },
  thTense: {
    padding: '0.5rem 0.25rem',
    textAlign: 'center',
    fontSize: '0.7rem',
    fontWeight: 700,
    borderBottom: '1px solid #e5e5e5',
    letterSpacing: '0.01em',
  },
  tableRow: {
    borderBottom: '1px solid #f5f5f5',
  },
  tdPerson: {
    padding: '0.55rem 0.5rem',
    fontWeight: 600,
    color: '#555',
    fontSize: '0.75rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  tdConj: {
    padding: '0.55rem 0.25rem',
    textAlign: 'center',
    color: '#111',
    fontWeight: 500,
    fontSize: '0.75rem',
    whiteSpace: 'nowrap',
  },
  quizBtn: {
    width: '100%',
    padding: '0.875rem',
    fontSize: '1rem',
    fontWeight: 600,
    backgroundColor: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'not-allowed',
    opacity: 0.6,
    marginTop: '0.25rem',
  },
}
