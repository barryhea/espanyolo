import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { VOCAB_THEMES } from '../utils/courseData'
import NavBar from '../components/NavBar'

function ringColor(pct) {
  if (pct === 100) return '#22c55e'
  if (pct >= 75) return '#eab308'
  if (pct >= 50) return '#f97316'
  return '#ef4444'
}

function ProgressRing({ pct }) {
  const color = ringColor(pct)
  const filled = Math.min(100, Math.max(0, pct))
  const empty = 100 - filled
  const r = 15.9155
  return (
    <svg viewBox="-2 -2 40 40" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="#ececec" strokeWidth="3" />
      {filled > 0 && (
        <circle
          cx="18" cy="18" r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${filled} ${empty}`}
          strokeDashoffset="25"
          strokeLinecap="butt"
        />
      )}
      <text
        x="18" y="18"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={pct === 100 ? 7 : 8.5}
        fontWeight="700"
        fill={color}
        fontFamily="system-ui, sans-serif"
      >
        {pct}%
      </text>
    </svg>
  )
}

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
  if (isHidden) {
    return <td style={styles.stageCell}><span style={{ color: '#d1d5db' }}>—</span></td>
  }
  return (
    <td style={styles.stageCell}>
      <span style={{ color: done ? '#16a34a' : '#d1d5db', fontWeight: 700 }}>
        {done ? '✓' : '✗'}
      </span>
    </td>
  )
}

function WordTable({ words, progressMap, onToggleHidden }) {
  if (words.length === 0) {
    return <p style={styles.emptyMsg}>No words to show.</p>
  }
  return (
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
          {words.map(word => {
            const prog = progressMap[word.id]
            const stage = prog?.stage ?? 1
            const consec = prog?.consecutive_correct ?? 0
            const isHidden = prog?.hidden ?? false
            return (
              <tr key={word.id} style={styles.tableRow}>
                <td style={styles.tdEn}>{word.english}</td>
                <td style={styles.tdEs}>{word.spanish}</td>
                <StageCell done={stage >= 2} isHidden={isHidden} />
                <StageCell done={stage >= 3} isHidden={isHidden} />
                <StageCell done={(stage === 3 && consec >= 5) || (prog?.mastered ?? false)} isHidden={isHidden} />
                <td style={styles.tdHide}>
                  <button
                    style={{ ...styles.hideBtn, color: isHidden ? '#3b82f6' : '#bbb' }}
                    onClick={() => onToggleHidden(word.id)}
                    title={isHidden ? 'Unhide this word' : 'Hide this word'}
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
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [themeProgress, setThemeProgress] = useState({})
  const [themeStats, setThemeStats] = useState({})
  const [masteredCount, setMasteredCount] = useState(0)

  // Theme modal state
  const [modalTheme, setModalTheme] = useState(null)
  const [modalView, setModalView] = useState('menu')
  const [modalWords, setModalWords] = useState([])
  const [modalProgress, setModalProgress] = useState({})
  const [modalLoading, setModalLoading] = useState(false)

  const [resetting, setResetting]   = useState(false)
  const [resetTarget, setResetTarget] = useState(1)

  const [struggleLoading, setStruggleLoading] = useState(false)

  // Custom Quiz selector state
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [selectorSourceTheme, setSelectorSourceTheme] = useState(null)
  const [selectorThemeId, setSelectorThemeId] = useState(null)
  const [selectorWords, setSelectorWords] = useState([])
  const [selectorLoading, setSelectorLoading] = useState(false)
  const [wordStages, setWordStages] = useState({})   // { [wordId]: Set<1|2|3> }
  const [globalStage, setGlobalStage] = useState('all')
  const [selectorProgress, setSelectorProgress] = useState({})

  useEffect(() => {
    if (user) loadProgress()
  }, [user?.id])

  useEffect(() => {
    if (!user || !location.state?.openThemeId) return
    const t = VOCAB_THEMES.find(t => t.id === location.state.openThemeId)
    if (t) openModal(t, location.state.openView ?? 'menu')
    window.history.replaceState(null, '')
  }, [user?.id, location.state?.openThemeId, location.state?.openView])

  useEffect(() => {
    document.body.style.overflow = (modalTheme || selectorOpen) ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [modalTheme, selectorOpen])

  async function loadProgress() {
    const [{ data: allWords }, { data: progressRows }] = await Promise.all([
      supabase.from('words').select('id, theme'),
      supabase
        .from('user_word_progress')
        .select('word_id, stage, consecutive_correct, mastered, hidden')
        .eq('user_id', user.id),
    ])

    const wordsByTheme = {}
    for (const w of allWords ?? []) {
      if (!wordsByTheme[w.theme]) wordsByTheme[w.theme] = []
      wordsByTheme[w.theme].push(w.id)
    }

    const progByWord = {}
    for (const p of progressRows ?? []) {
      const ex = progByWord[p.word_id]
      if (!ex || (p.stage ?? 1) > (ex.stage ?? 1) ||
          ((p.stage ?? 1) === (ex.stage ?? 1) && p.mastered && !ex.mastered)) {
        progByWord[p.word_id] = {
          stage: p.stage ?? 1,
          consecutive_correct: p.consecutive_correct ?? 0,
          mastered: p.mastered ?? false,
          hidden: p.hidden ?? false,
        }
      }
    }

    // Stage-weighted % (hidden excluded). S2=1/3, S3=2/3, mastered=3/3
    const progress = {}
    const stats = {}
    for (const theme of VOCAB_THEMES) {
      const wordIds = wordsByTheme[theme.title] ?? []
      let pts = 0, maxPts = 0, masteredCt = 0, hiddenCt = 0
      for (const wordId of wordIds) {
        const prog = progByWord[wordId]
        if (prog?.hidden) { hiddenCt++; continue }
        maxPts += 3
        const isMastered = prog?.mastered || ((prog?.stage ?? 1) === 3 && (prog?.consecutive_correct ?? 0) >= 5)
        if (isMastered) { pts += 3; masteredCt++ }
        else if ((prog?.stage ?? 1) >= 3) pts += 2
        else if ((prog?.stage ?? 1) >= 2) pts += 1
      }
      progress[theme.title] = maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0
      stats[theme.title] = { total: wordIds.length, mastered: masteredCt, hidden: hiddenCt }
    }

    const polishEligible = new Set(
      (progressRows ?? []).filter(p => p.mastered && !p.hidden).map(p => p.word_id)
    )

    setThemeProgress(progress)
    setThemeStats(stats)
    setMasteredCount(polishEligible.size)
  }

  async function openModal(theme, initialView = 'menu') {
    setModalTheme(theme)
    setModalView(initialView)
    setModalWords([])
    setModalProgress({})
    setModalLoading(true)

    const { data: words } = await supabase
      .from('words')
      .select('id, english, spanish')
      .eq('theme', theme.title)
      .order('english')

    const wordIds = (words ?? []).map(w => w.id)
    let progress = []
    if (wordIds.length) {
      const { data } = await supabase
        .from('user_word_progress')
        .select('id, word_id, stage, consecutive_correct, hidden, mastered')
        .eq('user_id', user.id)
        .in('word_id', wordIds)
      progress = data ?? []
    }

    const progMap = {}
    for (const p of progress) {
      const existing = progMap[p.word_id]
      if (!existing || p.stage > existing.stage ||
          (p.stage === existing.stage && p.consecutive_correct > existing.consecutive_correct)) {
        progMap[p.word_id] = {
          stage: p.stage ?? 1,
          consecutive_correct: p.consecutive_correct ?? 0,
          hidden: p.hidden ?? false,
          mastered: p.mastered ?? false,
          db_id: p.id,
        }
      }
    }

    setModalWords(words ?? [])
    setModalProgress(progMap)
    setModalLoading(false)
  }

  function closeModal() {
    setModalTheme(null)
    setModalView('menu')
  }

  async function toggleHiddenInModal(wordId) {
    const prog = modalProgress[wordId] ?? { stage: 1, consecutive_correct: 0, hidden: false, db_id: null }
    const willBeHidden = !prog.hidden

    setModalProgress(prev => ({ ...prev, [wordId]: { ...prog, hidden: willBeHidden } }))

    if (prog.db_id) {
      await supabase
        .from('user_word_progress')
        .update({ hidden: willBeHidden })
        .eq('id', prog.db_id)
    } else {
      const { data } = await supabase
        .from('user_word_progress')
        .insert({ user_id: user.id, word_id: wordId, stage: 1, consecutive_correct: 0, hidden: willBeHidden })
        .select('id')
        .single()
      if (data) {
        setModalProgress(prev => ({ ...prev, [wordId]: { ...prev[wordId], db_id: data.id } }))
      }
    }
  }

  async function openSelector(theme) {
    setSelectorSourceTheme(theme)
    closeModal()
    setWordStages({})
    setGlobalStage('all')
    setSelectorOpen(true)
    await loadSelectorTheme(theme.id)
  }

  async function handleResetTheme() {
    if (!modalTheme || !user || resetting) return
    setResetting(true)
    const target = resetTarget
    const wordIds = modalWords
      .filter(w => {
        const prog    = modalProgress[w.id]
        const stage   = prog?.stage   ?? 1
        const mastered = prog?.mastered ?? false
        if (target === 1) return true
        if (target === 2) return stage >= 2 || mastered
        return stage >= 3 || mastered
      })
      .map(w => w.id)
    if (wordIds.length > 0) {
      await supabase
        .from('user_word_progress')
        .update({ stage: target, consecutive_correct: 0, mastered: false })
        .eq('user_id', user.id)
        .in('word_id', wordIds)
    }
    setResetting(false)
    closeModal()
    loadProgress()
  }

  async function loadSelectorTheme(themeId) {
    setSelectorThemeId(themeId)
    setSelectorLoading(true)
    const theme = VOCAB_THEMES.find(t => t.id === themeId)
    const { data: words } = await supabase
      .from('words')
      .select('id, english, spanish')
      .eq('theme', theme.title)
      .order('english')
    const wordList = words ?? []

    let progMap = {}
    if (wordList.length) {
      const wordIds = wordList.map(w => w.id)
      const { data: progress } = await supabase
        .from('user_word_progress')
        .select('id, word_id, stage, consecutive_correct, mastered, hidden')
        .eq('user_id', user.id)
        .in('word_id', wordIds)
      for (const p of progress ?? []) {
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
    }

    setSelectorWords(wordList)
    setSelectorProgress(progMap)
    setWordStages(() => {
      const stages = {}
      for (const w of wordList) stages[w.id] = new Set([1, 2, 3])
      return stages
    })
    setGlobalStage('all')
    setSelectorLoading(false)
  }

  async function toggleHiddenInSelector(wordId) {
    const prog = selectorProgress[wordId] ?? { stage: 1, consecutive_correct: 0, hidden: false, mastered: false, db_id: null }
    const willBeHidden = !prog.hidden
    setSelectorProgress(prev => ({ ...prev, [wordId]: { ...prog, hidden: willBeHidden } }))
    if (prog.db_id) {
      await supabase.from('user_word_progress').update({ hidden: willBeHidden }).eq('id', prog.db_id)
    } else {
      const { data } = await supabase
        .from('user_word_progress')
        .insert({ user_id: user.id, word_id: wordId, stage: 1, consecutive_correct: 0, hidden: willBeHidden, mastered: false })
        .select('id').single()
      if (data) setSelectorProgress(prev => ({ ...prev, [wordId]: { ...prev[wordId], db_id: data.id } }))
    }
  }

  function applyGlobalStage(key) {
    setGlobalStage(key)
    setWordStages(() => {
      const next = {}
      for (const w of selectorWords) {
        next[w.id] = selectorProgress[w.id]?.hidden
          ? new Set()
          : key === 'all' ? new Set([1, 2, 3]) : new Set([key])
      }
      return next
    })
  }

  function toggleWordStage(wordId, stage) {
    setGlobalStage(null)
    setWordStages(prev => {
      const cur = new Set(prev[wordId] ?? [])
      if (cur.has(stage)) {
        if (cur.size === 1) return prev
        cur.delete(stage)
      } else {
        cur.add(stage)
      }
      return { ...prev, [wordId]: cur }
    })
  }

  // Top 10 Struggle Words: the 10 words with the highest total_incorrect,
  // excluding any word that already has 7+ correct in its last 10 attempts.
  // Each word is launched at its current stage.
  async function startStruggleQuiz() {
    if (struggleLoading) return
    setStruggleLoading(true)

    const { data: rows } = await supabase
      .from('user_word_progress')
      .select('word_id, total_incorrect, recent_attempts, stage')
      .eq('user_id', user.id)
      .order('total_incorrect', { ascending: false })

    const eligible = (rows ?? [])
      .filter(r => (r.total_incorrect ?? 0) > 0)
      .filter(r => {
        const arr = Array.isArray(r.recent_attempts) ? r.recent_attempts : []
        const correct = arr.reduce((sum, v) => sum + (v === 1 ? 1 : 0), 0)
        return correct < 7
      })
      .slice(0, 10)

    if (eligible.length === 0) {
      setStruggleLoading(false)
      return
    }

    const wordIds = eligible.map(r => r.word_id)
    const { data: wordRows } = await supabase
      .from('words')
      .select('id, english, spanish')
      .in('id', wordIds)
    const wordMap = {}
    for (const w of wordRows ?? []) wordMap[w.id] = w

    const selections = eligible
      .map(r => wordMap[r.word_id] ? { word: wordMap[r.word_id], stages: [r.stage ?? 1] } : null)
      .filter(Boolean)

    setStruggleLoading(false)
    if (selections.length) navigate('/custom-quiz', { state: { selections } })
  }

  function startCustomQuiz() {
    const selections = selectorWords
      .filter(w => !selectorProgress[w.id]?.hidden && (wordStages[w.id]?.size ?? 0) > 0)
      .map(w => ({ word: w, stages: [...(wordStages[w.id] ?? new Set())].sort() }))
    setSelectorOpen(false)
    setWordStages({})
    navigate('/custom-quiz', { state: { selections } })
  }

  const hiddenWords = modalWords.filter(w => modalProgress[w.id]?.hidden)

  return (
    <div style={styles.page}>
      <NavBar />

      <main style={styles.main}>
        <div style={styles.heroSpace} />

        <section style={styles.section}>
          <div style={styles.themeGrid}>
            {VOCAB_THEMES.map((theme) => (
              <button
                key={theme.id}
                style={styles.themeCard}
                onClick={() => openModal(theme)}
              >
                <div style={styles.cardLeft}>
                  <span style={styles.themeTitle}>{theme.title}</span>
                  {themeStats[theme.title] && (
                    <span style={styles.themeSubtitle}>
                      {themeStats[theme.title].total} words · {themeStats[theme.title].mastered} mastered · {themeStats[theme.title].hidden} hidden · {themeStats[theme.title].total - themeStats[theme.title].mastered - themeStats[theme.title].hidden} remaining
                    </span>
                  )}
                </div>
                <div style={styles.cardDivider} />
                <div style={styles.cardRight}>
                  <ProgressRing pct={themeProgress[theme.title] ?? 0} />
                </div>
              </button>
            ))}
          </div>
          <div style={styles.struggleWrap}>
            <h3 style={styles.struggleTitle}>Top 10 Struggle Words</h3>
            <p style={styles.struggleSubtitle}>Quiz your most-missed words at their current stage</p>
            <button
              style={styles.struggleCard}
              onClick={startStruggleQuiz}
              disabled={struggleLoading}
            >
              <span style={styles.struggleCardText}>
                {struggleLoading ? 'Building quiz…' : 'Launch struggle quiz →'}
              </span>
            </button>
          </div>

          <div style={styles.polishWrap}>
            <h3 style={styles.polishTitle}>Polish</h3>
            <p style={styles.polishSubtitle}>Practise your mastered words</p>
            <button
              style={masteredCount > 0 ? styles.polishCard : styles.polishCardDisabled}
              onClick={() => masteredCount > 0 && navigate('/polish')}
              disabled={masteredCount === 0}
            >
              <span style={masteredCount > 0 ? styles.polishCardText : styles.polishCardTextDisabled}>
                {masteredCount === 0
                  ? 'Master some words to unlock Polish mode'
                  : `${masteredCount} mastered word${masteredCount !== 1 ? 's' : ''} ready to polish →`}
              </span>
            </button>
          </div>

          <div style={styles.hiddenWordsBtnWrap}>
            <button style={styles.hiddenWordsBtn} onClick={() => navigate('/hidden')}>
              Hidden words
            </button>
          </div>
        </section>
      </main>

      {/* Theme modal */}
      {modalTheme && (
        <div style={styles.backdrop} onClick={closeModal}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>

            <div style={styles.modalHeader}>
              {modalView !== 'menu' && (
                <button style={styles.modalBackBtn} onClick={() => {
                  if (modalView === 'confirm-reset') setModalView('reset-level-select')
                  else setModalView('menu')
                }}>←</button>
              )}
              <h2 style={styles.modalTitle}>{modalTheme.title}</h2>
              <button style={styles.closeBtn} onClick={closeModal}>✕</button>
            </div>

            {modalView === 'menu' && (
              <div style={styles.menuList}>
                <button
                  style={styles.menuOption}
                  onClick={() => { closeModal(); navigate(`/quiz/${modalTheme.id}`) }}
                >
                  <span style={styles.menuOptionLabel}>Start Quiz</span>
                  <span style={styles.menuOptionDesc}>Practice words in this theme</span>
                </button>
                <button
                  style={styles.menuOption}
                  onClick={() => openSelector(modalTheme)}
                >
                  <span style={styles.menuOptionLabel}>Custom Quiz</span>
                  <span style={styles.menuOptionDesc}>Select specific words to practise</span>
                </button>
                <button
                  style={styles.menuOption}
                  onClick={() => setModalView('progress')}
                  disabled={modalLoading}
                >
                  <span style={styles.menuOptionLabel}>
                    Progress {modalLoading && <span style={styles.loadingDot}>…</span>}
                  </span>
                  <span style={styles.menuOptionDesc}>All words and your current stage</span>
                </button>
                <button
                  style={styles.menuOption}
                  onClick={() => setModalView('hidden')}
                  disabled={modalLoading}
                >
                  <span style={styles.menuOptionLabel}>
                    Hidden Words {modalLoading && <span style={styles.loadingDot}>…</span>}
                  </span>
                  <span style={styles.menuOptionDesc}>Words you've excluded from quizzes</span>
                </button>
                <button
                  style={styles.menuOptionDestructive}
                  onClick={() => setModalView('reset-level-select')}
                  disabled={modalLoading}
                >
                  <span style={styles.menuOptionLabelDestructive}>
                    Reset Level {modalLoading && <span style={styles.loadingDot}>…</span>}
                  </span>
                  <span style={styles.menuOptionDesc}>Roll back progress to a chosen stage</span>
                </button>
              </div>
            )}

            {modalView === 'progress' && !modalLoading && (
              <p style={styles.progressSummary}>
                {modalWords.length} words · {modalWords.filter(w => { const p = modalProgress[w.id]; return (p?.mastered) || (p?.stage === 3 && (p?.consecutive_correct ?? 0) >= 5) }).length} mastered · {modalWords.filter(w => modalProgress[w.id]?.hidden).length} hidden
              </p>
            )}
            {modalView === 'progress' && (
              <div style={styles.modalBody}>
                {modalLoading
                  ? <p style={styles.emptyMsg}>Loading…</p>
                  : (() => {
                      const sortedWords = [...modalWords].sort((a, b) => {
                        const rank = w => {
                          const p = modalProgress[w.id]
                          const stage = p?.stage ?? 1
                          const consec = p?.consecutive_correct ?? 0
                          if (p?.hidden) return 4
                          if ((p?.mastered) || (stage === 3 && consec >= 5)) return 0
                          if (stage >= 3) return 1
                          if (stage >= 2) return 2
                          return 3
                        }
                        const diff = rank(a) - rank(b)
                        if (diff !== 0) return diff
                        return a.english.localeCompare(b.english)
                      })
                      return <WordTable words={sortedWords} progressMap={modalProgress} onToggleHidden={toggleHiddenInModal} />
                    })()
                }
              </div>
            )}

            {modalView === 'hidden' && (
              <div style={styles.modalBody}>
                {modalLoading
                  ? <p style={styles.emptyMsg}>Loading…</p>
                  : hiddenWords.length === 0
                    ? <p style={styles.emptyMsg}>No hidden words for this theme.</p>
                    : <WordTable words={hiddenWords} progressMap={modalProgress} onToggleHidden={toggleHiddenInModal} />
                }
              </div>
            )}

            {modalView === 'reset-level-select' && (
              <div style={styles.menuList}>
                {[
                  { label: 'Stage One',   value: 1, desc: 'Reset all words back to the start of Stage 1' },
                  { label: 'Stage Two',   value: 2, desc: 'Reset words at S2 or above back to Stage 2'   },
                  { label: 'Stage Three', value: 3, desc: 'Reset words at S3 back to Stage 3'            },
                ].map(opt => (
                  <button
                    key={opt.value}
                    style={styles.menuOption}
                    onClick={() => { setResetTarget(opt.value); setModalView('confirm-reset') }}
                  >
                    <span style={styles.menuOptionLabel}>{opt.label}</span>
                    <span style={styles.menuOptionDesc}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            )}

            {modalView === 'confirm-reset' && (() => {
              const STAGE_NAMES = ['Stage One', 'Stage Two', 'Stage Three']
              const stageName = STAGE_NAMES[resetTarget - 1]
              const msg = resetTarget === 1
                ? `All word progress for ${modalTheme.title} will be reset to Stage One.`
                : `Words at Stage ${resetTarget} or above in ${modalTheme.title} will be reset to ${stageName}.`
              return (
                <div style={styles.confirmBody}>
                  <p style={styles.confirmText}>{msg}</p>
                  <p style={styles.confirmSubText}>Hidden words will be preserved.</p>
                  <div style={styles.confirmBtns}>
                    <button style={styles.cancelBtn} onClick={() => setModalView('reset-level-select')} disabled={resetting}>
                      Cancel
                    </button>
                    <button style={styles.confirmResetBtn} onClick={handleResetTheme} disabled={resetting}>
                      {resetting ? 'Resetting…' : 'Reset'}
                    </button>
                  </div>
                </div>
              )
            })()}

          </div>
        </div>
      )}

      {/* Custom Quiz word selector */}
      {selectorOpen && (() => {
        const totalQuestions = selectorWords
          .filter(w => !selectorProgress[w.id]?.hidden)
          .reduce((n, w) => n + (wordStages[w.id]?.size ?? 0), 0)
        return (
          <div style={styles.selectorOverlay}>
            <div style={styles.selectorHeader}>
              <button
                style={styles.selectorBackBtn}
                onClick={() => { setSelectorOpen(false); if (selectorSourceTheme) openModal(selectorSourceTheme) }}
              >
                ←
              </button>
              <div style={styles.selectorThemeWrap}>
                <div style={styles.selectorThemePill}>
                  <select
                    style={styles.selectorThemeSelect}
                    value={selectorThemeId ?? ''}
                    onChange={e => loadSelectorTheme(Number(e.target.value))}
                  >
                    {VOCAB_THEMES.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                  <span style={styles.selectorThemeChevron}>▾</span>
                </div>
              </div>
              <button
                style={totalQuestions > 0 ? styles.startQuizBtn : styles.startQuizBtnDisabled}
                disabled={totalQuestions === 0}
                onClick={startCustomQuiz}
              >
                {totalQuestions > 0 ? `Start (${totalQuestions})` : 'Start'}
              </button>
            </div>

            {/* Global stage selector */}
            <div style={styles.globalStageRow}>
              {[
                { key: 'all', label: 'All Stages' },
                { key: 1,     label: 'Stage One'  },
                { key: 2,     label: 'Stage Two'  },
                { key: 3,     label: 'Stage Three'},
              ].map(opt => (
                <button
                  key={opt.key}
                  style={{ ...styles.globalStageBtn, ...(globalStage === opt.key ? styles.globalStageBtnActive : {}) }}
                  onClick={() => applyGlobalStage(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div style={styles.selectorBody}>
              {selectorLoading ? (
                <p style={styles.selectorEmptyMsg}>Loading…</p>
              ) : selectorWords.length === 0 ? (
                <p style={styles.selectorEmptyMsg}>No words found.</p>
              ) : (
                <table style={styles.selectorTable}>
                  <thead>
                    <tr>
                      <th style={styles.selectorThLeft}>English</th>
                      <th style={styles.selectorThLeft}>Spanish</th>
                      <th style={styles.selectorThStage}>S1</th>
                      <th style={styles.selectorThStage}>S2</th>
                      <th style={styles.selectorThStage}>S3</th>
                      <th style={styles.selectorThHide}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectorWords.map(word => {
                      const isHidden = selectorProgress[word.id]?.hidden ?? false
                      const stages = wordStages[word.id] ?? new Set()
                      return (
                        <tr
                          key={word.id}
                          style={{ ...styles.selectorTableRow, cursor: 'default', backgroundColor: isHidden ? '#f9f9f9' : '#fff' }}
                        >
                          <td style={{ ...styles.selectorTdEn, color: isHidden ? '#bbb' : '#333' }}>{word.english}</td>
                          <td style={{ ...styles.selectorTdEs, color: isHidden ? '#bbb' : '#111' }}>{word.spanish}</td>
                          {[1, 2, 3].map(s => (
                            <td key={s} style={styles.selectorStageCell}>
                              <button
                                style={{
                                  ...styles.stageToggleBtn,
                                  ...(stages.has(s) && !isHidden ? styles.stageToggleBtnActive : {}),
                                  ...(isHidden ? { opacity: 0.25, cursor: 'default' } : {}),
                                }}
                                onClick={() => !isHidden && toggleWordStage(word.id, s)}
                                disabled={isHidden}
                              >
                                S{s}
                              </button>
                            </td>
                          ))}
                          <td style={styles.selectorHideCell}>
                            <button
                              style={{ ...styles.selectorHideBtn, color: isHidden ? '#3b82f6' : '#bbb' }}
                              onClick={e => { e.stopPropagation(); toggleHiddenInSelector(word.id) }}
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
              )}
            </div>
          </div>
        )
      })()}
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
    padding: '2rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '3rem',
  },
  heroSpace: {
    minHeight: '5rem',
  },
  section: {},
  sectionTitle: {
    margin: '0 0 0.25rem',
    fontSize: '1.25rem',
    fontWeight: 600,
  },
  sectionSubtitle: {
    margin: '0 0 1.25rem',
    fontSize: '0.9rem',
    color: '#666',
  },
  backBtn: {
    marginBottom: '1.5rem',
    padding: '0.35rem 0',
    fontSize: '0.875rem',
    color: '#555',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  themeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '0.75rem',
  },
  themeCard: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    height: '72px',
    padding: 0,
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    cursor: 'pointer',
    textAlign: 'left',
    overflow: 'hidden',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  cardLeft: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '2px',
    padding: '0.35rem 0.875rem',
    minWidth: 0,
  },
  cardDivider: {
    width: '1px',
    flexShrink: 0,
    backgroundColor: '#f0f0f0',
  },
  cardRight: {
    width: '56px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: '0 3px 3px 0',
  },
  themeTitle: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#111',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  themeSubtitle: {
    fontSize: '0.68rem',
    color: '#bbb',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  struggleWrap: {
    marginTop: '2rem',
  },
  struggleTitle: {
    margin: '0 0 0.2rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#111',
  },
  struggleSubtitle: {
    margin: '0 0 0.75rem',
    fontSize: '0.85rem',
    color: '#666',
  },
  struggleCard: {
    display: 'block',
    width: '100%',
    padding: '1.1rem 1.5rem',
    background: '#fef2f2',
    border: '1.5px solid #f87171',
    borderRadius: '10px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  struggleCardText: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#b91c1c',
  },
  polishWrap: {
    marginTop: '2rem',
  },
  polishTitle: {
    margin: '0 0 0.2rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#111',
  },
  polishSubtitle: {
    margin: '0 0 0.75rem',
    fontSize: '0.85rem',
    color: '#666',
  },
  polishCard: {
    display: 'block',
    width: '100%',
    padding: '1.1rem 1.5rem',
    background: '#fffbeb',
    border: '1.5px solid #fbbf24',
    borderRadius: '10px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  polishCardDisabled: {
    display: 'block',
    width: '100%',
    padding: '1.1rem 1.5rem',
    background: '#f9f9f9',
    border: '1.5px solid #e5e5e5',
    borderRadius: '10px',
    cursor: 'default',
    textAlign: 'left',
  },
  polishCardText: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#92400e',
  },
  polishCardTextDisabled: {
    fontSize: '0.9rem',
    fontWeight: 400,
    color: '#aaa',
  },
  hiddenWordsBtnWrap: {
    marginTop: '1.5rem',
    display: 'flex',
    justifyContent: 'center',
  },
  hiddenWordsBtn: {
    padding: '0.4rem 1rem',
    fontSize: '0.8rem',
    color: '#888',
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: '20px',
    cursor: 'pointer',
  },

  // Theme modal
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: '14px',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1rem 1.25rem',
    borderBottom: '1px solid #f0f0f0',
    flexShrink: 0,
  },
  modalBackBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1.1rem',
    color: '#555',
    cursor: 'pointer',
    padding: '0 0.25rem',
    lineHeight: 1,
  },
  modalTitle: {
    flex: 1,
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    color: '#111',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1rem',
    color: '#888',
    cursor: 'pointer',
    padding: '0.25rem',
    lineHeight: 1,
    borderRadius: '4px',
  },
  menuList: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0.5rem',
    gap: '0.25rem',
  },
  menuOption: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.2rem',
    padding: '0.875rem 1rem',
    background: 'none',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.12s',
  },
  menuOptionLabel: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#111',
  },
  menuOptionDestructive: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.2rem',
    padding: '0.875rem 1rem',
    background: 'none',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.12s',
    borderTop: '1px solid #f0f0f0',
    marginTop: '0.15rem',
  },
  menuOptionLabelDestructive: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#dc2626',
  },
  menuOptionDesc: {
    fontSize: '0.8rem',
    color: '#888',
  },
  confirmBody: {
    padding: '1.25rem 1.5rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  confirmText: {
    margin: 0,
    fontSize: '0.95rem',
    color: '#111',
    lineHeight: 1.5,
  },
  confirmSubText: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#666',
  },
  confirmBtns: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '0.5rem',
  },
  cancelBtn: {
    flex: 1,
    padding: '0.7rem 1rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    backgroundColor: '#f5f5f5',
    color: '#333',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  confirmResetBtn: {
    flex: 1,
    padding: '0.7rem 1rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  loadingDot: {
    fontWeight: 400,
    color: '#aaa',
  },
  modalBody: {
    overflowY: 'auto',
    flex: 1,
  },
  emptyMsg: {
    margin: 0,
    padding: '1.5rem',
    color: '#888',
    fontSize: '0.9rem',
  },
  progressSummary: {
    margin: 0,
    padding: '0.65rem 1rem',
    fontSize: '0.78rem',
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
  },

  // Word table (shared by Progress and Hidden views)
  tableWrap: {
    overflow: 'hidden',
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
    top: 0,
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
    top: 0,
  },
  thRight: {
    padding: '0.6rem 0.5rem',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '36px',
    position: 'sticky',
    top: 0,
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

  // Custom Quiz selector overlay
  selectorOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: '#f8f8f6',
    zIndex: 150,
    display: 'flex',
    flexDirection: 'column',
  },
  selectorHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0 1rem',
    height: '56px',
    borderBottom: '1px solid #e5e5e5',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  selectorBackBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1.2rem',
    color: '#555',
    cursor: 'pointer',
    padding: '0.5rem 0.25rem',
    flexShrink: 0,
    lineHeight: 1,
  },
  selectorThemeWrap: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
  },
  selectorThemePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    border: '1.5px solid #d1d5db',
    borderRadius: '20px',
    padding: '0.3rem 0.75rem',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  selectorThemeSelect: {
    border: 'none',
    background: 'none',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#111',
    cursor: 'pointer',
    outline: 'none',
    WebkitAppearance: 'none',
    appearance: 'none',
    textAlign: 'center',
    fontFamily: 'system-ui, sans-serif',
    maxWidth: '160px',
  },
  selectorThemeChevron: {
    fontSize: '0.85rem',
    color: '#666',
    lineHeight: 1,
    flexShrink: 0,
    pointerEvents: 'none',
  },
  startQuizBtn: {
    padding: '0.4rem 0.875rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    backgroundColor: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  startQuizBtnDisabled: {
    padding: '0.4rem 0.875rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    backgroundColor: '#e5e5e5',
    color: '#aaa',
    border: 'none',
    borderRadius: '20px',
    cursor: 'default',
    flexShrink: 0,
  },
  selectorBody: {
    flex: 1,
    overflowY: 'auto',
  },
  selectorRow: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '0.75rem 1.25rem',
    border: 'none',
    borderBottom: '1px solid #f0f0f0',
    cursor: 'pointer',
    textAlign: 'left',
    gap: '0.75rem',
    transition: 'background-color 0.1s',
  },
  selectorEn: {
    flex: 1,
    fontSize: '0.9rem',
    color: '#333',
  },
  selectorEs: {
    flex: 1,
    fontSize: '0.9rem',
    fontWeight: 500,
    color: '#111',
  },
  selectorCheck: {
    fontSize: '0.9rem',
    color: '#16a34a',
    fontWeight: 700,
    flexShrink: 0,
  },
  selectorEmptyMsg: {
    padding: '1.5rem',
    color: '#888',
    fontSize: '0.9rem',
    margin: 0,
  },
  selectorTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
    tableLayout: 'fixed',
  },
  selectorThLeft: {
    padding: '0.6rem 0.75rem',
    textAlign: 'left',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    position: 'sticky',
    top: 0,
  },
  selectorThCenter: {
    padding: '0.5rem 0.25rem',
    textAlign: 'center',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#888',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '28px',
    position: 'sticky',
    top: 0,
  },
  selectorThCheck: {
    padding: '0.6rem 0.5rem',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '28px',
    position: 'sticky',
    top: 0,
  },
  selectorThHide: {
    padding: '0.6rem 0.5rem',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    width: '36px',
    position: 'sticky',
    top: 0,
  },
  selectorTableRow: {
    borderBottom: '1px solid #f5f5f5',
    cursor: 'pointer',
  },
  selectorTdEn: {
    padding: '0.55rem 0.75rem',
    color: '#333',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  selectorTdEs: {
    padding: '0.55rem 0.75rem',
    fontWeight: 500,
    color: '#111',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  selectorStageCell: {
    padding: '0.55rem 0.25rem',
    textAlign: 'center',
  },
  selectorCheckCell: {
    padding: '0.55rem 0.25rem',
    textAlign: 'center',
  },
  selectorHideCell: {
    padding: '0.55rem 0.5rem',
    textAlign: 'right',
  },
  selectorHideBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px',
    lineHeight: 0,
    borderRadius: '4px',
  },

  // Global stage selector row
  globalStageRow: {
    display: 'flex', flexWrap: 'wrap', gap: '0.4rem',
    padding: '0.5rem 1rem',
    borderBottom: '1px solid #e5e5e5',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  globalStageBtn: {
    padding: '0.28rem 0.65rem', fontSize: '0.78rem', fontWeight: 600,
    border: '1.5px solid #e5e5e5', borderRadius: '20px',
    backgroundColor: '#fafafa', color: '#555', cursor: 'pointer', lineHeight: 1.4,
  },
  globalStageBtnActive: { backgroundColor: '#111', color: '#fff', borderColor: '#111' },

  // Per-word stage toggle columns
  selectorThStage: {
    padding: '0.5rem 0.1rem', textAlign: 'center', fontSize: '0.68rem', fontWeight: 700,
    color: '#aaa', borderBottom: '1px solid #f0f0f0', backgroundColor: '#fafafa',
    width: '38px', position: 'sticky', top: 0,
  },
  stageToggleBtn: {
    width: '30px', height: '22px', fontSize: '0.65rem', fontWeight: 700,
    border: '1.5px solid #e5e5e5', borderRadius: '4px',
    backgroundColor: '#fafafa', color: '#bbb', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto', padding: 0,
  },
  stageToggleBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6', color: '#fff' },
}
