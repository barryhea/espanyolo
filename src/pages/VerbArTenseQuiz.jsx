import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import NavBar from '../components/NavBar'
import { ConjDragRound } from './VerbDragMatch'

// ── Constants ─────────────────────────────────────────────────────────────────

const PRONOUNS = [
  { key: 'yo',       label: 'Yo',            english: 'I'        },
  { key: 'tu',       label: 'Tú',            english: 'You'      },
  { key: 'el',       label: 'Él / Ella',     english: 'He / She' },
  { key: 'nosotros', label: 'Nosotros',      english: 'We'       },
  { key: 'ellos',    label: 'Ellos / Ellas', english: 'They'     },
]

// Accepted typed forms for pronouns that cover two people (either half is correct)
const PRONOUN_ALTERNATIVES = {
  el:    ['el', 'ella'],
  ellos: ['ellos', 'ellas'],
}

const TENSE_CFG = {
  t1: { conjKey: 'present_conjugations', label: 'Present Tense',  cjCol: 't1_cj_stage', scoreCol: 't1_score' },
  t2: { conjKey: 'past_conjugations',    label: 'Past Tense',     cjCol: 't2_cj_stage', scoreCol: 't2_score' },
  t3: { conjKey: 'future_conjugations',  label: 'Future Tense',   cjCol: 't3_cj_stage', scoreCol: 't3_score' },
}

// Pass thresholds per sub-stage (0-indexed)
const SUB_THRESHOLD = { 0: 5, 1: 3, 2: 3, 3: 5 }
const SUB_LABEL     = ['Drag & Match', 'Multiple Choice', 'Pronoun', 'Full Conjugation']

// Stage 2 MC requires each subject pronoun to be answered correctly this many times
const STAGE2_PER_PRONOUN_THRESHOLD = 5

// localStorage key for the one-time Stage 2 data reset
const STAGE2_RESET_KEY = 'ar-t1-stage2-reset-v2'

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Reorder so no two adjacent questions share the same pronoun key.
// Uses a greedy forward-swap: when a repeat is found, find the nearest
// later item with a different pronoun and swap it into position.
function noConsecutivePronoun(arr) {
  const result = [...arr]
  for (let i = 1; i < result.length; i++) {
    if (result[i].pronoun.key === result[i - 1].pronoun.key) {
      for (let j = i + 1; j < result.length; j++) {
        if (result[j].pronoun.key !== result[i - 1].pronoun.key) {
          ;[result[i], result[j]] = [result[j], result[i]]
          break
        }
      }
    }
  }
  return result
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((_, j) => j === 0 ? i : 0))
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    }
  }
  return dp[m][n]
}

function normalise(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9\s]/g, '').toLowerCase().trim()
}

