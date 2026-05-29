import type { SupabaseClient } from '@supabase/supabase-js'

const EPSILON = 0.005

export async function computeMatchPoints(
  supabase: SupabaseClient,
  userId: string,
  matchDayId: string,
): Promise<number> {
  const { data } = await supabase
    .from('predictions')
    .select('points, matches!inner(match_day_id)')
    .eq('user_id', userId)
    .eq('matches.match_day_id', matchDayId)
    .not('points', 'is', null)

  return (data ?? []).reduce((sum, row: { points: number | null }) => sum + Number(row.points), 0)
}

export async function computePicanteriaPoints(
  supabase: SupabaseClient,
  userId: string,
  matchDayId: string,
): Promise<number> {
  const { data } = await supabase
    .from('pikanteria_answers')
    .select('points, pikanteria!inner(match_day_id)')
    .eq('user_id', userId)
    .eq('pikanteria.match_day_id', matchDayId)
    .not('points', 'is', null)

  return (data ?? []).reduce((sum, row: { points: number | null }) => sum + Number(row.points), 0)
}

export async function computePreTournamentPoints(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ winnerPts: number; scorerPts: number }> {
  const { data } = await supabase
    .from('pre_tournament_picks')
    .select('winner_points, top_scorer_points')
    .eq('user_id', userId)
    .maybeSingle()

  return {
    winnerPts: Number(data?.winner_points ?? 0),
    scorerPts: Number(data?.top_scorer_points ?? 0),
  }
}

export async function computeCumulativeFromRaw(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const [{ data: preds }, { data: pikas }, preTournament] = await Promise.all([
    supabase
      .from('predictions')
      .select('points')
      .eq('user_id', userId)
      .not('points', 'is', null),
    supabase
      .from('pikanteria_answers')
      .select('points')
      .eq('user_id', userId)
      .not('points', 'is', null),
    computePreTournamentPoints(supabase, userId),
  ])

  const predTotal = (preds ?? []).reduce((s, r: { points: number | null }) => s + Number(r.points), 0)
  const pikaTotal = (pikas ?? []).reduce((s, r: { points: number | null }) => s + Number(r.points), 0)

  return predTotal + pikaTotal + preTournament.winnerPts + preTournament.scorerPts
}

async function getSnapshotSum(
  supabase: SupabaseClient,
  userId: string,
  excludeMatchDayId: string | null,
): Promise<number> {
  const query = supabase
    .from('score_snapshots')
    .select('day_points')
    .eq('user_id', userId)

  if (excludeMatchDayId !== null) {
    // Exclude the current match day's row but keep the pre-tournament row (match_day_id IS NULL).
    // Plain .neq() would silently drop NULL rows due to SQL NULL semantics, understating the sum.
    query.or(`match_day_id.neq.${excludeMatchDayId},match_day_id.is.null`)
  } else {
    // pre-tournament: exclude the null row (the one we're about to upsert)
    query.not('match_day_id', 'is', null)
  }

  const { data } = await query
  return (data ?? []).reduce((s, r: { day_points: number }) => s + Number(r.day_points), 0)
}

export async function upsertMatchDaySnapshot(
  supabase: SupabaseClient,
  userId: string,
  matchDayId: string,
  stage: string,
): Promise<void> {
  const [matchPts, pikanteriaPts, freshCumulative] = await Promise.all([
    computeMatchPoints(supabase, userId, matchDayId),
    computePicanteriaPoints(supabase, userId, matchDayId),
    computeCumulativeFromRaw(supabase, userId),
  ])

  const dayPoints = matchPts + pikanteriaPts
  const otherDaysSum = await getSnapshotSum(supabase, userId, matchDayId)
  const snapshotSum = otherDaysSum + dayPoints

  const isValid = Math.abs(freshCumulative - snapshotSum) < EPSILON
  const discrepancy = isValid ? null : Math.round((freshCumulative - snapshotSum) * 100) / 100

  const payload = {
    user_id: userId,
    match_day_id: matchDayId,
    stage,
    match_points: matchPts,
    pikanteria_points: pikanteriaPts,
    pre_tournament_winner_pts: 0,
    pre_tournament_scorer_pts: 0,
    day_points: dayPoints,
    cumulative_points: freshCumulative,
    is_valid: isValid,
    discrepancy,
    calculated_at: new Date().toISOString(),
  }

  // Use manual upsert to work around partial-index limitation with Supabase JS client
  const { data: existing } = await supabase
    .from('score_snapshots')
    .select('id')
    .eq('user_id', userId)
    .eq('match_day_id', matchDayId)
    .maybeSingle()

  if (existing) {
    await supabase.from('score_snapshots').update(payload).eq('id', existing.id)
  } else {
    await supabase.from('score_snapshots').insert(payload)
  }
}

