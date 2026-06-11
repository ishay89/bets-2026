'use server'

import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import { parseUUID, parsePick, parseTeamName, parseScorerName } from '@/lib/validation'
import { aiUserById, isValidPikanteriaPick, usersMissingFutures, type AiUser } from '@/lib/ai-picks'
import { buildAutomatedFuturesRows, type AutomatedUser } from '@/lib/monkey'
import { TEAMS, SCORERS } from '@/lib/pre-tournament'
import { isFuturesLocked, isFuturesPublished } from '@/lib/data'
import { isMatchLocked } from '@/lib/lock'
import { shouldWriteAuditEvent, writeAuditEvent, type AuditJson } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

type AdminClient = ReturnType<typeof createAdminClient>

function aiPicksPath(slug: string, notice?: string) {
  const params = new URLSearchParams({ user: slug })
  if (notice) params.set('notice', notice)
  return `/admin/ai-picks?${params.toString()}`
}

function requireAiUser(formData: FormData): AiUser {
  const userId = parseUUID(formData.get('user_id'), 'user_id')
  const aiUser = aiUserById(userId)
  if (!aiUser) redirect(aiPicksPath('claude', 'invalid'))
  return aiUser
}

function finish(slug: string, notice: string): never {
  revalidatePath('/admin/ai-picks')
  revalidatePath('/predict')
  redirect(aiPicksPath(slug, notice))
}

function pikanteriaValue(
  item: { label_1: string; label_2: string; label_x: string | null; odds_1: number; odds_2: number; odds_x: number | null },
  pick: string,
) {
  if (pick === '1') return { pick, label: item.label_1, odds: item.odds_1 }
  if (pick === '2') return { pick, label: item.label_2, odds: item.odds_2 }
  return { pick, label: item.label_x, odds: item.odds_x }
}

export async function saveAiMatchPick(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()

  const aiUser = requireAiUser(formData)
  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const pick = parsePick(formData.get('pick'), 'pick')

  const { data: match } = await supabase
    .from('matches')
    .select('*, match_days(date, stage)')
    .eq('id', matchId)
    .single()

  if (!match || match.published_at == null) redirect(aiPicksPath(aiUser.slug, 'not_found'))
  if (match.result != null || isMatchLocked(match)) {
    // Mirror save_match_prediction: persist the lazy time-based lock on the
    // first save attempt past the deadline so it applies to everyone.
    if (!match.locked) {
      await supabase.from('matches').update({ locked: true }).eq('id', matchId).eq('locked', false)
    }
    redirect(aiPicksPath(aiUser.slug, 'locked'))
  }

  const { data: existing } = await supabase
    .from('predictions')
    .select('id, pick')
    .eq('user_id', aiUser.id)
    .eq('match_id', matchId)
    .maybeSingle()

  if (existing?.pick === pick) redirect(aiPicksPath(aiUser.slug, 'unchanged'))

  const { data: saved, error } = await supabase
    .from('predictions')
    .upsert(
      { user_id: aiUser.id, match_id: matchId, pick, points: null },
      { onConflict: 'user_id,match_id' },
    )
    .select('id')
    .single()
  if (error) throw error

  const matchDay = Array.isArray(match.match_days) ? match.match_days[0] : match.match_days

  // Mirrors the audit shape save_match_prediction writes, so /admin/audit
  // renders these events exactly like player-committed ones.
  await writeAuditEvent(supabase, {
    user_id: aiUser.id,
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

  finish(aiUser.slug, 'saved')
}

export async function saveAiPikanteriaPick(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()

  const aiUser = requireAiUser(formData)
  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const pick = parsePick(formData.get('pick'), 'pick')

  const { data: item } = await supabase
    .from('pikanteria')
    .select('*')
    .eq('id', pikanteriaId)
    .single()

  if (!item || item.published_at == null) redirect(aiPicksPath(aiUser.slug, 'not_found'))
  if (item.result != null || item.locked) redirect(aiPicksPath(aiUser.slug, 'locked'))
  if (!isValidPikanteriaPick(pick, item.odds_x)) redirect(aiPicksPath(aiUser.slug, 'invalid'))

  const { data: existing } = await supabase
    .from('pikanteria_answers')
    .select('id, pick')
    .eq('user_id', aiUser.id)
    .eq('pikanteria_id', pikanteriaId)
    .maybeSingle()

  if (existing?.pick === pick) redirect(aiPicksPath(aiUser.slug, 'unchanged'))

  const { data: saved, error } = await supabase
    .from('pikanteria_answers')
    .upsert(
      { user_id: aiUser.id, pikanteria_id: pikanteriaId, pick, points: null },
      { onConflict: 'user_id,pikanteria_id' },
    )
    .select('id')
    .single()
  if (error) throw error

  await writeAuditEvent(supabase, {
    user_id: aiUser.id,
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

  finish(aiUser.slug, 'saved')
}

export async function saveAiFutures(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()

  const aiUser = requireAiUser(formData)
  const winnerName = parseTeamName(formData.get('winner'))
  const scorerName = parseScorerName(formData.get('scorer'))
  const winner = TEAMS.find(t => t.name === winnerName)!
  const scorer = SCORERS.find(s => s.name === scorerName)!

  const [{ data: existing, error: existingError }, locked, published] = await Promise.all([
    supabase
      .from('pre_tournament_picks')
      .select('id, winner_team, winner_odds, top_scorer, top_scorer_odds')
      .eq('user_id', aiUser.id)
      .maybeSingle(),
    isFuturesLocked(supabase),
    isFuturesPublished(supabase),
  ])

  if (existingError) throw existingError
  if (!published || locked) redirect(aiPicksPath(aiUser.slug, 'locked'))

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
      user_id: aiUser.id,
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
      user_id: aiUser.id,
      event_type: 'pre_tournament_pick',
      action: existing ? 'update' : 'create',
      entity_id: saved.id,
      entity_ref: 'pre_tournament',
      old_value: oldValue,
      new_value: newValue,
      metadata: { label: 'Pre-tournament', entered_by_admin: true },
    })
  }

  finish(aiUser.slug, shouldAudit ? 'saved' : 'unchanged')
}

async function getAutomatedUsers(supabase: AdminClient): Promise<AutomatedUser[]> {
  const { data } = await supabase
    .from('users')
    .select('id, automation_strategy')
    .not('automation_strategy', 'is', null)
    .returns<AutomatedUser[]>()
  return data ?? []
}

export async function generateBotFutures(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()

  // Keep the user toggle stable across the redirect.
  const slug = formData.get('user_slug') === 'codex' ? 'codex' : 'claude'

  if (await isFuturesLocked(supabase)) redirect(aiPicksPath(slug, 'locked'))

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

  finish(slug, `bots-${missing.length}-${bots.length - missing.length}`)
}
