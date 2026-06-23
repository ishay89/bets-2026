'use server'

import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import { parseUUID, parsePick, parseTeamName, parseScorerName } from '@/lib/validation'
import { isValidPikanteriaPick, usersMissingFutures } from '@/lib/ai-picks'
import { canAdminPickForUser, type AdminPickTargetUser } from '@/lib/admin-picks'
import { buildAutomatedFuturesRows } from '@/lib/monkey'
import { TEAMS, SCORERS } from '@/lib/pre-tournament'
import { getAutomatedUsers, isFuturesLocked, isFuturesPublished } from '@/lib/data'
import { shouldWriteAuditEvent, writeAuditEvent, type AuditJson } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function adminPicksPath(userId?: string, notice?: string) {
  const params = new URLSearchParams()
  if (userId) params.set('user', userId)
  if (notice) params.set('notice', notice)
  const query = params.toString()
  return query ? `/admin/ai-picks?${query}` : '/admin/ai-picks'
}

async function requirePickTargetUser(
  supabase: ReturnType<typeof createAdminClient>,
  formData: FormData,
): Promise<AdminPickTargetUser> {
  const userId = parseUUID(formData.get('user_id'), 'user_id')
  const { data: user, error } = await supabase
    .from('users')
    .select('id, display_name, email, status, is_monkey')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error

  const targetUser = user as AdminPickTargetUser | null
  if (!targetUser || !canAdminPickForUser(targetUser)) {
    redirect(adminPicksPath(undefined, 'invalid'))
  }
  return targetUser
}

function finish(userId: string | undefined, notice: string): never {
  revalidatePath('/admin/ai-picks')
  revalidatePath('/predict')
  redirect(adminPicksPath(userId, notice))
}

function pikanteriaValue(
  item: { label_1: string; label_2: string; label_x: string | null; odds_1: number; odds_2: number; odds_x: number | null },
  pick: string,
) {
  if (pick === '1') return { pick, label: item.label_1, odds: item.odds_1 }
  if (pick === '2') return { pick, label: item.label_2, odds: item.odds_2 }
  return { pick, label: item.label_x, odds: item.odds_x }
}

export async function saveAdminMatchPick(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()

  const targetUser = await requirePickTargetUser(supabase, formData)
  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const pick = parsePick(formData.get('pick'), 'pick')

  const { data: match } = await supabase
    .from('matches')
    .select('*, match_days(date, stage)')
    .eq('id', matchId)
    .single()

  if (!match || match.published_at == null) redirect(adminPicksPath(targetUser.id, 'not_found'))
  if (match.result != null) redirect(adminPicksPath(targetUser.id, 'scored'))

  const { data: existing } = await supabase
    .from('predictions')
    .select('id, pick')
    .eq('user_id', targetUser.id)
    .eq('match_id', matchId)
    .maybeSingle()

  if (existing?.pick === pick) redirect(adminPicksPath(targetUser.id, 'unchanged'))

  const { data: saved, error } = await supabase
    .from('predictions')
    .upsert(
      { user_id: targetUser.id, match_id: matchId, pick, points: null },
      { onConflict: 'user_id,match_id' },
    )
    .select('id')
    .single()
  if (error) throw error

  const matchDay = Array.isArray(match.match_days) ? match.match_days[0] : match.match_days

  // Mirrors the audit shape save_match_prediction writes, so /admin/audit
  // renders these events exactly like player-committed ones.
  await writeAuditEvent(supabase, {
    user_id: targetUser.id,
    event_type: 'match_prediction',
    action: existing ? 'update' : 'create',
    entity_id: saved.id,
    entity_ref: matchId,
    old_value: existing ? { pick: existing.pick } : null,
    new_value: { pick },
    metadata: {
      match_id: match.id,
      match_day_id: match.match_day_id,
      date: matchDay?.date,
      stage: matchDay?.stage,
      home_team: match.home_team,
      away_team: match.away_team,
      kickoff_time: match.kickoff_time,
      odds_home: match.odds_home,
      odds_draw: match.odds_draw,
      odds_away: match.odds_away,
      entered_by_admin: true,
    },
  })

  finish(targetUser.id, 'saved')
}

