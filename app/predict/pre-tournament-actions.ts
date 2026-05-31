'use server'

import { shouldWriteAuditEvent, writeAuditEvent, type AuditJson } from '@/lib/audit'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { TEAMS, SCORERS } from '@/lib/pre-tournament'
import { parseTeamName, parseScorerName } from '@/lib/validation'
import { isFuturesLocked } from '@/lib/data'

export async function savePreTournamentPick(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const winnerName = parseTeamName(formData.get('winner'))
  const scorerName = parseScorerName(formData.get('scorer'))
  const winner = TEAMS.find(t => t.name === winnerName)!
  const scorer = SCORERS.find(s => s.name === scorerName)!

  const service = await createServiceClient()
  const [
    { data: existing, error: existingError },
    locked,
  ] = await Promise.all([
    service
      .from('pre_tournament_picks')
      .select('id, winner_team, winner_odds, top_scorer, top_scorer_odds')
      .eq('user_id', user.id)
      .maybeSingle(),
    isFuturesLocked(service),
  ])

  if (existingError) throw existingError
  if (locked) throw new Error('Pre-tournament picks are locked')

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

  const { data: savedPick, error } = await service.from('pre_tournament_picks').upsert({
    user_id: user.id,
    winner_team: winner.name,
    winner_odds: winner.odds,
    top_scorer: scorer.name,
    top_scorer_odds: scorer.odds,
  }, { onConflict: 'user_id' }).select('id').single()
  if (error) throw error

  if (shouldAudit) {
    await writeAuditEvent(service, {
      user_id: user.id,
      event_type: 'pre_tournament_pick',
      action: existing ? 'update' : 'create',
      entity_id: savedPick.id,
      entity_ref: 'pre_tournament',
      old_value: oldValue,
      new_value: newValue,
      metadata: {
        label: 'Pre-tournament',
      },
    })
  }

  revalidatePath('/', 'layout')
  revalidatePath('/predict')
}

export async function saveWinnerPick(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const winnerName = parseTeamName(formData.get('winner'))
  const winner = TEAMS.find(t => t.name === winnerName)!

  const service = await createServiceClient()
  const [{ data: existing, error: existingError }, locked] = await Promise.all([
    service
      .from('pre_tournament_picks')
      .select('id, winner_team, winner_odds, top_scorer, top_scorer_odds')
      .eq('user_id', user.id)
      .maybeSingle(),
    isFuturesLocked(service),
  ])

  if (existingError) throw existingError
  if (!existing) throw new Error('No existing pick to update')
  if (locked) throw new Error('Pre-tournament picks are locked')

  const oldValue: AuditJson = {
    winner_team: existing.winner_team,
    winner_odds: existing.winner_odds,
    top_scorer: existing.top_scorer,
    top_scorer_odds: existing.top_scorer_odds,
  }
  const newValue: AuditJson = {
    winner_team: winner.name,
    winner_odds: winner.odds,
    top_scorer: existing.top_scorer,
    top_scorer_odds: existing.top_scorer_odds,
  }
  const shouldAudit = shouldWriteAuditEvent(oldValue, newValue)

  const { data: savedPick, error } = await service.from('pre_tournament_picks').upsert({
    user_id: user.id,
    winner_team: winner.name,
    winner_odds: winner.odds,
    top_scorer: existing.top_scorer,
    top_scorer_odds: existing.top_scorer_odds,
  }, { onConflict: 'user_id' }).select('id').single()
  if (error) throw error

  if (shouldAudit) {
    await writeAuditEvent(service, {
      user_id: user.id,
      event_type: 'pre_tournament_pick',
      action: 'update',
      entity_id: savedPick.id,
      entity_ref: 'pre_tournament',
      old_value: oldValue,
      new_value: newValue,
      metadata: { label: 'Pre-tournament' },
    })
  }

  revalidatePath('/', 'layout')
  revalidatePath('/predict')
}

export async function saveScorerPick(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const scorerName = parseScorerName(formData.get('scorer'))
  const scorer = SCORERS.find(s => s.name === scorerName)!

  const service = await createServiceClient()
  const [{ data: existing, error: existingError }, locked] = await Promise.all([
    service
      .from('pre_tournament_picks')
      .select('id, winner_team, winner_odds, top_scorer, top_scorer_odds')
      .eq('user_id', user.id)
      .maybeSingle(),
    isFuturesLocked(service),
  ])

  if (existingError) throw existingError
  if (!existing) throw new Error('No existing pick to update')
  if (locked) throw new Error('Pre-tournament picks are locked')

  const oldValue: AuditJson = {
    winner_team: existing.winner_team,
    winner_odds: existing.winner_odds,
    top_scorer: existing.top_scorer,
    top_scorer_odds: existing.top_scorer_odds,
  }
  const newValue: AuditJson = {
    winner_team: existing.winner_team,
    winner_odds: existing.winner_odds,
    top_scorer: scorer.name,
    top_scorer_odds: scorer.odds,
  }
  const shouldAudit = shouldWriteAuditEvent(oldValue, newValue)

  const { data: savedPick, error } = await service.from('pre_tournament_picks').upsert({
    user_id: user.id,
    winner_team: existing.winner_team,
    winner_odds: existing.winner_odds,
    top_scorer: scorer.name,
    top_scorer_odds: scorer.odds,
  }, { onConflict: 'user_id' }).select('id').single()
  if (error) throw error

  if (shouldAudit) {
    await writeAuditEvent(service, {
      user_id: user.id,
      event_type: 'pre_tournament_pick',
      action: 'update',
      entity_id: savedPick.id,
      entity_ref: 'pre_tournament',
      old_value: oldValue,
      new_value: newValue,
      metadata: { label: 'Pre-tournament' },
    })
  }

  revalidatePath('/', 'layout')
  revalidatePath('/predict')
}
