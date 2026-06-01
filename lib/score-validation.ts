import type { SupabaseClient } from '@supabase/supabase-js'

export const SNAPSHOT_EPSILON = 0.005

interface SnapshotPayload {
  user_id: string
  match_day_id: string
  stage: string
  match_points: number
  pikanteria_points: number
  pre_tournament_winner_pts: number
  pre_tournament_scorer_pts: number
  day_points: number
  cumulative_points: number
  is_valid: boolean
  discrepancy: number | null
  calculated_at: string
}

function sumByUserId(rows: { user_id: string; points: number | null }[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.user_id, (map.get(r.user_id) ?? 0) + Number(r.points ?? 0))
  }
  return map
}

export function buildMatchDaySnapshotPayloads(params: {
  users: { id: string }[]
  matchDayId: string
  stage: string
  matchPredRows: { user_id: string; points: number | null }[]
  pikAnswerRows: { user_id: string; points: number | null }[]
  allPredRows: { user_id: string; points: number | null }[]
  allPikaRows: { user_id: string; points: number | null }[]
  preTournRows: { user_id: string; winner_points: number | null; top_scorer_points: number | null }[]
  existingSnapshots: { id: string; user_id: string; match_day_id: string | null; day_points: number }[]
  now: string
}): { toInsert: SnapshotPayload[]; toUpdate: (SnapshotPayload & { id: string })[] } {
  const { users, matchDayId, stage, matchPredRows, pikAnswerRows, allPredRows, allPikaRows, preTournRows, existingSnapshots, now } = params

  const matchDayPts = sumByUserId(matchPredRows)
  const pikanteriaDayPts = sumByUserId(pikAnswerRows)
  const cumulativePredPts = sumByUserId(allPredRows)
  const cumulativePikaPts = sumByUserId(allPikaRows)

  const preTournMap = new Map<string, { winner: number; scorer: number }>()
  for (const r of preTournRows) {
    preTournMap.set(r.user_id, {
      winner: Number(r.winner_points ?? 0),
      scorer: Number(r.top_scorer_points ?? 0),
    })
  }

  const otherDaysSumByUser = new Map<string, number>()
  const existingIdByUser = new Map<string, string>()
  for (const snap of existingSnapshots) {
    if (snap.match_day_id === matchDayId) {
      existingIdByUser.set(snap.user_id, snap.id)
    } else {
      otherDaysSumByUser.set(snap.user_id, (otherDaysSumByUser.get(snap.user_id) ?? 0) + Number(snap.day_points))
    }
  }

  const toInsert: SnapshotPayload[] = []
  const toUpdate: (SnapshotPayload & { id: string })[] = []

  for (const u of users) {
    const matchPts = matchDayPts.get(u.id) ?? 0
    const pikPts = pikanteriaDayPts.get(u.id) ?? 0
    const dayPoints = matchPts + pikPts

    const preTournament = preTournMap.get(u.id) ?? { winner: 0, scorer: 0 }
    const freshCumulative =
      (cumulativePredPts.get(u.id) ?? 0) +
      (cumulativePikaPts.get(u.id) ?? 0) +
      preTournament.winner +
      preTournament.scorer

    const otherDaysSum = otherDaysSumByUser.get(u.id) ?? 0
    const { isValid, discrepancy } = computeSnapshotValidity(freshCumulative, dayPoints, otherDaysSum)

    const payload: SnapshotPayload = {
      user_id: u.id,
      match_day_id: matchDayId,
      stage,
      match_points: matchPts,
      pikanteria_points: pikPts,
      pre_tournament_winner_pts: 0,
      pre_tournament_scorer_pts: 0,
      day_points: dayPoints,
      cumulative_points: freshCumulative,
      is_valid: isValid,
      discrepancy,
      calculated_at: now,
    }

    const existingId = existingIdByUser.get(u.id)
    if (existingId) {
      toUpdate.push({ ...payload, id: existingId })
    } else {
      toInsert.push(payload)
    }
  }

  return { toInsert, toUpdate }
}

/**
 * Pure helper: given fresh cumulative points from raw rows, the day's points,
 * and the sum of *other* snapshot rows, returns the is_valid flag and discrepancy
 * (null when valid, rounded to 2dp otherwise).
 */
export function computeSnapshotValidity(
  freshCumulative: number,
  dayPoints: number,
  otherDaysSum: number,
): { isValid: boolean; discrepancy: number | null } {
  const snapshotSum = otherDaysSum + dayPoints
  const isValid = Math.abs(freshCumulative - snapshotSum) < SNAPSHOT_EPSILON
  const discrepancy = isValid ? null : Math.round((freshCumulative - snapshotSum) * 100) / 100
  return { isValid, discrepancy }
}

