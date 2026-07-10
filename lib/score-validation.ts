import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from './data'

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

type ResultRow = { result: string | null }

export type SnapshotScoredDay = {
  id: string
  stage: string
  matches: ResultRow[]
  pikanteria: ResultRow[]
}

function sumByUserId(rows: { user_id: string; points: number | null }[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.user_id, (map.get(r.user_id) ?? 0) + Number(r.points ?? 0))
  }
  return map
}

// One snapshot row per (user, match day); the pre-tournament row uses a null
// match day. Keys the "which existing row is this" lookup during a full rebuild.
function snapshotKey(userId: string, matchDayId: string | null): string {
  return `${userId}::${matchDayId ?? ''}`
}

export function selectScoredSnapshotDays(days: SnapshotScoredDay[]): SnapshotScoredDay[] {
  return days.filter(day =>
    day.matches.some(item => item.result !== null)
    || day.pikanteria.some(item => item.result !== null)
  )
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
  // `id` is optional so recalculateAllSnapshots can pass a fully-fresh view of
  // every snapshot row (real ids for rows that already exist, undefined for
  // rows about to be inserted). Rows without an id are classified as inserts.
  existingSnapshots: { id?: string; user_id: string; match_day_id: string | null; day_points: number }[]
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
      if (snap.id !== undefined) existingIdByUser.set(snap.user_id, snap.id)
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

interface PreTournamentSnapshotPayload {
  user_id: string
  match_day_id: null
  stage: null
  match_points: 0
  pikanteria_points: 0
  pre_tournament_winner_pts: number
  pre_tournament_scorer_pts: number
  day_points: number
  cumulative_points: number
  is_valid: boolean
  discrepancy: number | null
  calculated_at: string
}

/**
 * Batched equivalent of upsertPreTournamentSnapshot for every pre-tournament
 * user at once. Mirrors buildMatchDaySnapshotPayloads: it's pure, so the old
 * per-user fan-out (computeCumulativeFromRaw + getSnapshotSum + lookup + write,
 * ~7 round-trips *per pre-tournament user*) collapses into in-memory aggregation
 * over rows the caller already holds.
 *
 * `snapshots` carries every match-day row's day_points (otherDaysSum sums the
 * non-null match_day_id rows — exactly what getSnapshotSum(userId, null) did per
 * user) plus the pre-tournament (NULL) row's id for in-place updates. Callers
 * pass either the *post-write* score_snapshots state (snapshotMatchDay) or a
 * fully-fresh in-memory view (recalculateAllSnapshots). `id` is optional so the
 * fresh view can include rows that don't exist yet; those are inserted.
 */
export function buildPreTournamentSnapshotPayloads(params: {
  preTournRows: { user_id: string; winner_points: number | null; top_scorer_points: number | null }[]
  allPredRows: { user_id: string; points: number | null }[]
  allPikaRows: { user_id: string; points: number | null }[]
  snapshots: { id?: string; user_id: string; match_day_id: string | null; day_points: number }[]
  now: string
}): { toInsert: PreTournamentSnapshotPayload[]; toUpdate: (PreTournamentSnapshotPayload & { id: string })[] } {
  const { preTournRows, allPredRows, allPikaRows, snapshots, now } = params

  const cumulativePredPts = sumByUserId(allPredRows)
  const cumulativePikaPts = sumByUserId(allPikaRows)

  // Split the snapshot rows once: the pre-tournament (NULL) row gives us the id
  // to update in place; every match-day row feeds otherDaysSum.
  const otherDaysSumByUser = new Map<string, number>()
  const existingNullIdByUser = new Map<string, string>()
  for (const snap of snapshots) {
    if (snap.match_day_id === null) {
      if (snap.id !== undefined) existingNullIdByUser.set(snap.user_id, snap.id)
    } else {
      otherDaysSumByUser.set(snap.user_id, (otherDaysSumByUser.get(snap.user_id) ?? 0) + Number(snap.day_points))
    }
  }

  const toInsert: PreTournamentSnapshotPayload[] = []
  const toUpdate: (PreTournamentSnapshotPayload & { id: string })[] = []

  for (const row of preTournRows) {
    const winnerPts = Number(row.winner_points ?? 0)
    const scorerPts = Number(row.top_scorer_points ?? 0)
    const dayPoints = winnerPts + scorerPts
    const freshCumulative =
      (cumulativePredPts.get(row.user_id) ?? 0) +
      (cumulativePikaPts.get(row.user_id) ?? 0) +
      winnerPts +
      scorerPts

    const otherDaysSum = otherDaysSumByUser.get(row.user_id) ?? 0
    const { isValid, discrepancy } = computeSnapshotValidity(freshCumulative, dayPoints, otherDaysSum)

    const payload: PreTournamentSnapshotPayload = {
      user_id: row.user_id,
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
      calculated_at: now,
    }

    const existingId = existingNullIdByUser.get(row.user_id)
    if (existingId) {
      toUpdate.push({ ...payload, id: existingId })
    } else {
      toInsert.push(payload)
    }
  }

  return { toInsert, toUpdate }
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

  const { data: existing, error: lookupError } = await supabase
    .from('score_snapshots')
    .select('id')
    .eq('user_id', userId)
    .is('match_day_id', null)
    .maybeSingle()
  if (lookupError) throw new Error(`pre-tournament snapshot lookup failed for user ${userId}: ${lookupError.message}`)

  const { error: writeError } = existing
    ? await supabase.from('score_snapshots').update(payload).eq('id', existing.id)
    : await supabase.from('score_snapshots').insert(payload)
  if (writeError) throw new Error(`pre-tournament snapshot write failed for user ${userId}: ${writeError.message}`)
}

export async function snapshotMatchDay(
  supabase: SupabaseClient,
  matchDayId: string,
): Promise<void> {
  // Every read that can grow past PostgREST's max_rows cap (1000) must page
  // via fetchAllRows: score_snapshots crossed the cap on 2026-07-05, the
  // un-paged read missed the current day's rows, and the refresh misclassified
  // every user as a fresh insert — aborting the whole batch on the
  // (user_id, match_day_id) unique index.
  const [
    { data: users },
    { data: matchDay },
    matchPredRows,
    pikAnswerRows,
    allPredRows,
    allPikaRows,
    { data: preTournRows },
    existingSnapshots,
  ] = await Promise.all([
    supabase.from('users').select('id'),
    supabase.from('match_days').select('stage').eq('id', matchDayId).single(),
    fetchAllRows<{ user_id: string; points: number | null }>(() =>
      supabase
        .from('predictions')
        .select('user_id, points, matches!inner(match_day_id)')
        .eq('matches.match_day_id', matchDayId)
        .not('points', 'is', null),
    ),
    fetchAllRows<{ user_id: string; points: number | null }>(() =>
      supabase
        .from('pikanteria_answers')
        .select('user_id, points, pikanteria!inner(match_day_id)')
        .eq('pikanteria.match_day_id', matchDayId)
        .not('points', 'is', null),
    ),
    fetchAllRows<{ user_id: string; points: number | null }>(() =>
      supabase.from('predictions').select('user_id, points').not('points', 'is', null),
    ),
    fetchAllRows<{ user_id: string; points: number | null }>(() =>
      supabase.from('pikanteria_answers').select('user_id, points').not('points', 'is', null),
    ),
    supabase.from('pre_tournament_picks').select('user_id, winner_points, top_scorer_points'),
    fetchAllRows<{ id: string; user_id: string; match_day_id: string | null; day_points: number }>(() =>
      supabase.from('score_snapshots').select('id, user_id, match_day_id, day_points'),
    ),
  ])

  const stage = (matchDay as { stage: string } | null)?.stage ?? 'group'

  const { toInsert, toUpdate } = buildMatchDaySnapshotPayloads({
    users: (users ?? []) as { id: string }[],
    matchDayId,
    stage,
    matchPredRows,
    pikAnswerRows,
    allPredRows,
    allPikaRows,
    preTournRows: (preTournRows ?? []) as { user_id: string; winner_points: number | null; top_scorer_points: number | null }[],
    existingSnapshots,
    now: new Date().toISOString(),
  })

  const [updateResult, insertResult] = await Promise.all([
    toUpdate.length > 0 ? supabase.from('score_snapshots').upsert(toUpdate) : Promise.resolve({ error: null }),
    toInsert.length > 0 ? supabase.from('score_snapshots').insert(toInsert) : Promise.resolve({ error: null }),
  ])
  if (updateResult.error) throw new Error(`snapshot batch update failed for match day ${matchDayId}: ${updateResult.error.message}`)
  if (insertResult.error) throw new Error(`snapshot batch insert failed for match day ${matchDayId}: ${insertResult.error.message}`)

  // Refresh pre-tournament snapshot rows so getSnapshotSum's .or() clause and
  // is_valid/discrepancy/cumulative_points stay correct after this match day's
  // points changed. recalculateAllSnapshots does this in its Pass 1/Pass 3 -
  // without it, the pre-tournament row's cumulative_points (which includes
  // every match day's points) would be stale, and its is_valid/discrepancy
  // would no longer reflect the freshly written match-day day_points above.
  //
  // Must run *after* the match-day rows above are written: otherDaysSum sums
  // every match-day snapshot row, so we re-read score_snapshots here to see this
  // day's fresh day_points. This replaced a per-user fan-out (upsertPreTournament
  // Snapshot × every pre-tournament user, ~7 round-trips each) that scaled with
  // the tournament and pushed the /admin/results scoring action past its function
  // timeout at the knockout stage (France vs Morocco QF, 2026-07-10). The batched
  // form is one paged read + one upsert + one insert regardless of user count.
  const postWriteSnapshots = await fetchAllRows<{ id: string; user_id: string; match_day_id: string | null; day_points: number }>(() =>
    supabase.from('score_snapshots').select('id, user_id, match_day_id, day_points'),
  )

  const preTourn = buildPreTournamentSnapshotPayloads({
    preTournRows: (preTournRows ?? []) as { user_id: string; winner_points: number | null; top_scorer_points: number | null }[],
    allPredRows,
    allPikaRows,
    snapshots: postWriteSnapshots,
    now: new Date().toISOString(),
  })

  const [preUpdateResult, preInsertResult] = await Promise.all([
    preTourn.toUpdate.length > 0 ? supabase.from('score_snapshots').upsert(preTourn.toUpdate) : Promise.resolve({ error: null }),
    preTourn.toInsert.length > 0 ? supabase.from('score_snapshots').insert(preTourn.toInsert) : Promise.resolve({ error: null }),
  ])
  if (preUpdateResult.error) throw new Error(`pre-tournament snapshot batch update failed for match day ${matchDayId}: ${preUpdateResult.error.message}`)
  if (preInsertResult.error) throw new Error(`pre-tournament snapshot batch insert failed for match day ${matchDayId}: ${preInsertResult.error.message}`)
}

export async function recalculateAllSnapshots(
  supabase: SupabaseClient,
): Promise<{ written: number; invalid: number }> {
  const now = new Date().toISOString()

  // Bulk reads. Every table that grows past PostgREST's 1000-row cap
  // (predictions, pikanteria_answers, score_snapshots) is paged via
  // fetchAllRows - an un-paged read silently truncates and would corrupt the
  // cumulative totals and existing-row lookup below.
  const [
    { data: matchDays },
    { data: users },
    { data: picks },
    allPredRows,
    allPikaRows,
    existingSnapshots,
  ] = await Promise.all([
    supabase
      .from('match_days')
      .select('id, stage, matches(result), pikanteria(result)')
      .not('published_at', 'is', null)
      .order('date', { ascending: true }),
    supabase.from('users').select('id'),
    supabase.from('pre_tournament_picks').select('user_id, winner_points, top_scorer_points'),
    fetchAllRows<{ user_id: string; points: number | null }>(() =>
      supabase.from('predictions').select('user_id, points').not('points', 'is', null),
    ),
    fetchAllRows<{ user_id: string; points: number | null }>(() =>
      supabase.from('pikanteria_answers').select('user_id, points').not('points', 'is', null),
    ),
    fetchAllRows<{ id: string; user_id: string; match_day_id: string | null; day_points: number }>(() =>
      supabase.from('score_snapshots').select('id, user_id, match_day_id, day_points'),
    ),
  ])

  const scoredDays = selectScoredSnapshotDays((matchDays ?? []) as SnapshotScoredDay[])
  const allUsers = (users ?? []) as { id: string }[]
  const allPicks = (picks ?? []) as {
    user_id: string
    winner_points: number | null
    top_scorer_points: number | null
  }[]

  // Per-day scored predictions/pikanteria, fetched once per day (all users in a
  // single query - the old code did one query *per user per day*). Paged for the
  // 1000-row cap and run in parallel across days.
  const perDay = await Promise.all(
    scoredDays.map(day =>
      Promise.all([
        fetchAllRows<{ user_id: string; points: number | null }>(() =>
          supabase
            .from('predictions')
            .select('user_id, points, matches!inner(match_day_id)')
            .eq('matches.match_day_id', day.id)
            .not('points', 'is', null),
        ),
        fetchAllRows<{ user_id: string; points: number | null }>(() =>
          supabase
            .from('pikanteria_answers')
            .select('user_id, points, pikanteria!inner(match_day_id)')
            .eq('pikanteria.match_day_id', day.id)
            .not('points', 'is', null),
        ),
      ]).then(([matchPredRows, pikAnswerRows]) => ({ day, matchPredRows, pikAnswerRows })),
    ),
  )

  // A fully-fresh view of every snapshot row keyed by (user, match day),
  // carrying the recomputed day_points and each row's real id (undefined for
  // rows that don't exist yet). Feeding this to every builder call makes each
  // row's is_valid consistent against all *other* rows' fresh day_points - so a
  // correction to one day can't leave another day's is_valid computed against a
  // stale value, regardless of write order.
  const existingIdByKey = new Map<string, string>()
  for (const snap of existingSnapshots) {
    existingIdByKey.set(snapshotKey(snap.user_id, snap.match_day_id), snap.id)
  }

  const freshExisting: {
    id?: string
    user_id: string
    match_day_id: string | null
    day_points: number
  }[] = []

  for (const { day, matchPredRows, pikAnswerRows } of perDay) {
    const matchPts = sumByUserId(matchPredRows)
    const pikPts = sumByUserId(pikAnswerRows)
    for (const u of allUsers) {
      freshExisting.push({
        id: existingIdByKey.get(snapshotKey(u.id, day.id)),
        user_id: u.id,
        match_day_id: day.id,
        day_points: (matchPts.get(u.id) ?? 0) + (pikPts.get(u.id) ?? 0),
      })
    }
  }
  for (const p of allPicks) {
    freshExisting.push({
      id: existingIdByKey.get(snapshotKey(p.user_id, null)),
      user_id: p.user_id,
      match_day_id: null,
      day_points: Number(p.winner_points ?? 0) + Number(p.top_scorer_points ?? 0),
    })
  }

  // Build all payloads in-memory (pure), then write them in a single batched
  // upsert + insert - two round-trips instead of thousands.
  const toInsert: (SnapshotPayload | PreTournamentSnapshotPayload)[] = []
  const toUpdate: ((SnapshotPayload | PreTournamentSnapshotPayload) & { id: string })[] = []

  for (const { day, matchPredRows, pikAnswerRows } of perDay) {
    const dayPayloads = buildMatchDaySnapshotPayloads({
      users: allUsers,
      matchDayId: day.id,
      stage: day.stage,
      matchPredRows,
      pikAnswerRows,
      allPredRows,
      allPikaRows,
      preTournRows: allPicks,
      existingSnapshots: freshExisting,
      now,
    })
    toInsert.push(...dayPayloads.toInsert)
    toUpdate.push(...dayPayloads.toUpdate)
  }

  const prePayloads = buildPreTournamentSnapshotPayloads({
    preTournRows: allPicks,
    allPredRows,
    allPikaRows,
    snapshots: freshExisting,
    now,
  })
  toInsert.push(...prePayloads.toInsert)
  toUpdate.push(...prePayloads.toUpdate)

  const [updateResult, insertResult] = await Promise.all([
    toUpdate.length > 0 ? supabase.from('score_snapshots').upsert(toUpdate) : Promise.resolve({ error: null }),
    toInsert.length > 0 ? supabase.from('score_snapshots').insert(toInsert) : Promise.resolve({ error: null }),
  ])
  if (updateResult.error) throw new Error(`snapshot batch update failed: ${updateResult.error.message}`)
  if (insertResult.error) throw new Error(`snapshot batch insert failed: ${insertResult.error.message}`)

  const written = toInsert.length + toUpdate.length

  // Count invalids
  const { count } = await supabase
    .from('score_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('is_valid', false)

  return { written, invalid: count ?? 0 }
}