function fuzzyMatch(typed, correct) {
  const a = normalise(typed), b = normalise(correct)
  if (a === b) return 'exact'
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 'exact'
  return (1 - levenshtein(a, b) / maxLen) >= 0.8 ? 'close' : 'wrong'
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function VerbArTenseQuiz() {
  const navigate  = useNavigate()
  const { user }  = useAuth()

  const [phase,         setPhase]         = useState('loading')
  const [allVerbs,      setAllVerbs]      = useState([])
  const [activeTense,   setActiveTense]   = useState(null)   // 't1'|'t2'|'t3'
  const [activeSub,     setActiveSub]     = useState(0)      // 0-3
  const [roundVerb,     setRoundVerb]     = useState(null)
  const [dragCount,     setDragCount]     = useState(0)
  const [dragBlockResults,    setDragBlockResults]    = useState([])          // correct/wrong per round in current 5-round block
  const [blockPronounCounts,  setBlockPronounCounts]  = useState([0,0,0,0,0]) // correct per pronoun in the current 5-round block
  const [dragRoundsThisTense, setDragRoundsThisTense] = useState(0)           // total drag rounds for current tense
  const [session,       setSession]       = useState([])
  const [currentIdx,    setCurrentIdx]    = useState(0)
  const [question,      setQuestion]      = useState(null)
  const [selectedOpt,   setSelectedOpt]   = useState(null)
  const [typedAnswer,   setTypedAnswer]   = useState('')
  const [typedAnswer2,  setTypedAnswer2]  = useState('')
  const [typedAnswer3,  setTypedAnswer3]  = useState('')  // third input for Stage 4 triple-pronoun (conjugation)
  const [matchResult,   setMatchResult]   = useState(null)
  // Per-field result for Stage 4 — true=correct(locked), false=wrong(editable), null=not yet submitted
  const [f1Ok, setF1Ok] = useState(null)
  const [f2Ok, setF2Ok] = useState(null)
  const [f3Ok, setF3Ok] = useState(null)
  const [results,       setResults]       = useState([])
  // Per-pronoun correct counts for Stages 2–4 — per-pronoun, not per-verb
  const [stage2PronounCounts, setStage2PronounCounts] = useState({ yo: 0, tu: 0, el: 0, nosotros: 0, ellos: 0 })
  const [stage3PronounCounts, setStage3PronounCounts] = useState({ yo: 0, tu: 0, el: 0, nosotros: 0, ellos: 0 })
  const [stage4PronounCounts, setStage4PronounCounts] = useState({ yo: 0, tu: 0, el: 0, nosotros: 0, ellos: 0 })

  const progressRef = useRef({})
  const inputRef    = useRef(null)
  const inputRef2   = useRef(null)
  const inputRef3   = useRef(null)

  useEffect(() => { if (user) loadQuiz() }, [user?.id])

  useEffect(() => {
    const isTyped = question?.type === 'conj-typed-pron' || question?.type === 'conj-typed-dual'
    if (isTyped && phase === 'question') {
      inputRef.current?.focus({ preventScroll: true })
    }
  }, [question, phase])

  useEffect(() => {
    setDragBlockResults([])
    setBlockPronounCounts([0, 0, 0, 0, 0])
    setDragRoundsThisTense(0)
  }, [activeTense])

  // On entering a pronoun sub-stage, restore counts from localStorage (persists across page navigations)
  useEffect(() => {
    const load = (sub) => {
      try { return JSON.parse(localStorage.getItem(`verb-ar-cj-${user?.id}-${activeTense}-${sub}`) ?? 'null') } catch { return null }
    }
    const zero = { yo: 0, tu: 0, el: 0, nosotros: 0, ellos: 0 }
    if (activeSub === 1) setStage2PronounCounts(load(1) ?? zero)
    if (activeSub === 2) setStage3PronounCounts(load(2) ?? zero)
    if (activeSub === 3) setStage4PronounCounts(load(3) ?? zero)
  }, [activeSub, activeTense])

  // One-time reset: clears any Stage 2 (MC) progress recorded under the old per-verb scoring
  // so the correct per-pronoun threshold takes effect from a clean slate.
  useEffect(() => {
    if (!user?.id) return
    const key = `${STAGE2_RESET_KEY}-${user.id}`
    if (localStorage.getItem(key)) return
    resetStage2Present()
  }, [user?.id])

  async function resetStage2Present() {
    const { data: verbData } = await supabase.from('verbs').select('id').eq('category', 'Verbs -AR')
    if (!verbData?.length) {
      localStorage.setItem(`${STAGE2_RESET_KEY}-${user.id}`, '1')
      return
    }
    const verbIds = verbData.map(v => v.id)
    // Reset t1_cj_stage back to 1 (start of Stage 2) and clear t1_score for verbs that
    // had entered or passed Stage 2 under the old scoring.
    const { error } = await supabase
      .from('user_verb_progress')
      .update({ t1_cj_stage: 1, t1_score: 0 })
      .eq('user_id', user.id)
      .in('verb_id', verbIds)
      .gte('t1_cj_stage', 1)
    if (error) {
      // Column may not exist yet — fall back to resetting only t1_score
      console.warn('[VerbArTenseQuiz] Stage 2 reset (full) failed, falling back to score-only:', error.message)
      await supabase
        .from('user_verb_progress')
        .update({ t1_score: 0 })
        .eq('user_id', user.id)
        .in('verb_id', verbIds)
    }
    localStorage.setItem(`${STAGE2_RESET_KEY}-${user.id}`, '1')
  }

  function savePronounCounts(tenseKey, subStage, counts) {
    try { localStorage.setItem(`verb-ar-cj-${user?.id}-${tenseKey}-${subStage}`, JSON.stringify(counts)) } catch {}
  }

  // Advance all verbs from fromSub → fromSub+1 in memory and DB when per-pronoun threshold is met
  function advanceAllVerbsFromSub(tenseKey, fromSub) {
    const cfg = TENSE_CFG[tenseKey]
    for (const verb of allVerbs.filter(v => !progressRef.current[v.id]?.hidden)) {
      const prog = progressRef.current[verb.id] ?? {}
      if ((prog[cfg.cjCol] ?? 0) === fromSub) {
        progressRef.current[verb.id] = { ...prog, [cfg.cjCol]: fromSub + 1, [cfg.scoreCol]: 0 }
        saveProgress(verb.id)
      }
    }
  }

  async function loadQuiz() {
    setPhase('loading')

    const { data: verbData } = await supabase
      .from('verbs')
      .select('id, english, spanish_infinitive, present_conjugations, past_conjugations, future_conjugations')
      .eq('category', 'Verbs -AR')

    if (!verbData?.length) { setPhase('error'); return }
    setAllVerbs(verbData)

    const verbIds = verbData.map(v => v.id)
    const { data: progressData } = await supabase
      .from('user_verb_progress')
      .select('id, verb_id, t1_score, t2_score, t3_score, t1_cj_stage, t2_cj_stage, t3_cj_stage, hidden, l1_incorrect, l2_incorrect, l3_incorrect, l4_incorrect, l1_resets, l2_resets, l3_resets, l4_resets, total_incorrect')
      .eq('user_id', user.id)
      .in('verb_id', verbIds)

    const progMap = {}
    for (const p of progressData ?? []) {
      progMap[p.verb_id] = {
        db_id:       p.id,
        t1_score:    p.t1_score    ?? 0,
        t2_score:    p.t2_score    ?? 0,
        t3_score:    p.t3_score    ?? 0,
        t1_cj_stage: p.t1_cj_stage ?? 0,
        t2_cj_stage: p.t2_cj_stage ?? 0,
        t3_cj_stage: p.t3_cj_stage ?? 0,
        hidden:      p.hidden      ?? false,
        l1_incorrect: p.l1_incorrect ?? 0,
        l2_incorrect: p.l2_incorrect ?? 0,
        l3_incorrect: p.l3_incorrect ?? 0,
        l4_incorrect: p.l4_incorrect ?? 0,
        l1_resets:    p.l1_resets    ?? 0,
        l2_resets:    p.l2_resets    ?? 0,
        l3_resets:    p.l3_resets    ?? 0,
        l4_resets:    p.l4_resets    ?? 0,
        total_incorrect: p.total_incorrect ?? 0,
      }
    }

    // Merge in-memory progression so in-session advancement survives DB re-fetches
    // (handles the case where cj_stage columns don't exist in DB yet)
    for (const verbId in progressRef.current) {
      if (progMap[verbId]) {
        const prev = progressRef.current[verbId]
        progMap[verbId].t1_cj_stage = Math.max(progMap[verbId].t1_cj_stage ?? 0, prev.t1_cj_stage ?? 0)
        progMap[verbId].t2_cj_stage = Math.max(progMap[verbId].t2_cj_stage ?? 0, prev.t2_cj_stage ?? 0)
        progMap[verbId].t3_cj_stage = Math.max(progMap[verbId].t3_cj_stage ?? 0, prev.t3_cj_stage ?? 0)
        progMap[verbId].t1_score    = Math.max(progMap[verbId].t1_score    ?? 0, prev.t1_score    ?? 0)
        progMap[verbId].t2_score    = Math.max(progMap[verbId].t2_score    ?? 0, prev.t2_score    ?? 0)
        progMap[verbId].t3_score    = Math.max(progMap[verbId].t3_score    ?? 0, prev.t3_score    ?? 0)
        progMap[verbId].l1_incorrect = Math.max(progMap[verbId].l1_incorrect ?? 0, prev.l1_incorrect ?? 0)
        progMap[verbId].l2_incorrect = Math.max(progMap[verbId].l2_incorrect ?? 0, prev.l2_incorrect ?? 0)
        progMap[verbId].l3_incorrect = Math.max(progMap[verbId].l3_incorrect ?? 0, prev.l3_incorrect ?? 0)
        progMap[verbId].l4_incorrect = Math.max(progMap[verbId].l4_incorrect ?? 0, prev.l4_incorrect ?? 0)
        progMap[verbId].l1_resets    = Math.max(progMap[verbId].l1_resets    ?? 0, prev.l1_resets    ?? 0)
        progMap[verbId].l2_resets    = Math.max(progMap[verbId].l2_resets    ?? 0, prev.l2_resets    ?? 0)
        progMap[verbId].l3_resets    = Math.max(progMap[verbId].l3_resets    ?? 0, prev.l3_resets    ?? 0)
        progMap[verbId].l4_resets    = Math.max(progMap[verbId].l4_resets    ?? 0, prev.l4_resets    ?? 0)
        progMap[verbId].total_incorrect = Math.max(progMap[verbId].total_incorrect ?? 0, prev.total_incorrect ?? 0)
      }
    }
    progressRef.current = progMap

    const visible = verbData.filter(v => !progMap[v.id]?.hidden)

    const t1Done = visible.every(v => (progMap[v.id]?.t1_cj_stage ?? 0) >= 4)
    const t2Done = t1Done && visible.every(v => (progMap[v.id]?.t2_cj_stage ?? 0) >= 4)
    const t3Done = t2Done && visible.every(v => (progMap[v.id]?.t3_cj_stage ?? 0) >= 4)

    if (t3Done) { setPhase('all-done'); return }

    const tenseKey = !t1Done ? 't1' : !t2Done ? 't2' : 't3'
    const cfg      = TENSE_CFG[tenseKey]
    setActiveTense(tenseKey)

    // Active sub-stage = minimum across visible verbs for this tense
    const minSub = Math.min(...visible.map(v => Math.min(progMap[v.id]?.[cfg.cjCol] ?? 0, 3)))
    setActiveSub(minSub)

    const needsWork = visible.filter(v => (progMap[v.id]?.[cfg.cjCol] ?? 0) === minSub)

    if (minSub === 0) {
      // Stage 1: drag & match — pick one verb
      const verb = shuffle(needsWork)[0]
      setRoundVerb(verb)
      setPhase('drag')
    } else {
      startSession(minSub, tenseKey, needsWork, verbData, progMap)
    }
  }

  function startSession(subStage, tenseKey, needsWork, allVerbData, progMap) {
    const cfg  = TENSE_CFG[tenseKey]
    let sess   = []

    if (subStage === 1) {
      // Stage 2 MC: show conjugated form → pick correct subject pronoun from 4 options
      for (let rep = 0; sess.length < Math.max(15, needsWork.length); rep++) {
        for (const verb of shuffle(needsWork)) {
          if (sess.length >= Math.max(15, needsWork.length * 3)) break
          const pronoun = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)]
          const form    = verb[cfg.conjKey]?.[pronoun.key] ?? ''
          const distractors = shuffle(PRONOUNS.filter(p => p.key !== pronoun.key)).slice(0, 3)
          sess.push({
            type: 'conj-mc',
            verb, pronoun,
            prompt: `${form}  ·  ${verb.spanish_infinitive}`,
            correct: pronoun.label,
            options: shuffle([pronoun.label, ...distractors.map(p => p.label)]),
            tenseKey,
          })
        }
      }
    } else if (subStage === 2) {
      // Stage 3 Typed: show conjugated form → type the subject pronoun in Spanish
      for (let rep = 0; sess.length < Math.max(15, needsWork.length); rep++) {
        for (const verb of shuffle(needsWork)) {
          if (sess.length >= Math.max(15, needsWork.length * 3)) break
          const pronoun = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)]
          const form    = verb[cfg.conjKey]?.[pronoun.key] ?? ''
          sess.push({
            type: 'conj-typed-pron',
            verb, pronoun,
            prompt: `${form}  ·  ${verb.spanish_infinitive}`,
            correct: pronoun.key,
            correctCandidates: PRONOUN_ALTERNATIVES[pronoun.key] ?? [pronoun.key],
            multiInput: !!PRONOUN_ALTERNATIVES[pronoun.key],
            placeholder: 'Type the subject pronoun…',
            tenseKey,
          })
        }
      }
    } else if (subStage === 3) {
      // Stage 4 Dual typed: show English phrase (e.g. "I drink") → type pronoun + conjugated form
      for (let rep = 0; sess.length < Math.max(15, needsWork.length); rep++) {
        for (const verb of shuffle(needsWork)) {
          if (sess.length >= Math.max(15, needsWork.length * 3)) break
          const pronoun     = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)]
          const form        = verb[cfg.conjKey]?.[pronoun.key] ?? ''
          const verbEnglish = verb.english.split('/')[0].replace(/\s*\(.*?\)\s*/g, '').trim()
          const tLabel      = cfg.label.replace(' Tense', '')
          sess.push({
            type: 'conj-typed-dual',
            verb, pronoun,
            prompt: `${pronoun.english} ${verbEnglish}  (${tLabel})`,
            correctPronoun:           pronoun.key,
            correctPronounCandidates: PRONOUN_ALTERNATIVES[pronoun.key] ?? [pronoun.key],
            tripleInput:              !!PRONOUN_ALTERNATIVES[pronoun.key],
            correctConjugation:       form,
            tenseKey,
          })
        }
      }
    }

    sess = noConsecutivePronoun(shuffle(sess).slice(0, Math.max(15, needsWork.length * 2)))
    if (!sess.length) { loadQuiz(); return }

    setSession(sess)
    setCurrentIdx(0)
    setResults([])
    setSelectedOpt(null)
    setTypedAnswer('')
    setTypedAnswer2('')
    setTypedAnswer3('')
    setMatchResult(null)
    setF1Ok(null); setF2Ok(null); setF3Ok(null)
    setQuestion(sess[0])
    setPhase('question')
  }

  // ── Progress ──────────────────────────────────────────────────────────────

  async function saveProgress(verbId) {
    const prog = progressRef.current[verbId]
    if (!prog) return

    const trackingPayload = {
      l1_incorrect: prog.l1_incorrect ?? 0,
      l2_incorrect: prog.l2_incorrect ?? 0,
      l3_incorrect: prog.l3_incorrect ?? 0,
      l4_incorrect: prog.l4_incorrect ?? 0,
      l1_resets:    prog.l1_resets    ?? 0,
      l2_resets:    prog.l2_resets    ?? 0,
      l3_resets:    prog.l3_resets    ?? 0,
      l4_resets:    prog.l4_resets    ?? 0,
      total_incorrect: prog.total_incorrect ?? 0,
    }
    const scorePayload = {
      t1_score: prog.t1_score ?? 0,
      t2_score: prog.t2_score ?? 0,
      t3_score: prog.t3_score ?? 0,
      ...trackingPayload,
    }
    const fullPayload = {
      ...scorePayload,
      t1_cj_stage: prog.t1_cj_stage ?? 0,
      t2_cj_stage: prog.t2_cj_stage ?? 0,
      t3_cj_stage: prog.t3_cj_stage ?? 0,
    }

    if (prog.db_id) {
      const { error } = await supabase.from('user_verb_progress').update(fullPayload).eq('id', prog.db_id)
      if (error) {
        // cj_stage columns may not exist yet — save scores at minimum
        await supabase.from('user_verb_progress').update(scorePayload).eq('id', prog.db_id)
      }
    } else {
      const { data, error } = await supabase.from('user_verb_progress')
        .upsert({ user_id: user.id, verb_id: verbId, current_stage: 4, l4_score: 5, ...fullPayload }, { onConflict: 'user_id,verb_id' })
        .select('id').single()
      if (error) {
        const { data: d2 } = await supabase.from('user_verb_progress')
          .upsert({ user_id: user.id, verb_id: verbId, current_stage: 4, l4_score: 5, ...scorePayload }, { onConflict: 'user_id,verb_id' })
          .select('id').single()
        if (d2) progressRef.current[verbId] = { ...progressRef.current[verbId], db_id: d2.id }
      } else {
        if (data) progressRef.current[verbId] = { ...progressRef.current[verbId], db_id: data.id }
      }
    }
  }

  function recordAnswer(verbId, tenseKey, correct) {
    const prog      = progressRef.current[verbId] ?? {}
    const cfg       = TENSE_CFG[tenseKey]
    const curStage  = prog[cfg.cjCol]    ?? 0
    const curScore  = prog[cfg.scoreCol] ?? 0
    const threshold = SUB_THRESHOLD[curStage] ?? 5

    if (correct) {
      const newScore = curScore + 1
      if (newScore >= threshold) {
        progressRef.current[verbId] = { ...prog, [cfg.cjCol]: curStage + 1, [cfg.scoreCol]: 0 }
      } else {
        progressRef.current[verbId] = { ...prog, [cfg.scoreCol]: newScore }
      }
    } else {
      progressRef.current[verbId] = { ...prog, [cfg.scoreCol]: 0 }
    }
    saveProgress(verbId)
  }

  // ── Drag round ────────────────────────────────────────────────────────────

  function pickNextDragVerb() {
    if (!activeTense) return
    const cfg = TENSE_CFG[activeTense]
    const visible = allVerbs.filter(v => !progressRef.current[v.id]?.hidden)
    const needsWork = visible.filter(v => (progressRef.current[v.id]?.[cfg.cjCol] ?? 0) === 0)
    if (!needsWork.length) { loadQuiz(); return }
    setRoundVerb(shuffle(needsWork)[0])
    setPhase('drag')
  }

  async function handleDragComplete(correct, perPronounResults) {
    if (!roundVerb || !activeTense) return
    if (!correct) {
      const prog = progressRef.current[roundVerb.id] ?? {}
      progressRef.current[roundVerb.id] = { ...prog, l1_incorrect: (prog.l1_incorrect ?? 0) + 1, total_incorrect: (prog.total_incorrect ?? 0) + 1 }
      saveProgress(roundVerb.id)
    }
    if (correct) recordAnswer(roundVerb.id, activeTense, true)

    const newBlockCounts = blockPronounCounts.map((cnt, i) => cnt + (Array.isArray(perPronounResults) && perPronounResults[i] ? 1 : 0))
    setBlockPronounCounts(newBlockCounts)
    setDragRoundsThisTense(prev => prev + 1)

    const newBlockResults = [...dragBlockResults, correct]
    const newCount = dragCount + 1
    setDragCount(newCount)

    if (newCount % 5 === 0) {
      if (newBlockCounts.every(c => c >= STAGE2_PER_PRONOUN_THRESHOLD)) {
        advanceAllVerbsFromSub(activeTense, 0)
      }
      setDragBlockResults([])
      setPhase('drag-summary')
    } else {
      setDragBlockResults(newBlockResults)
      pickNextDragVerb()
    }
  }

  // ── MC answer ─────────────────────────────────────────────────────────────

  function handleMC(option) {
    if (phase !== 'question') return
    const correct = option === question.correct

    if (activeSub === 1) {
      if (correct) {
        const key = question.pronoun.key
        const newCounts = { ...stage2PronounCounts, [key]: (stage2PronounCounts[key] ?? 0) + 1 }
        setStage2PronounCounts(newCounts)
        savePronounCounts(question.tenseKey, 1, newCounts)
        if (PRONOUNS.every(p => (newCounts[p.key] ?? 0) >= STAGE2_PER_PRONOUN_THRESHOLD)) {
          advanceAllVerbsFromSub(question.tenseKey, 1)
        }
      } else {
        const verbId = question.verb.id
        const prog = progressRef.current[verbId] ?? {}
        progressRef.current[verbId] = { ...prog, l2_incorrect: (prog.l2_incorrect ?? 0) + 1, total_incorrect: (prog.total_incorrect ?? 0) + 1 }
        saveProgress(verbId)
      }
    } else {
      if (!correct) {
        const verbId = question.verb.id
        const prog = progressRef.current[verbId] ?? {}
        progressRef.current[verbId] = { ...prog, l2_incorrect: (prog.l2_incorrect ?? 0) + 1, total_incorrect: (prog.total_incorrect ?? 0) + 1 }
      }
      recordAnswer(question.verb.id, question.tenseKey, correct)
    }

    setSelectedOpt(option)
    setResults(r => [...r, { verb: question.verb, pronoun: question.pronoun, correct }])
    setPhase('feedback')
  }

  // ── Typed answer ──────────────────────────────────────────────────────────

  function handleTyped() {
    const verbId = question.verb.id

    if (question.type === 'conj-typed-pron') {
      const cands = question.correctCandidates ?? [question.correct]
      let result
      if (question.multiInput) {
        // Order-independent: each input must match a different candidate
        const r00 = fuzzyMatch(typedAnswer,  cands[0])
        const r01 = fuzzyMatch(typedAnswer,  cands[1])
        const r10 = fuzzyMatch(typedAnswer2, cands[0])
        const r11 = fuzzyMatch(typedAnswer2, cands[1])
        const aOk = r00 !== 'wrong' && r11 !== 'wrong'
        const bOk = r01 !== 'wrong' && r10 !== 'wrong'
        const ok  = aOk || bOk
        const allExact = (aOk && r00 === 'exact' && r11 === 'exact') || (bOk && r01 === 'exact' && r10 === 'exact')
        result = !ok ? 'wrong' : allExact ? 'exact' : 'close'
      } else {
        result = cands
          .map(c => fuzzyMatch(typedAnswer, c))
          .reduce((best, r) => r === 'exact' ? 'exact' : best === 'exact' ? 'exact' : r === 'close' ? 'close' : best, 'wrong')
      }
      const correct = result !== 'wrong'
      if (!correct) {
        const prog = progressRef.current[verbId] ?? {}
        progressRef.current[verbId] = { ...prog, l3_incorrect: (prog.l3_incorrect ?? 0) + 1, total_incorrect: (prog.total_incorrect ?? 0) + 1 }
      }
      recordAnswer(verbId, question.tenseKey, correct)
      // Per-pronoun tracking — 5 correct per pronoun to pass, independent of verb count
      if (correct) {
        const key = question.pronoun.key
        const newCounts = { ...stage3PronounCounts, [key]: (stage3PronounCounts[key] ?? 0) + 1 }
        setStage3PronounCounts(newCounts)
        savePronounCounts(question.tenseKey, 2, newCounts)
        if (PRONOUNS.every(p => (newCounts[p.key] ?? 0) >= STAGE2_PER_PRONOUN_THRESHOLD)) {
          advanceAllVerbsFromSub(question.tenseKey, 2)
        }
      }
      setMatchResult(result)
      setResults(r => [...r, { verb: question.verb, pronoun: question.pronoun, correct, matchResult: result }])
      setPhase('feedback')
      if (!correct) { setTypedAnswer(''); if (question.multiInput) setTypedAnswer2('') }
      return
    }

    if (question.type === 'conj-typed-dual') {
      let result, newF1Ok, newF2Ok, newF3Ok
      if (question.tripleInput) {
        // 3 inputs: pron1 + pron2 (order-independent) + conjugation
        const cands = question.correctPronounCandidates
        const r00 = fuzzyMatch(typedAnswer,  cands[0])
        const r01 = fuzzyMatch(typedAnswer,  cands[1])
        const r10 = fuzzyMatch(typedAnswer2, cands[0])
        const r11 = fuzzyMatch(typedAnswer2, cands[1])
        const aOk = r00 !== 'wrong' && r11 !== 'wrong'
        const bOk = r01 !== 'wrong' && r10 !== 'wrong'
        const pronOk    = aOk || bOk
        const conjResult = fuzzyMatch(typedAnswer3, question.correctConjugation)
        const conjOk    = conjResult !== 'wrong'
        if (!pronOk || !conjOk) {
          result = 'wrong'
        } else {
          const allExact = conjResult === 'exact' && (
            (aOk && r00 === 'exact' && r11 === 'exact') ||
            (bOk && r01 === 'exact' && r10 === 'exact')
          )
          result = allExact ? 'exact' : 'close'
        }
        newF1Ok = pronOk; newF2Ok = pronOk; newF3Ok = conjOk
      } else {
        // 2 inputs: single pronoun + conjugation
        const pronCands  = question.correctPronounCandidates ?? [question.correctPronoun]
        const pronResult = pronCands
          .map(c => fuzzyMatch(typedAnswer, c))
          .reduce((best, r) => r === 'exact' ? 'exact' : best === 'exact' ? 'exact' : r === 'close' ? 'close' : best, 'wrong')
        const conjResult = fuzzyMatch(typedAnswer2, question.correctConjugation)
        const pronOk = pronResult !== 'wrong'
        const conjOk = conjResult !== 'wrong'
        result = pronOk && conjOk
          ? (pronResult === 'exact' && conjResult === 'exact' ? 'exact' : 'close')
          : 'wrong'
        newF1Ok = pronOk; newF2Ok = conjOk; newF3Ok = null
      }
      const correct = result !== 'wrong'
      if (!correct) {
        const prog = progressRef.current[verbId] ?? {}
        progressRef.current[verbId] = { ...prog, l4_incorrect: (prog.l4_incorrect ?? 0) + 1, total_incorrect: (prog.total_incorrect ?? 0) + 1 }
      }
      recordAnswer(verbId, question.tenseKey, correct)
      // Per-pronoun tracking — 5 correct per pronoun to pass, independent of verb count
      if (correct) {
        const key = question.pronoun.key
        const newCounts = { ...stage4PronounCounts, [key]: (stage4PronounCounts[key] ?? 0) + 1 }
        setStage4PronounCounts(newCounts)
        savePronounCounts(question.tenseKey, 3, newCounts)
        if (PRONOUNS.every(p => (newCounts[p.key] ?? 0) >= STAGE2_PER_PRONOUN_THRESHOLD)) {
          advanceAllVerbsFromSub(question.tenseKey, 3)
        }
      }
      setF1Ok(newF1Ok); setF2Ok(newF2Ok); setF3Ok(newF3Ok)
      setMatchResult(result)
      setResults(r => [...r, { verb: question.verb, pronoun: question.pronoun, correct, matchResult: result }])
      setPhase('feedback')
      // Only clear fields that were wrong; correct fields retain their value (shown green+locked)
      if (question.tripleInput) {
        if (!newF1Ok) { setTypedAnswer(''); setTypedAnswer2('') }
        if (!newF3Ok) setTypedAnswer3('')
      } else {
        if (!newF1Ok) setTypedAnswer('')
        if (!newF2Ok) setTypedAnswer2('')
      }
      return
    }
  }

  function handleNext() {
    const nextIdx = currentIdx + 1
    if (nextIdx >= session.length) { setPhase('session-summary'); return }
    setCurrentIdx(nextIdx)
    setQuestion(session[nextIdx])
    setSelectedOpt(null)
    setTypedAnswer('')
    setTypedAnswer2('')
    setTypedAnswer3('')
    setMatchResult(null)
    setF1Ok(null); setF2Ok(null); setF3Ok(null)
    setPhase('question')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'loading') return <div style={s.page}><NavBar /><p style={s.loadingMsg}>Loading…</p></div>

  if (phase === 'error') {
    return (
      <div style={s.page}><NavBar />
        <main style={s.main}>
          <p style={{ color: '#c00' }}>Could not load Verbs -AR.</p>
          <button style={s.backBtn} onClick={() => navigate('/verbs')}>← Back</button>
        </main>
      </div>
    )
  }

  if (phase === 'all-done') {
    return (
      <div style={s.page}><NavBar />
        <main style={s.main}>
          <button style={s.backBtn} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>
          <div style={s.card}><p style={{ margin: 0, color: '#555' }}>All conjugation stages for Verbs -AR are complete. Excellent work!</p></div>
        </main>
      </div>
    )
  }

  const tenseLabel = activeTense ? TENSE_CFG[activeTense].label : ''
  const subLabel   = activeSub < SUB_LABEL.length ? SUB_LABEL[activeSub] : ''

  // ── Drag phase ────────────────────────────────────────────────────────────

  if (phase === 'drag') {
    return (
      <div style={s.scrollPage}><NavBar />
        <main style={s.scrollMain}>
          <div style={s.progressRow}>
            <div style={s.progressBar}>
              <div style={{ display: 'flex', height: '100%' }}>
                {Array.from({ length: 5 }).map((_, i) => {
                  const r = dragBlockResults[i]
                  const bg = r === undefined ? '#e5e5e5' : r ? '#16a34a' : '#dc2626'
                  return <div key={i} style={{ flex: 1, backgroundColor: bg }} />
                })}
              </div>
            </div>
            <span style={s.progressLabel}>{dragBlockResults.length + 1} / 5</span>
          </div>
          <div style={s.phaseRow}>
            <span style={s.tenseTag}>{tenseLabel}</span>
            <span style={s.subTag}>Stage 1 · {subLabel}</span>
          </div>
          {roundVerb && (
            <ConjDragRound
              key={`${roundVerb.id}-${dragCount}`}
              verb={roundVerb}
              conjKey={TENSE_CFG[activeTense].conjKey}
              onComplete={handleDragComplete}
            />
          )}
        </main>
      </div>
    )
  }

  // ── Drag summary ──────────────────────────────────────────────────────────

  if (phase === 'drag-summary') {
    return (
      <div style={s.scrollPage}><NavBar />
        <main style={s.scrollMain}>
          <div style={s.summaryCard}>
            <div style={s.summaryHeader}>
              <span style={s.summaryTitle}>{tenseLabel} · Drag & Match</span>
              <span style={s.summarySub}>Match conjugations to their pronoun</span>
            </div>
            {PRONOUNS.map((p, i) => {
              const count = blockPronounCounts[i]
              return (
                <div key={p.key} style={s.summaryRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.summarySpanish}>{p.label}</div>
                  </div>
                  <div style={s.dots}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <div key={j} style={{
                        width: '11px', height: '11px', borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0,
                        backgroundColor: j < count ? '#16a34a' : 'transparent',
                        border: `2px solid ${j < count ? '#16a34a' : '#d1d5db'}`,
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#aaa', minWidth: '32px', textAlign: 'right', flexShrink: 0 }}>
                    {count} / 5
                  </span>
                </div>
              )
            })}
          </div>
          <button style={{ ...s.primaryBtn, width: '100%' }} onClick={() => { setBlockPronounCounts([0,0,0,0,0]); loadQuiz() }}>Continue</button>
          <button style={s.blueBtn} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>
        </main>
      </div>
    )
  }

  // ── Session summary ───────────────────────────────────────────────────────

  if (phase === 'session-summary') {
    const correct = results.filter(r => r.correct).length
    const pronounRows = PRONOUNS.map(p => {
      const pr = results.filter(r => r.pronoun?.key === p.key)
      return { label: p.label, correct: pr.filter(r => r.correct).length, total: pr.length }
    })
    return (
      <div style={s.page}><NavBar />
        <main style={{ ...s.main, maxWidth: '560px' }}>
          <div style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={s.tenseTag}>{tenseLabel}</span>
              <span style={s.subTagSm}>Stage {activeSub + 1} · {subLabel}</span>
            </div>
            <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.5rem 0 0.75rem', color: '#111' }}>
              {correct} / {results.length} correct
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {pronounRows.map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ width: '90px', fontSize: '0.85rem', color: '#555', flexShrink: 0 }}>
                    {row.label}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} style={{
                        width: '10px', height: '10px', borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0,
                        backgroundColor: i < Math.min(row.correct, 5) ? '#16a34a' : 'transparent',
                        border: `2px solid ${i < Math.min(row.correct, 5) ? '#16a34a' : '#d1d5db'}`,
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#aaa', flexShrink: 0 }}>
                    {row.correct} / {row.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <button style={{ ...s.primaryBtn, width: '100%' }} onClick={loadQuiz}>Continue</button>
          <button style={s.blueBtn} onClick={() => navigate('/verbs')}>← Back to Verb Trainer</button>
        </main>
      </div>
    )
  }

  // ── Question / feedback ───────────────────────────────────────────────────

  // Stage 4 per-field feedback state (recomputed each render)
  const isDualFb  = phase === 'feedback' && question?.type === 'conj-typed-dual'
  const f1Wrong   = isDualFb && f1Ok === false
  const f1Correct = isDualFb && f1Ok === true
  const f2Wrong   = isDualFb && f2Ok === false
  const f2Correct = isDualFb && f2Ok === true
  const f3Wrong   = isDualFb && f3Ok === false
  const f3Correct = isDualFb && f3Ok === true
  const dualInputStyle = (wrong, correct) => ({
    ...s.typedInput,
    ...(wrong   ? { borderColor: '#dc2626', borderWidth: 2 } : {}),
    ...(correct ? { borderColor: '#16a34a', borderWidth: 2, backgroundColor: '#f0fdf4' } : {}),
  })

  const confirmOk = (() => {
    if (phase !== 'feedback' || !matchResult) return true
    if (matchResult !== 'wrong') return true
    if (question?.type === 'conj-typed-pron' && question?.multiInput) {
      const cands = question.correctCandidates
      const r00 = fuzzyMatch(typedAnswer,  cands[0]), r01 = fuzzyMatch(typedAnswer,  cands[1])
      const r10 = fuzzyMatch(typedAnswer2, cands[0]), r11 = fuzzyMatch(typedAnswer2, cands[1])
      return (r00 !== 'wrong' && r11 !== 'wrong') || (r01 !== 'wrong' && r10 !== 'wrong')
    }
    if (question?.type === 'conj-typed-dual') {
      if (matchResult !== 'wrong') return true
      if (question.tripleInput) {
        const cands = question.correctPronounCandidates
        // Pron pair: already locked (f1Ok=true) OR both inputs now form a valid pair
        const pronPairOk = f1Ok === true || (() => {
          const r00 = fuzzyMatch(typedAnswer,  cands[0]), r01 = fuzzyMatch(typedAnswer,  cands[1])
          const r10 = fuzzyMatch(typedAnswer2, cands[0]), r11 = fuzzyMatch(typedAnswer2, cands[1])
          return (r00 !== 'wrong' && r11 !== 'wrong') || (r01 !== 'wrong' && r10 !== 'wrong')
        })()
        const conjOkNow = f3Ok === true || fuzzyMatch(typedAnswer3, question.correctConjugation) !== 'wrong'
        return pronPairOk && conjOkNow
      }
      const pronCands = question.correctPronounCandidates ?? [question.correctPronoun]
      const f1OkNow = f1Ok === true || pronCands.some(c => fuzzyMatch(typedAnswer,  c) !== 'wrong')
      const f2OkNow = f2Ok === true || fuzzyMatch(typedAnswer2, question.correctConjugation) !== 'wrong'
      return f1OkNow && f2OkNow
    }
    const cands = question.correctCandidates ?? [question.correct]
    return cands.some(c => fuzzyMatch(typedAnswer, c) !== 'wrong')
  })()

  return (
    <div style={s.page}><NavBar />
      <main style={s.main}>
        <div style={s.progressRow}>
          <div style={s.progressBar}>
            <div style={{ display: 'flex', height: '100%' }}>
              {session.map((_, i) => {
                const r  = results[i]
                const bg = r ? (r.correct ? '#16a34a' : '#dc2626') : '#e5e5e5'
                return <div key={i} style={{ flex: 1, backgroundColor: bg }} />
              })}
            </div>
          </div>
          <span style={s.progressLabel}>{currentIdx + 1} / {session.length}</span>
        </div>

        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={s.tenseTag}>{tenseLabel}</span>
            <span style={s.subTagSm}>Stage {activeSub + 1} · {subLabel}</span>
          </div>

          <p style={s.word}>{question.prompt}</p>

          {/* Stage 2: MC — show conjugated form, pick subject pronoun */}
          {question.type === 'conj-mc' && (
            <div style={s.optionGrid}>
              {question.options.map(opt => {
                let bg = '#fff'
                if (phase === 'feedback') {
                  if (opt === question.correct) bg = '#dcfce7'
                  else if (opt === selectedOpt) bg = '#fee2e2'
                }
                return (
                  <button
                    key={opt}
                    style={{ ...s.optionBtn, backgroundColor: bg }}
                    onClick={() => phase === 'question' && handleMC(opt)}
                    disabled={phase === 'feedback'}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          )}

          {/* Stage 3: typed pronoun — show form, type subject pronoun */}
          {question.type === 'conj-typed-pron' && (
            <div style={s.typedArea}>
              <input
                ref={inputRef}
                style={{ ...s.typedInput, ...(phase === 'feedback' && matchResult === 'wrong' ? { borderColor: '#3b82f6', borderWidth: 2 } : {}) }}
                type="text"
                value={typedAnswer}
                onChange={e => setTypedAnswer(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (phase === 'question') {
                      if (question.multiInput) inputRef2.current?.focus({ preventScroll: true })
                      else handleTyped()
                    } else if (phase === 'feedback' && matchResult === 'wrong' && confirmOk) handleNext()
                  }
                }}
                disabled={phase === 'feedback' && matchResult !== 'wrong'}
                placeholder={phase === 'feedback' && matchResult === 'wrong'
                  ? (question.multiInput ? `${question.correctCandidates[0]}…` : 'Type the correct pronoun to continue…')
                  : question.placeholder}
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-form-type="other"
              />
              {question.multiInput && (
                <input
                  ref={inputRef2}
                  style={{ ...s.typedInput, ...(phase === 'feedback' && matchResult === 'wrong' ? { borderColor: '#3b82f6', borderWidth: 2 } : {}) }}
                  type="text"
                  value={typedAnswer2}
                  onChange={e => setTypedAnswer2(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (phase === 'question') handleTyped()
                      else if (phase === 'feedback' && matchResult === 'wrong' && confirmOk) handleNext()
                    }
                  }}
                  disabled={phase === 'feedback' && matchResult !== 'wrong'}
                  placeholder={phase === 'feedback' && matchResult === 'wrong'
                    ? `${question.correctCandidates[1]}…`
                    : question.placeholder}
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-form-type="other"
                />
              )}
              {phase === 'question' && (
                <button
                  style={{ ...s.typedBtn, backgroundColor: (typedAnswer.trim() || typedAnswer2.trim()) ? '#16a34a' : '#f59e0b', color: '#fff' }}
                  onClick={handleTyped}
                >
                  {(typedAnswer.trim() || typedAnswer2.trim()) ? 'Check' : 'Pass'}
                </button>
              )}
            </div>
          )}

          {/* Stage 4: dual typed — per-field green/lock correct, red/editable wrong */}
          {question.type === 'conj-typed-dual' && (
            <div style={s.typedArea}>
              {/* Input 1: pronoun (or first of two pronouns for el/ella, ellos/ellas) */}
              <input
                ref={inputRef}
                style={dualInputStyle(f1Wrong, f1Correct)}
                type="text"
                value={typedAnswer}
                onChange={e => setTypedAnswer(e.target.value)}
                onFocus={() => { if (f1Wrong) setTypedAnswer('') }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (phase === 'question') inputRef2.current?.focus({ preventScroll: true })
                    else if (phase === 'feedback' && matchResult === 'wrong' && confirmOk) handleNext()
                  }
                }}
                disabled={isDualFb && (matchResult !== 'wrong' || f1Correct)}
                placeholder={f1Wrong
                  ? (question.tripleInput ? `${question.correctPronounCandidates[0]}…` : `Pronoun — ${question.correctPronoun}`)
                  : (question.tripleInput ? 'First subject pronoun…' : 'Subject pronoun (e.g. yo)')}
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-form-type="other"
              />
              {/* Input 2: second pronoun (tripleInput) or conjugation (non-tripleInput) */}
              <input
                ref={inputRef2}
                style={dualInputStyle(f2Wrong, f2Correct)}
                type="text"
                value={typedAnswer2}
                onChange={e => setTypedAnswer2(e.target.value)}
                onFocus={() => { if (f2Wrong) setTypedAnswer2('') }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (phase === 'question') {
                      if (question.tripleInput) inputRef3.current?.focus({ preventScroll: true })
                      else handleTyped()
                    } else if (phase === 'feedback' && matchResult === 'wrong' && confirmOk) handleNext()
                  }
                }}
                disabled={isDualFb && (matchResult !== 'wrong' || f2Correct)}
                placeholder={f2Wrong
                  ? (question.tripleInput ? `${question.correctPronounCandidates[1]}…` : `Conjugation — ${question.correctConjugation}`)
                  : (question.tripleInput ? 'Second subject pronoun…' : 'Conjugated verb (e.g. hablo)')}
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-form-type="other"
              />
              {/* Input 3: conjugation (tripleInput only) */}
              {question.tripleInput && (
                <input
                  ref={inputRef3}
                  style={dualInputStyle(f3Wrong, f3Correct)}
                  type="text"
                  value={typedAnswer3}
                  onChange={e => setTypedAnswer3(e.target.value)}
                  onFocus={() => { if (f3Wrong) setTypedAnswer3('') }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (phase === 'question') handleTyped()
                      else if (phase === 'feedback' && matchResult === 'wrong' && confirmOk) handleNext()
                    }
                  }}
                  disabled={isDualFb && (matchResult !== 'wrong' || f3Correct)}
                  placeholder={f3Wrong
                    ? `Conjugation — ${question.correctConjugation}`
                    : 'Conjugated verb (e.g. habla)'}
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" data-form-type="other"
                />
              )}
              {phase === 'question' && (
                <button
                  style={{ ...s.typedBtn, backgroundColor: (typedAnswer.trim() || typedAnswer2.trim() || typedAnswer3.trim()) ? '#16a34a' : '#f59e0b', color: '#fff' }}
                  onClick={handleTyped}
                >
                  {(typedAnswer.trim() || typedAnswer2.trim() || typedAnswer3.trim()) ? 'Check' : 'Pass'}
                </button>
              )}
            </div>
          )}

          {phase === 'feedback' && (() => {
            const isMC      = question.type === 'conj-mc'
            const isDual    = question.type === 'conj-typed-dual'
            const isCorrect = isMC ? selectedOpt === question.correct : matchResult !== 'wrong'
            const bannerBg  = isMC
              ? (isCorrect ? '#dcfce7' : '#fee2e2')
              : (matchResult === 'exact' ? '#dcfce7' : matchResult === 'close' ? '#fef3c7' : '#fee2e2')
            const bannerColor = isMC
              ? (isCorrect ? '#16a34a' : '#dc2626')
              : (matchResult === 'exact' ? '#16a34a' : matchResult === 'close' ? '#d97706' : '#dc2626')

            let label
            if (isMC) {
              label = isCorrect ? 'Correct!' : `Incorrect — ${question.correct}`
            } else if (isDual) {
              const pronounLabel = question.tripleInput
                ? question.correctPronounCandidates.join(' / ')
                : question.correctPronoun
              if (matchResult === 'exact') label = 'Correct!'
              else if (matchResult === 'close') label = `Close — ${pronounLabel}  ·  ${question.correctConjugation}`
              else label = `Incorrect — ${pronounLabel}  ·  ${question.correctConjugation}`
            } else {
              const ans = question.multiInput
                ? question.correctCandidates.join(' · ')
                : (question.correct ?? question.correctCandidates?.[0] ?? '')
              if (matchResult === 'exact') label = 'Correct!'
              else if (matchResult === 'close') label = `Close — ${ans}`
              else label = `Incorrect — ${ans}`
            }

            return (
              <div style={{ ...s.feedbackBanner, backgroundColor: bannerBg }}>
                <span style={{ fontWeight: 600, color: bannerColor, fontSize: '0.95rem' }}>{label}</span>
                <button
                  style={{ ...s.nextBtn, ...(confirmOk ? {} : { opacity: 0.35, cursor: 'not-allowed' }) }}
                  onClick={confirmOk ? handleNext : undefined}
                  disabled={!confirmOk}
                >
                  {currentIdx + 1 >= session.length ? 'Finish' : 'Next →'}
                </button>
              </div>
            )
          })()}
        </div>
      </main>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page: {
    position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
    overflow: 'hidden', backgroundColor: '#f8f8f6',
    fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column',
  },
  scrollPage: { minHeight: '100vh', backgroundColor: '#f8f8f6', fontFamily: 'system-ui, sans-serif' },
  scrollMain: {
    maxWidth: '600px', margin: '0 auto', padding: '0.5rem 1.5rem 3rem',
    display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', boxSizing: 'border-box',
  },
  main: {
    maxWidth: '600px', margin: '0 auto', padding: '0.5rem 1.5rem 2rem',
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
    width: '100%', boxSizing: 'border-box', overflowY: 'auto', flex: 1,
    WebkitOverflowScrolling: 'touch',
  },
  loadingMsg: { padding: '3rem 2rem', textAlign: 'center', color: '#888' },
  backBtn: { padding: '0.35rem 0', fontSize: '0.875rem', color: '#555', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' },
  phaseRow: { display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.25rem 0' },
  tenseTag: {
    fontSize: '0.68rem', fontWeight: 700, color: '#3b82f6',
    backgroundColor: '#eff6ff', padding: '0.2rem 0.5rem',
    borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
  },
  subTag:   { fontSize: '0.78rem', color: '#888', fontWeight: 500 },
  subTagSm: { fontSize: '0.72rem', color: '#999', fontWeight: 400 },
  progressRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0' },
  progressBar: { flex: 1, height: '6px', backgroundColor: '#e5e5e5', borderRadius: '3px', overflow: 'hidden' },
  progressLabel: { margin: 0, fontSize: '0.8rem', color: '#888', flexShrink: 0, minWidth: '32px', textAlign: 'right' },
  card: {
    backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
    padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem',
  },
  word: { margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111' },
  optionGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  optionBtn: {
    padding: '0.85rem 1rem', fontSize: '1rem', color: '#111',
    border: '1px solid #e5e5e5', borderRadius: '8px', cursor: 'pointer',
    textAlign: 'left', transition: 'background-color 0.15s',
  },
  typedArea: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  typedInput: { flex: 1, padding: '0.75rem 1rem', fontSize: '1rem', border: '1px solid #ccc', borderRadius: '8px', outline: 'none' },
  typedBtn: { padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600, border: 'none', borderRadius: '8px', cursor: 'pointer', width: '100%' },
  feedbackBanner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', borderRadius: '8px' },
  nextBtn: { padding: '0.5rem 1.25rem', fontSize: '0.9rem', fontWeight: 600, border: 'none', borderRadius: '6px', backgroundColor: '#111', color: '#fff', cursor: 'pointer' },
  primaryBtn: { padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' },
  blueBtn: { padding: '0.75rem 1.25rem', fontSize: '1rem', fontWeight: 600, backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', width: '100%', textAlign: 'center' },
  // Drag styles
  dragCard: { backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  dragHeader: { display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' },
  dragSpanish: { fontSize: '1.4rem', fontWeight: 700, color: '#111' },
  dragEnglish: { fontSize: '0.85rem', color: '#888' },
  dragBank: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '48px', backgroundColor: '#f8f8f6', borderRadius: '8px', padding: '0.5rem', border: '1.5px dashed #e0e0e0', alignItems: 'center' },
  dragChip: { padding: '0.4rem 0.875rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 500, cursor: 'grab', userSelect: 'none', touchAction: 'none', whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(59,130,246,0.3)' },
  dragPairs: { display: 'flex', flexDirection: 'column', gap: '0.625rem' },
  dragPairRow: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  dragPronoun: { flex: 1, fontSize: '0.95rem', color: '#333', fontWeight: 500, minWidth: 0 },
  dragSlot: { width: '130px', minHeight: '40px', borderRadius: '6px', border: '2px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', flexShrink: 0, transition: 'border-color 0.15s, background-color 0.15s' },
  slotCorrect: { borderColor: '#16a34a', borderStyle: 'solid', backgroundColor: '#dcfce7' },
  slotWrong:   { borderColor: '#dc2626', borderStyle: 'solid', backgroundColor: '#fee2e2' },
  chipInSlot: { padding: '0.35rem 0.625rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '5px', fontSize: '0.85rem', fontWeight: 500, cursor: 'grab', userSelect: 'none', touchAction: 'none', whiteSpace: 'nowrap', maxWidth: '118px', overflow: 'hidden', textOverflow: 'ellipsis' },
  chipCorrect: { backgroundColor: '#16a34a', cursor: 'default' },
  chipWrong:   { backgroundColor: '#dc2626', cursor: 'default' },
  checkBtn: { padding: '0.75rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', width: '100%' },
  progressBtnWrap: { position: 'relative', overflow: 'hidden', borderRadius: '8px', backgroundColor: '#dcfce7', cursor: 'pointer', padding: '0.75rem', textAlign: 'center', userSelect: 'none', boxSizing: 'border-box' },
  progressFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#16a34a', transformOrigin: 'left center', transform: 'scaleX(0)', animation: 'cjFill 2.5s linear forwards' },
  progressLabel: { position: 'relative', zIndex: 1, color: '#fff', fontWeight: 600, fontSize: '1rem', textShadow: '0 1px 3px rgba(0,0,0,0.35)' },
  dragChipGhost: { position: 'fixed', padding: '0.4rem 0.875rem', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 500, pointerEvents: 'none', zIndex: 9999, userSelect: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(59,130,246,0.4)', transform: 'scale(1.08)' },
  // Summary
  summaryCard: { backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden' },
  summaryHeader: { padding: '1rem 1.25rem 0.75rem', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '2px' },
  summaryTitle: { fontSize: '0.9rem', fontWeight: 700, color: '#111' },
  summarySub:   { fontSize: '0.75rem', color: '#888' },
  summaryRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1.25rem', borderBottom: '1px solid #f5f5f5' },
  summarySpanish: { fontSize: '0.9rem', fontWeight: 600, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  summaryEnglish: { fontSize: '0.78rem', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  dots: { display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 },
}
