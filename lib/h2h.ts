// Head-to-Head (H2H) pure comparison logic.
//
// NO Supabase imports — this module is pure so it runs under node Vitest like
// lib/scoring.test.ts. The H2H pages build the H2HRound[] payload from the
// fetched (RLS-filtered) data, then call buildH2H() to derive the summary.
//
// Privacy note (see supabase/migrations/009_crowd_picks.sql): an opponent's
// pick on an unlocked match never reaches the client. The page distinguishes
// "hidden" (locked === false, no row) from "no pick" (locked === true, no row)
// and passes that through here. A hidden pick is treated as `null` + hidden so
// it is excluded from agreement counting and never leaks.

import type { Pick } from './types'

/** One side's pick on a single comparison item (match or pikanteria). */
export interface H2HSide {
  /** The chosen pick/option, or null when there is no pick or it is hidden. */
  pick: Pick | string | null
  /** Whether this pick is correct (matched the result). null = not yet scored. */
  correct: boolean | null
  /** Stored points earned for this item (0 when missed / unscored). */
  points: number
  /**
   * True only for the OPPONENT side when the item is not yet locked, so the
   * pick is hidden by RLS rather than genuinely absent. Never true for "me".
   */
  hidden?: boolean
}

/** A single comparison item within a round (one match or one pikanteria). */
export interface H2HMatch {
  /** Stable id (match id or pikanteria id). */
  id: string
  /** Whether this item has a final result yet (scored). */
  resolved: boolean
  /** My side. */
  mine: H2HSide
  /** Their (opponent) side. */
  theirs: H2HSide
}

/** A round = one match_day with its matches + pikanteria items. */
export interface H2HRound {
  matchDayId: string
  items: H2HMatch[]
}

export type RoundWinner = 'me' | 'them' | 'tie' | 'pending'

/** A round augmented with its computed totals + winner. */
export interface H2HRoundResult {
  matchDayId: string
  myPoints: number
  theirPoints: number
  winner: RoundWinner
  items: H2HMatch[]
}

export interface H2HSummary {
  myTotal: number
  theirTotal: number
  roundsWon: { me: number; them: number; tie: number }
  /** Items where both picked the same (visible) option. */
  agreements: number
  /** Items where both picked but chose differently (both visible). */
  disagreements: number
  /** agreements / (agreements + disagreements), 0 when no comparable items. */
  agreementRate: number
}

/**
 * Compare two picks for the agreement stat.
 * - 'unknown' when either side has no comparable pick (missing or hidden).
 * - 'agree' when both picked the same option.
 * - 'differ' when both picked but chose differently.
 */
export function pickAgreement(
  mine: H2HSide['pick'] | undefined,
  theirs: H2HSide['pick'] | undefined,
  theirsHidden: boolean = false,
): 'agree' | 'differ' | 'unknown' {
  if (theirsHidden) return 'unknown'
  if (mine == null || theirs == null) return 'unknown'
  return mine === theirs ? 'agree' : 'differ'
}

function sumPoints(items: H2HMatch[], side: 'mine' | 'theirs'): number {
  const total = items.reduce((acc, it) => acc + (it[side].points ?? 0), 0)
  // Keep totals clean (stored points are already 2dp; guard float drift).
  return Math.round(total * 100) / 100
}

/**
 * Determine a round's winner from summed points.
 * - higher points wins ('me' / 'them')
 * - equal & both scored points > 0 → 'tie'
 * - equal & zero points: 'pending' if any item is still unresolved, else 'tie'
 *   (a fully-scored 0–0 round is a genuine tie, not pending).
 */
export function roundWinner(
  myPoints: number,
  theirPoints: number,
  items: H2HMatch[],
): RoundWinner {
  if (myPoints > theirPoints) return 'me'
  if (theirPoints > myPoints) return 'them'
  // Equal from here.
  if (myPoints > 0) return 'tie'
  // Both zero: pending if anything is still unresolved.
  const hasUnresolved = items.some(it => !it.resolved)
  return hasUnresolved ? 'pending' : 'tie'
}

/**
 * Build the full H2H summary + per-round results.
 *
 * @param rounds   ordered list of rounds (each with its items)
 * @param _myId    my user id (kept for symmetry / future use)
 * @param _theirId opponent user id
 */
export function buildH2H(
  rounds: H2HRound[],
  _myId: string,
  _theirId: string,
): { rounds: H2HRoundResult[]; summary: H2HSummary } {
  const results: H2HRoundResult[] = rounds.map(r => {
    const myPoints = sumPoints(r.items, 'mine')
    const theirPoints = sumPoints(r.items, 'theirs')
    return {
      matchDayId: r.matchDayId,
      myPoints,
      theirPoints,
      winner: roundWinner(myPoints, theirPoints, r.items),
      items: r.items,
    }
  })

  const roundsWon = { me: 0, them: 0, tie: 0 }
  for (const r of results) {
    if (r.winner === 'me') roundsWon.me++
    else if (r.winner === 'them') roundsWon.them++
    else if (r.winner === 'tie') roundsWon.tie++
    // 'pending' rounds count toward nobody.
  }

  let agreements = 0
  let disagreements = 0
  for (const r of rounds) {
    for (const it of r.items) {
      const a = pickAgreement(it.mine.pick, it.theirs.pick, it.theirs.hidden)
      if (a === 'agree') agreements++
      else if (a === 'differ') disagreements++
    }
  }

  const comparable = agreements + disagreements
  const agreementRate = comparable === 0 ? 0 : Math.round((agreements / comparable) * 100)

  const myTotal = Math.round(results.reduce((a, r) => a + r.myPoints, 0) * 100) / 100
  const theirTotal = Math.round(results.reduce((a, r) => a + r.theirPoints, 0) * 100) / 100

  return {
    rounds: results,
    summary: {
      myTotal,
      theirTotal,
      roundsWon,
      agreements,
      disagreements,
      agreementRate,
    },
  }
}