export async function upsertPreTournamentSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const [{ winnerPts, scorerPts }, freshCumulative] = await Promise.all([
    computePreTournamentPoints(supabase, userId),
    computeCumulativeFromRaw(supabase, userId),
  ])

  const dayPoints = winnerPts + scorerPts
  const otherDaysSum = await getSnapshotSum(supabase, userId, null)
  const snapshotSum = otherDaysSum + dayPoints

  const isValid = Math.abs(freshCumulative - snapshotSum) < EPSILON
  const discrepancy = isValid ? null : Math.round((freshCumulative - snapshotSum) * 100) / 100

  const payload = {
    user_id: userId,
    match_day_id: null,
    stage: null,
    match_points: 0,
    pikanteria_points: 0,
    pre_tournament_winner_pts: winnerPts,
    pre_tournament_scorer_pts: scorerPts,
    day_points: dayPoints,
    cumulative_points: freshCumulative,
    is_valid: isValid,
    discrepancy,
    calculated_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase
    .from('score_snapshots')
    .select('id')
    .eq('user_id', userId)
    .is('match_day_id', null)
    .maybeSingle()

  if (existing) {
    await supabase.from('score_snapshots').update(payload).eq('id', existing.id)
  } else {
    await supabase.from('score_snapshots').insert(payload)
  }
}

export async function snapshotMatchDay(
  supabase: SupabaseClient,
  matchDayId: string,
): Promise<void> {
  const [{ data: users }, { data: matchDay }] = await Promise.all([
    supabase.from('users').select('id'),
    supabase.from('match_days').select('stage').eq('id', matchDayId).single(),
  ])

  const stage = (matchDay as { stage: string } | null)?.stage ?? 'group'

  await Promise.all(
    (users ?? []).map((u: { id: string }) => upsertMatchDaySnapshot(supabase, u.id, matchDayId, stage))
  )
}

export async function recalculateAllSnapshots(
  supabase: SupabaseClient,
): Promise<{ written: number; invalid: number }> {
  // Fetch all match days that have at least one scored match, oldest first
  const { data: matchDays } = await supabase
    .from('match_days')
    .select('id, stage, matches(result)')
    .not('published_at', 'is', null)
    .order('date', { ascending: true })

  type RecalcDay = { id: string; stage: string; matches: { result: string | null }[] }
  const scoredDays = ((matchDays ?? []) as RecalcDay[]).filter(d =>
    d.matches.some(m => m.result !== null)
  )

  const { data: users } = await supabase.from('users').select('id')
  const allUsers = users ?? []

  let written = 0
  let invalid = 0

  // Process days in chronological order so cumulative calculations are sequential
  for (const day of scoredDays) {
    await Promise.all(
      allUsers.map((u: { id: string }) => upsertMatchDaySnapshot(supabase, u.id, day.id, day.stage))
    )
    written += allUsers.length
  }

  // Pre-tournament snapshots for users with picks
  const { data: picks } = await supabase.from('pre_tournament_picks').select('user_id')
  for (const pick of picks ?? []) {
    await upsertPreTournamentSnapshot(supabase, pick.user_id)
    written++
  }

  // Count invalids
  const { count } = await supabase
    .from('score_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('is_valid', false)

  invalid = count ?? 0

  return { written, invalid }
}
