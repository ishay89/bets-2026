'use server'

// Admin-triggered actions for the results page. The manual "Sync now" button
// reuses the exact same runner the cron route calls, so on-demand and scheduled
// syncs behave identically. Dismiss/apply mutate the advisory suggestion rows
// only; actual scoring still goes through the existing scoreMatch action.

import { revalidatePath } from 'next/cache'
import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import { runResultsSync } from '@/lib/result-sync-runner'
import { parseUUID } from '@/lib/validation'

export async function syncResultsAction() {
  await assertAdmin()
  const supabase = createAdminClient()
  await runResultsSync(supabase)
  revalidatePath('/admin/results')
  revalidatePath('/')
  revalidatePath('/predict')
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
