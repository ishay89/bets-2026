'use server'

// Admin-triggered actions for the results page. The repair button reconciles
// display scores for every published finished match, including already-scored
// rows. Dismiss/apply mutate the advisory suggestion rows only; actual scoring
// still goes through the existing scoreMatch action.

import { revalidatePath } from 'next/cache'
import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import { backfillLiveScores } from '@/lib/live-score-backfill'
import { parseUUID } from '@/lib/validation'

export async function backfillLiveScoresAction() {
  await assertAdmin()
  const summary = await backfillLiveScores(createAdminClient())
  if (!summary.ok) {
    throw new Error(summary.reason || summary.errors.join('; ') || 'Live-score repair failed')
  }
  revalidatePath('/admin/results')
  revalidatePath('/')
  revalidatePath('/predict')
  revalidatePath('/board')
  revalidatePath('/leaderboard')
  revalidatePath('/u/[userId]', 'layout')
  revalidatePath('/h2h/[opponentId]', 'layout')
}

export async function dismissSuggestionAction(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()
  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const { error } = await supabase
    .from('match_result_suggestions')
    .update({ status: 'dismissed' })
    .eq('match_id', matchId)
  if (error) throw error
  revalidatePath('/admin/results')
}
