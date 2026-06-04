// ── Eye icons ─────────────────────────────────────────────────────────────────
function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeSlashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

// ── Medal icon ────────────────────────────────────────────────────────────────
function MedalIcon({ color, earned }) {
  const c = earned ? color : '#e5e7eb'
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" style={{ display: 'block', flexShrink: 0 }}>
      <rect x="4.5" y="0" width="5" height="6" rx="1" fill={c} />
      <circle cx="7" cy="13" r="5" fill={c} />
    </svg>
  )
}

// ── Pronouns ──────────────────────────────────────────────────────────────────
export const PRONOUNS = [
  { key: 'yo',       label: 'Yo',            english: 'I'        },
  { key: 'tu',       label: 'Tú',            english: 'You'      },
  { key: 'el',       label: 'Él / Ella',     english: 'He / She' },
  { key: 'nosotros', label: 'Nosotros',      english: 'We'       },
  { key: 'ellos',    label: 'Ellos / Ellas', english: 'They'     },
]

// ── Pronoun progress view (Levels 2–4) ───────────────────────────────────────
export function PronounProgressView({ level, verbs, progMap }) {
  const scoreKey   = level === 2 ? 't1_score' : level === 3 ? 't2_score' : 't3_score'
  const tenseLabel = level === 2 ? 'Present Tense' : level === 3 ? 'Past Tense' : 'Future Tense'
  const THRESHOLD  = 3
  const visible    = verbs.filter(v => !progMap[v.id]?.hidden)
  const total      = visible.length
  const mastered   = visible.filter(v => (progMap[v.id]?.[scoreKey] ?? 0) >= THRESHOLD).length
  const pct        = total > 0 ? mastered / total : 0
  const barColor   = pct === 1 ? '#22c55e' : pct > 0 ? '#f59e0b' : '#d1d5db'

  return (
    <div>
      <div style={{ padding: '0.6rem 1rem 0.35rem', fontSize: '0.72rem', color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #f5f5f5' }}>
        {tenseLabel} · {mastered} / {total} verbs mastered
      </div>
      {PRONOUNS.map(p => (
        <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: '1px solid #f5f5f5' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: barColor, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111' }}>{p.label}</div>
            <div style={{ fontSize: '0.72rem', color: '#aaa' }}>{p.english}</div>
          </div>
          <span style={{ fontSize: '0.78rem', color: '#888', flexShrink: 0 }}>{mastered} / {total}</span>
          <div style={{ width: '56px', height: '4px', backgroundColor: '#f0f0f0', borderRadius: '2px', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: barColor, borderRadius: '2px' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── In-modal verb progress row ────────────────────────────────────────────────
export function VerbProgressRow({ verb, prog, onToggleHidden }) {
  const stage   = prog?.stage    ?? 1
  const l4Score = prog?.l4_score ?? 0
  const hidden  = prog?.hidden   ?? false
  const l2 = stage >= 3 || l4Score >= 5
  const l3 = stage >= 4 || l4Score >= 5
  const l4 = l4Score >= 5
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.6rem 1rem', borderBottom: '1px solid #f5f5f5',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: hidden ? '#bbb' : '#111' }}>
          {verb.spanish_infinitive}
        </div>
        <div style={{ fontSize: '0.72rem', color: '#aaa' }}>{verb.english}</div>
      </div>
      <MedalIcon color="#cd7f32" earned={l2} />
      <MedalIcon color="#a8a9ad" earned={l3} />
      <MedalIcon color="#f5c518" earned={l4} />
      <button
        onClick={() => onToggleHidden(verb.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', marginLeft: '2px', flexShrink: 0, color: hidden ? '#3b82f6' : '#ccc' }}
      >
        {hidden ? <EyeSlashIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}