async function computeMatchPoints(
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

async function computePicanteriaPoints(
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

async function computePreTournamentPoints(
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

async function computeCumulativeFromRaw(
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

async function upsertMatchDaySnapshot(
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
  const { isValid, discrepancy } = computeSnapshotValidity(freshCumulative, dayPoints, otherDaysSum)

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
  const { isValid, discrepancy } = computeSnapshotValidity(freshCumulative, dayPoints, otherDaysSum)

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
  const [
    { data: users },
    { data: matchDay },
    { data: matchPredRows },
    { data: pikAnswerRows },
    { data: allPredRows },
    { data: allPikaRows },
    { data: preTournRows },
    { data: existingSnapshots },
  ] = await Promise.all([
    supabase.from('users').select('id'),
    supabase.from('match_days').select('stage').eq('id', matchDayId).single(),
    supabase
      .from('predictions')
      .select('user_id, points, matches!inner(match_day_id)')
      .eq('matches.match_day_id', matchDayId)
      .not('points', 'is', null),
    supabase
      .from('pikanteria_answers')
      .select('user_id, points, pikanteria!inner(match_day_id)')
      .eq('pikanteria.match_day_id', matchDayId)
      .not('points', 'is', null),
    supabase.from('predictions').select('user_id, points').not('points', 'is', null),
    supabase.from('pikanteria_answers').select('user_id, points').not('points', 'is', null),
    supabase.from('pre_tournament_picks').select('user_id, winner_points, top_scorer_points'),
    supabase.from('score_snapshots').select('id, user_id, match_day_id, day_points'),
  ])

  const stage = (matchDay as { stage: string } | null)?.stage ?? 'group'

  const { toInsert, toUpdate } = buildMatchDaySnapshotPayloads({
    users: (users ?? []) as { id: string }[],
    matchDayId,
    stage,
    matchPredRows: (matchPredRows ?? []) as { user_id: string; points: number | null }[],
    pikAnswerRows: (pikAnswerRows ?? []) as { user_id: string; points: number | null }[],
    allPredRows: (allPredRows ?? []) as { user_id: string; points: number | null }[],
    allPikaRows: (allPikaRows ?? []) as { user_id: string; points: number | null }[],
    preTournRows: (preTournRows ?? []) as { user_id: string; winner_points: number | null; top_scorer_points: number | null }[],
    existingSnapshots: (existingSnapshots ?? []) as { id: string; user_id: string; match_day_id: string | null; day_points: number }[],
    now: new Date().toISOString(),
  })

  await Promise.all([
    toUpdate.length > 0 ? supabase.from('score_snapshots').upsert(toUpdate) : Promise.resolve(),
    toInsert.length > 0 ? supabase.from('score_snapshots').insert(toInsert) : Promise.resolve(),
  ])
}

export async function recalculateAllSnapshots(
  supabase: SupabaseClient,
): Promise<{ written: number; invalid: number }> {
  // Fetch everything in parallel
  const [{ data: matchDays }, { data: users }, { data: picks }] = await Promise.all([
    supabase
      .from('match_days')
      .select('id, stage, matches(result)')
      .not('published_at', 'is', null)
      .order('date', { ascending: true }),
    supabase.from('users').select('id'),
    supabase.from('pre_tournament_picks').select('user_id'),
  ])

  type RecalcDay = { id: string; stage: string; matches: { result: string | null }[] }
  const scoredDays = ((matchDays ?? []) as RecalcDay[]).filter(d =>
    d.matches.some(m => m.result !== null)
  )
  const allUsers = users ?? []
  const allPicks = picks ?? []

  let written = 0
  let invalid = 0

  // Pass 1: write pre-tournament snapshot rows so match-day validation can include them
  // via getSnapshotSum's .or() clause. Without this, is_valid on match-day snapshots would
  // be false for any user with pre-tournament points (computeCumulativeFromRaw includes them
  // but getSnapshotSum would find no NULL row to sum against).
  await Promise.all(allPicks.map(p => upsertPreTournamentSnapshot(supabase, p.user_id)))
  written += allPicks.length

  // Pass 2: match-day snapshots in chronological order (pre-tournament rows now exist).
  // Days must be processed sequentially: each day's cumulative snapshot builds on
  // the previous day's rows. Per-day user work is parallelized inside each step.
  await scoredDays.reduce(
    (p, day) => p.then(() =>
      Promise.all(allUsers.map((u: { id: string }) => upsertMatchDaySnapshot(supabase, u.id, day.id, day.stage)))
    ),
    Promise.resolve<unknown>(undefined)
  )
  written += scoredDays.length * allUsers.length

  // Pass 3: re-run pre-tournament so is_valid reflects the now-present match-day rows
  await Promise.all(allPicks.map(p => upsertPreTournamentSnapshot(supabase, p.user_id)))
  written += allPicks.length

  // Count invalids
  const { count } = await supabase
    .from('score_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('is_valid', false)

  invalid = count ?? 0

  return { written, invalid }
}
