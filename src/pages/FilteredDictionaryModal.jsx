import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../utils/supabaseClient'

// Reusable filtered Verb Dictionary shown as a popup overlay (not a navigation).
// Accepts a set of verbs to display (each needs at least `id`) and shows a
// condensed, searchable dictionary of exactly those verbs, each expandable to its
// conjugation table — mirroring the full Verb Dictionary + Verb Detail rendering.
// Read-only: it never touches quiz or progression state.

const PERSONS = [
  { label: 'Yo',          key: 'yo'       },
  { label: 'Tú',          key: 'tu'       },
  { label: 'Él/Ella',     key: 'el'       },
  { label: 'Nosotros',    key: 'nosotros' },
  { label: 'Ellos/Ellas', key: 'ellos'    },
]

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

// ── Regular -AR endings cheat sheet ─────────────────────────────────────────────
const ENDING_TENSES = [
  { key: 'present_conjugations', label: 'Present', th: { backgroundColor: '#f3f4f6', color: '#374151' } },
  { key: 'past_conjugations',    label: 'Past',    th: { backgroundColor: '#dbeafe', color: '#1e40af' } },
  { key: 'future_conjugations',  label: 'Future',  th: { backgroundColor: '#dcfce7', color: '#166534' } },
]

// Derive the shared regular -AR ending for each (tense, pronoun) from the actual
// conjugation data — strip the stem (infinitive minus the final "ar") from each
// verb's form and take the most common remainder, so it stays correct if data
// changes and ignores any stray irregular form.
function deriveArEndings(verbs) {
  const out = {}
  for (const t of ENDING_TENSES) {
    out[t.key] = {}
    for (const p of PERSONS) {
      const counts = {}
      for (const v of verbs) {
        const inf = v.spanish_infinitive ?? ''
        if (!/ar$/i.test(inf)) continue
        const stem = inf.slice(0, -2)
        const conj = v[t.key]?.[p.key]
        if (!conj) continue
        const ending = conj.startsWith(stem) ? conj.slice(stem.length) : conj
        counts[ending] = (counts[ending] ?? 0) + 1
      }
      let best = '', bestN = -1
      for (const [e, n] of Object.entries(counts)) if (n > bestN) { best = e; bestN = n }
      out[t.key][p.key] = best
    }
  }
  return out
}

