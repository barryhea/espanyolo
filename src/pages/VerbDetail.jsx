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

function StatCallout({ label, value, color = '#111' }) {
  return (
    <div style={styles.statBox}>
      <span style={{ ...styles.statValue, color }}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  )
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
            .select('current_stage, stage2_mastery, stage3_mastery, l4_score, drag_match_score, t1_score, t2_score, t3_score')
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

  // Derive display stats from the columns that are actually stored
  const levelLabel = (l4Score >= 5) ? 'Mastered'
    : stage >= 4 ? 'L4'
    : stage >= 3 ? 'L3'
    : stage >= 2 ? 'L2'
    : 'L1'

  const stageScore = stage === 1
    ? (progress?.drag_match_score ?? 0)
    : stage === 2 ? (progress?.stage2_mastery ?? 0)
    : stage === 3 ? (progress?.stage3_mastery ?? 0)
    : l4Score

  const stageScoreMax = stage === 1 ? 5 : stage === 2 ? 3 : stage === 3 ? 3 : 5

  const tensesMastered = [
    (progress?.t1_score ?? 0) >= 3,
    (progress?.t2_score ?? 0) >= 3,
    (progress?.t3_score ?? 0) >= 3,
  ].filter(Boolean).length

  const stageFlags = {
    l1: stage >= 2 || l4Score >= 5,
    l2: stage >= 3 || l4Score >= 5,
    l3: stage >= 4 || l4Score >= 5,
    l4: l4Score >= 5,
    t1: (progress?.t1_score ?? 0) >= 3,
    t2: (progress?.t2_score ?? 0) >= 3,
    t3: (progress?.t3_score ?? 0) >= 3,
  }

  const STAGE_SEGS = [
    { key: 'l1', label: 'L1',      color: '#22c55e' },
    { key: 'l2', label: 'L2',      color: '#cd7f32' },
    { key: 'l3', label: 'L3',      color: '#a8a9ad' },
    { key: 'l4', label: 'L4',      color: '#f5c518' },
    { key: 't1', label: 'Present', color: '#3b82f6' },
    { key: 't2', label: 'Past',    color: '#f97316' },
    { key: 't3', label: 'Future',  color: '#16a34a' },
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

        {/* Stat callouts */}
        <div style={styles.statsRow}>
          <StatCallout label="Level"     value={levelLabel} color="#111" />
          <StatCallout label="Score"     value={`${stageScore}/${stageScoreMax}`} color="#3b82f6" />
          <StatCallout label="Tenses"    value={`${tensesMastered}/3`} color="#16a34a" />
        </div>

        {/* Stage progress */}
        <div style={styles.stageCard}>
          <span style={styles.stageCardTitle}>Stage Progress</span>
          <div style={styles.stageRow}>
            {STAGE_SEGS.map(({ key, label, color }, i) => {
              const done = stageFlags[key]
              return (
                <div key={key} style={{ ...styles.stageSeg, marginLeft: i === 4 ? '8px' : 0 }}>
                  <div style={{ ...styles.stageRect, backgroundColor: done ? color : '#e5e7eb' }} />
                  <span style={{ ...styles.stageLabel, color: done ? color : '#bbb' }}>{label}</span>
                </div>
              )
            })}
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
  statsRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  statBox: {
    flex: 1,
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    padding: '0.875rem 0.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
  },
  statValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
    lineHeight: 1,
  },
  statLabel: {
    fontSize: '0.7rem',
    color: '#888',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
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
    gap: '8px',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
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
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.9rem',
  },
  thPerson: {
    width: '30%',
    padding: '0.6rem 0.875rem',
    textAlign: 'left',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #e5e5e5',
    backgroundColor: '#fafafa',
  },
  thTense: {
    padding: '0.6rem 0.5rem',
    textAlign: 'center',
    fontSize: '0.8rem',
    fontWeight: 700,
    borderBottom: '1px solid #e5e5e5',
    letterSpacing: '0.02em',
  },
  tableRow: {
    borderBottom: '1px solid #f5f5f5',
  },
  tdPerson: {
    padding: '0.65rem 0.875rem',
    fontWeight: 600,
    color: '#555',
    fontSize: '0.85rem',
    whiteSpace: 'nowrap',
  },
  tdConj: {
    padding: '0.65rem 0.5rem',
    textAlign: 'center',
    color: '#111',
    fontWeight: 500,
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