export async function saveAdminPikanteriaPick(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()

  const targetUser = await requirePickTargetUser(supabase, formData)
  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const pick = parsePick(formData.get('pick'), 'pick')

  const { data: item } = await supabase
    .from('pikanteria')
    .select('*')
    .eq('id', pikanteriaId)
    .single()

  if (!item || item.published_at == null) redirect(adminPicksPath(targetUser.id, 'not_found'))
  if (item.result != null) redirect(adminPicksPath(targetUser.id, 'scored'))
  if (!isValidPikanteriaPick(pick, item.odds_x)) redirect(adminPicksPath(targetUser.id, 'invalid'))

  const { data: existing } = await supabase
    .from('pikanteria_answers')
    .select('id, pick')
    .eq('user_id', targetUser.id)
    .eq('pikanteria_id', pikanteriaId)
    .maybeSingle()

  if (existing?.pick === pick) redirect(adminPicksPath(targetUser.id, 'unchanged'))

  const { data: saved, error } = await supabase
    .from('pikanteria_answers')
    .upsert(
      { user_id: targetUser.id, pikanteria_id: pikanteriaId, pick, points: null },
      { onConflict: 'user_id,pikanteria_id' },
    )
    .select('id')
    .single()
  if (error) throw error

  await writeAuditEvent(supabase, {
    user_id: targetUser.id,
    event_type: 'pikanteria_answer',
    action: existing ? 'update' : 'create',
    entity_id: saved.id,
    entity_ref: pikanteriaId,
    old_value: existing ? pikanteriaValue(item, existing.pick) : null,
    new_value: pikanteriaValue(item, pick),
    metadata: {
      pikanteria_id: item.id,
      match_day_id: item.match_day_id,
      question: item.question,
      label_1: item.label_1,
      label_2: item.label_2,
      label_x: item.label_x,
      odds_1: item.odds_1,
      odds_2: item.odds_2,
      odds_x: item.odds_x,
      entered_by_admin: true,
    },
  })

  finish(targetUser.id, 'saved')
}

export async function saveAdminFutures(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()

  const targetUser = await requirePickTargetUser(supabase, formData)
  const winnerName = parseTeamName(formData.get('winner'))
  const scorerName = parseScorerName(formData.get('scorer'))
  const winner = TEAMS.find(t => t.name === winnerName)!
  const scorer = SCORERS.find(s => s.name === scorerName)!

  const [{ data: existing, error: existingError }, locked, published] = await Promise.all([
    supabase
      .from('pre_tournament_picks')
      .select('id, winner_team, winner_odds, top_scorer, top_scorer_odds')
      .eq('user_id', targetUser.id)
      .maybeSingle(),
    isFuturesLocked(supabase),
    isFuturesPublished(supabase),
  ])

  if (existingError) throw existingError
  if (!published || locked) redirect(adminPicksPath(targetUser.id, 'locked'))

  const oldValue: AuditJson | null = existing ? {
    winner_team: existing.winner_team,
    winner_odds: existing.winner_odds,
    top_scorer: existing.top_scorer,
    top_scorer_odds: existing.top_scorer_odds,
  } : null
  const newValue: AuditJson = {
    winner_team: winner.name,
    winner_odds: winner.odds,
    top_scorer: scorer.name,
    top_scorer_odds: scorer.odds,
  }
  const shouldAudit = shouldWriteAuditEvent(oldValue, newValue)

  const { data: saved, error } = await supabase
    .from('pre_tournament_picks')
    .upsert({
      user_id: targetUser.id,
      winner_team: winner.name,
      winner_odds: winner.odds,
      top_scorer: scorer.name,
      top_scorer_odds: scorer.odds,
    }, { onConflict: 'user_id' })
    .select('id')
    .single()
  if (error) throw error

  if (shouldAudit) {
    await writeAuditEvent(supabase, {
      user_id: targetUser.id,
      event_type: 'pre_tournament_pick',
      action: existing ? 'update' : 'create',
      entity_id: saved.id,
      entity_ref: 'pre_tournament',
      old_value: oldValue,
      new_value: newValue,
      metadata: { label: 'Pre-tournament', entered_by_admin: true },
    })
  }

  finish(targetUser.id, shouldAudit ? 'saved' : 'unchanged')
}

export async function generateBotFutures(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()

  const userId = formData.get('user_id')
  const redirectUserId = typeof userId === 'string' && userId.length > 0 ? userId : undefined

  if (await isFuturesLocked(supabase)) redirect(adminPicksPath(redirectUserId, 'locked'))

  const bots = await getAutomatedUsers(supabase)
  const { data: existingPicks, error: existingError } = await supabase
    .from('pre_tournament_picks')
    .select('user_id')
    .in('user_id', bots.map(b => b.id))
  if (existingError) throw existingError

  const existingIds = new Set((existingPicks ?? []).map(p => p.user_id))
  const missing = usersMissingFutures(bots, existingIds)

  // Fill-missing-only: never overwrite, so re-clicking can't re-roll Monkey's
  // random pick. No audit events — matches the publish-time bot pick precedent.
  if (missing.length) {
    const rows = buildAutomatedFuturesRows(missing, TEAMS, SCORERS)
    const { error } = await supabase.from('pre_tournament_picks').insert(rows)
    if (error) throw error
  }

  finish(redirectUserId, `bots-${missing.length}-${bots.length - missing.length}`)
}
