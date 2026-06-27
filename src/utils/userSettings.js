import { supabase } from './supabaseClient'

// Per-user app preferences stored in the `user_settings` table
// (see migration 20260627120000_user_settings.sql).

export const DEFAULT_VOCAB_QUESTION_COUNT = 5
export const MIN_VOCAB_QUESTION_COUNT = 1
export const MAX_VOCAB_QUESTION_COUNT = 100

// Coerce arbitrary input (number, string, NaN, empty) into a valid integer in
// [MIN, MAX]. Non-numeric / empty input falls back to the default.
export function clampQuestionCount(value, fallback = DEFAULT_VOCAB_QUESTION_COUNT) {
  const n = typeof value === 'number' ? value : parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_VOCAB_QUESTION_COUNT, Math.max(MIN_VOCAB_QUESTION_COUNT, Math.trunc(n)))
}

// Read the saved vocab question count for a user. Returns the default when no
// row exists yet.
export async function fetchVocabQuestionCount(userId) {
  if (!userId) return DEFAULT_VOCAB_QUESTION_COUNT
  const { data, error } = await supabase
    .from('user_settings')
    .select('vocab_question_count')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return DEFAULT_VOCAB_QUESTION_COUNT
  return clampQuestionCount(data.vocab_question_count)
}

// Persist the vocab question count (clamped) for a user. Returns the clamped
// value that was written.
export async function saveVocabQuestionCount(userId, value) {
  const clamped = clampQuestionCount(value)
  if (!userId) return clamped
  await supabase
    .from('user_settings')
    .upsert(
      { user_id: userId, vocab_question_count: clamped, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  return clamped
}
