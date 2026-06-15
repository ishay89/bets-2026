// Shared match-scoring core, used by the automated results sync to score
// matches without an admin in the loop. It mirrors the match half of the
// /admin/results scoreItems flow: build the point payload from current odds and
// predictions, write it through the atomic enter_match_day_results RPC, lock the
// scored matches (which also reveals crowd/individual picks), then refresh the
// day snapshot. Pikanteria are never auto-scored — they have no provider source.
//
// Scoring is grouped per match day because enter_match_day_results is a per-day
// atomic transaction. Partial-day scoring is safe: already-scored matches keep
// their points and unscored ones have result IS NULL, so the RPC's whole-day
// invariants still hold.

import type { createAdminClient } from './supabase/server'
import type { Pick } from './types'
import { snapshotMatchDay } from './score-validation'
import { buildMatchScoringPayload, type ScoredMatchInput } from './scoring-writes'

type AdminClient = ReturnType<typeof createAdminClient>

export interface MatchToScore {
  matchId: string
  matchDayId: string
  result: Pick
}

export interface AutoScoreResult {
  scoredMatchIds: string[]
  // Per-day failures are surfaced rather than thrown, so one bad day doesn't
  // block scoring the others. Each entry is { matchDayId, error }.
  failures: { matchDayId: string; error: string }[]
}

export async function autoScoreMatches(
  supabase: AdminClient,
  items: MatchToScore[],
): Promise<AutoScoreResult> {
  const byDay = new Map<string, MatchToScore[]>()
  for (const it of items) {
    const list = byDay.get(it.matchDayId) ?? []
    list.push(it)
    byDay.set(it.matchDayId, list)
  }

  const scoredMatchIds: string[] = []
  const failures: { matchDayId: string; error: string }[] = []

  for (const [matchDayId, dayItems] of byDay) {
    try {
      const matchIds = dayItems.map(i => i.matchId)
      const resultById = new Map(dayItems.map(i => [i.matchId, i.result]))

      const { data: matchRows, error: matchesError } = await supabase
        .from('matches')
        .select('id, odds_home, odds_draw, odds_away')
        .eq('match_day_id', matchDayId)
        .in('id', matchIds)
      if (matchesError) throw matchesError

      const { data: predictions, error: predsError } = await supabase
        .from('predictions')
        .select('id, match_id, pick')
        .in('match_id', matchIds)
      if (predsError) throw predsError

      const predsByMatch = new Map<string, { id: string; pick: Pick }[]>()
      for (const p of (predictions ?? []) as { id: string; match_id: string; pick: Pick }[]) {
        const list = predsByMatch.get(p.match_id) ?? []
        list.push({ id: p.id, pick: p.pick })
        predsByMatch.set(p.match_id, list)
      }

      const inputs: ScoredMatchInput[] = (matchRows ?? []).map(m => ({
        id: m.id,
        odds_home: m.odds_home,
        odds_draw: m.odds_draw,
        odds_away: m.odds_away,
        result: resultById.get(m.id)!,
        predictions: predsByMatch.get(m.id) ?? [],
      }))
      if (inputs.length === 0) continue

      const { matchResults, predictionPoints } = buildMatchScoringPayload(inputs)

      const { error } = await supabase.rpc('enter_match_day_results', {
        p_match_day_id: matchDayId,
        p_match_results: matchResults,
        p_prediction_points: predictionPoints,
        p_pikanteria_results: [],
        p_answer_points: [],
      })
      if (error) throw new Error(error.message)

      const scoredIds = inputs.map(i => i.id)
      const { error: lockError } = await supabase
        .from('matches')
        .update({ locked: true })
        .in('id', scoredIds)
      if (lockError) throw lockError

      // Snapshots are derived/recoverable, so they stay outside the scoring txn.
      await snapshotMatchDay(supabase, matchDayId)

      scoredMatchIds.push(...scoredIds)
    } catch (err) {
      failures.push({ matchDayId, error: err instanceof Error ? err.message : 'unknown error' })
    }
  }

  return { scoredMatchIds, failures }
}