export default function FilteredDictionaryModal({ verbs, title, onClose, showEndings = false, initialTab }) {
  const [full, setFull]       = useState([])   // full verb records (with conjugations)
  const [loading, setLoading] = useState(true)
  const [query, setQuery]     = useState('')
  const [expandedId, setExpandedId] = useState(null)
  // For the Verbs -AR dictionary the endings tab is the default; a caller can still
  // force the verbs list by explicitly passing initialTab='verbs'.
  const [tab, setTab] = useState(showEndings && initialTab !== 'verbs' ? 'endings' : 'verbs')

  const ids = useMemo(() => (verbs ?? []).map(v => v.id).filter(id => id != null), [verbs])
  const arEndings = useMemo(() => (showEndings ? deriveArEndings(full) : null), [showEndings, full])

  useEffect(() => {
    let cancelled = false
    if (!ids.length) { setFull([]); setLoading(false); return }
    setLoading(true)
    supabase
      .from('verbs')
      .select('id, spanish_infinitive, english, verb_family, present_conjugations, past_conjugations, future_conjugations')
      .in('id', ids)
      .order('spanish_infinitive')
      .then(({ data }) => { if (!cancelled) { setFull(data ?? []); setLoading(false) } })
    return () => { cancelled = true }
  }, [ids])

  const q = query.trim().toLowerCase()
  const shown = q
    ? full.filter(v => v.spanish_infinitive.toLowerCase().includes(q) || v.english.toLowerCase().includes(q))
    : full

  return (
    <div style={s.backdrop} onClick={e => { e.stopPropagation(); onClose() }}>
      <div style={s.box} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <h2 style={s.title}>
            Verb Dictionary
            {title && <span style={s.titleSub}>{title}</span>}
          </h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {showEndings && (
          <div style={s.tabRow}>
            <button style={tab === 'endings' ? s.tabActive : s.tab} onClick={() => setTab('endings')}>-AR Endings</button>
            <button style={tab === 'verbs'   ? s.tabActive : s.tab} onClick={() => setTab('verbs')}>Verbs</button>
          </div>
        )}

        {tab === 'verbs' ? (
        <>
        <div style={s.searchWrap}>
          <div style={s.searchBox}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              style={s.searchInput}
              type="text"
              placeholder="Search Spanish or English…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false"
            />
            {query && <button style={s.clearBtn} onMouseDown={() => setQuery('')}>✕</button>}
          </div>
        </div>

        <div style={s.body}>
          {loading ? (
            <p style={s.muted}>Loading…</p>
          ) : shown.length === 0 ? (
            <p style={s.muted}>{q ? `No verbs match "${query}"` : 'No verbs in this category.'}</p>
          ) : (
            <div style={s.listWrap}>
              {shown.map(verb => {
                const fc = familyColors(verb.verb_family)
                const open = expandedId === verb.id
                return (
                  <div key={verb.id} style={s.verbBlock}>
                    <button
                      style={s.verbRow}
                      onClick={() => setExpandedId(open ? null : verb.id)}
                    >
                      <div style={s.verbNames}>
                        <span style={s.spanish}>{verb.spanish_infinitive}</span>
                        <span style={s.english}>{verb.english}</span>
                      </div>
                      <span style={{ ...s.familyBadge, backgroundColor: fc.bg, color: fc.color, borderColor: fc.border }}>
                        {familyLabel(verb.verb_family)}
                      </span>
                      <span style={{ ...s.chevron, transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
                    </button>

                    {open && (
                      <div style={s.tableWrap}>
                        <table style={s.table}>
                          <thead>
                            <tr>
                              <th style={s.thPerson} />
                              <th style={{ ...s.thTense, backgroundColor: '#dbeafe', color: '#1e40af' }}>Past</th>
                              <th style={{ ...s.thTense, backgroundColor: '#f3f4f6', color: '#374151' }}>Present</th>
                              <th style={{ ...s.thTense, backgroundColor: '#dcfce7', color: '#166534' }}>Future</th>
                            </tr>
                          </thead>
                          <tbody>
                            {PERSONS.map(({ label, key }) => (
                              <tr key={label} style={s.tableRow}>
                                <td style={s.tdPerson}>{label}</td>
                                <td style={s.tdConj}>{verb.past_conjugations?.[key]    ?? '—'}</td>
                                <td style={s.tdConj}>{verb.present_conjugations?.[key] ?? '—'}</td>
                                <td style={s.tdConj}>{verb.future_conjugations?.[key]  ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </>
        ) : (
          <div style={s.body}>
            {loading ? (
              <p style={s.muted}>Loading…</p>
            ) : (
              <>
                <p style={s.endHint}>
                  All Verbs -AR are perfectly regular — they share these endings. Drop the stem and memorise the pattern.
                </p>
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.thPerson} />
                        {ENDING_TENSES.map(t => (
                          <th key={t.key} style={{ ...s.thTense, ...t.th }}>{t.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PERSONS.map(({ label, key }) => (
                        <tr key={key} style={s.tableRow}>
                          <td style={s.tdPerson}>{label}</td>
                          {ENDING_TENSES.map(t => (
                            <td key={t.key} style={s.tdEnding}>___{arEndings?.[t.key]?.[key] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const s = {
  backdrop: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: '1rem',
  },
  box: {
    backgroundColor: '#fff', borderRadius: '14px', width: '100%', maxWidth: '520px',
    maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.9rem 1.25rem', borderBottom: '1px solid #f0f0f0', flexShrink: 0,
  },
  title: { flex: 1, margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111', display: 'flex', alignItems: 'baseline', gap: '0.5rem', minWidth: 0 },
  titleSub: { fontSize: '0.72rem', fontWeight: 500, color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  closeBtn: { background: 'none', border: 'none', fontSize: '1rem', color: '#888', cursor: 'pointer', padding: '0.25rem', lineHeight: 1, borderRadius: '4px', flexShrink: 0 },
  tabRow: { display: 'flex', gap: '0.375rem', padding: '0.5rem 1rem', borderBottom: '1px solid #f0f0f0', flexShrink: 0 },
  tab: { flex: 1, padding: '0.4rem 0.25rem', fontSize: '0.8rem', fontWeight: 500, color: '#888', backgroundColor: '#f5f5f5', border: '1px solid #e5e5e5', borderRadius: '6px', cursor: 'pointer' },
  tabActive: { flex: 1, padding: '0.4rem 0.25rem', fontSize: '0.8rem', fontWeight: 700, color: '#111', backgroundColor: '#fff', border: '1px solid #111', borderRadius: '6px', cursor: 'pointer' },
  endHint: { margin: '0 0 0.75rem', fontSize: '0.78rem', color: '#666', lineHeight: 1.45 },
  tdEnding: { padding: '0.5rem 0.25rem', textAlign: 'center', color: '#111', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', whiteSpace: 'nowrap' },
  searchWrap: { padding: '0.6rem 1rem', borderBottom: '1px solid #f0f0f0', flexShrink: 0 },
  searchBox: { display: 'flex', alignItems: 'center', backgroundColor: '#f8f8f6', border: '1px solid #e5e5e5', borderRadius: '9px', padding: '0 0.75rem', gap: '0.5rem' },
  searchInput: { flex: 1, padding: '0.55rem 0', fontSize: '0.9rem', border: 'none', outline: 'none', background: 'none', color: '#111' },
  clearBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '0.8rem', padding: '0.2rem', lineHeight: 1, flexShrink: 0 },
  body: { overflowY: 'auto', flex: 1, padding: '0.75rem 1rem 1rem', WebkitOverflowScrolling: 'touch' },
  muted: { margin: '1rem 0', color: '#888', fontSize: '0.9rem', textAlign: 'center' },
  listWrap: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  verbBlock: { border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden' },
  verbRow: {
    display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.75rem',
    textAlign: 'left', background: '#fff', border: 'none', cursor: 'pointer', width: '100%',
  },
  verbNames: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 },
  spanish: { fontSize: '0.92rem', fontWeight: 600, color: '#111' },
  english: { fontSize: '0.72rem', color: '#888' },
  familyBadge: { fontSize: '0.6rem', fontWeight: 600, borderRadius: '4px', border: '1px solid', padding: '1px 5px', whiteSpace: 'nowrap', flexShrink: 0 },
  chevron: { color: '#ccc', fontSize: '1.1rem', flexShrink: 0, transition: 'transform 0.15s', display: 'inline-block' },
  tableWrap: { borderTop: '1px solid #f0f0f0', backgroundColor: '#fafafa' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', tableLayout: 'fixed' },
  thPerson: { width: '26%', padding: '0.4rem 0.5rem', backgroundColor: '#fafafa', borderBottom: '1px solid #eee' },
  thTense: { padding: '0.4rem 0.25rem', textAlign: 'center', fontSize: '0.66rem', fontWeight: 700, borderBottom: '1px solid #eee' },
  tableRow: { borderBottom: '1px solid #f0f0f0' },
  tdPerson: { padding: '0.45rem 0.5rem', fontWeight: 600, color: '#555', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  tdConj: { padding: '0.45rem 0.25rem', textAlign: 'center', color: '#111', fontWeight: 500, fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
}
