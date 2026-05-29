// Crowd Picks & Insights — pure logic (no Supabase imports, fully unit-tested).
//
// Crowd data is only ever revealed AFTER a match locks (enforced in SQL by the
// crowd_match_picks / crowd_pikanteria_picks RPCs in migration 009), so showing
// it can never leak a live pick or let players copy each other before lock.

import type { Pick } from './types'

export interface CrowdTally {
  '1': number
  X: number
  '2': number
  total: number
}

export interface CrowdPct {
  '1': number
  X: number
  '2': number
}

export type InsightTone = 'accent' | 'amber' | 'neutral'
export type InsightKind = 'consensus' | 'split' | 'lone_wolf' | 'underdog_hero'

export interface Insight {
  kind: InsightKind
  tone: InsightTone
  label: string
}

const PICK_LABELS: Record<Pick, string> = { '1': 'Home', X: 'Draw', '2': 'Away' }
const PICKS: Pick[] = ['1', 'X', '2']

/**
 * Convert raw counts to whole-number percentages that sum to exactly 100 using
 * the largest-remainder method. Returns all zeros when there are no votes.
 */
export function largestRemainder(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0)
  if (total <= 0) return values.map(() => 0)
  const exact = values.map(v => (v / total) * 100)
  const out = exact.map(v => Math.floor(v))
  let remainder = 100 - out.reduce((s, v) => s + v, 0)
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    out[order[k].i]++
  }
  return out
}

export function toPct(t: CrowdTally): CrowdPct {
  const [home, draw, away] = largestRemainder([t['1'], t.X, t['2']])
  return { '1': home, X: draw, '2': away }
}

/**
 * Pick the single most interesting insight for a match, or null if nothing
 * stands out. Tuned for a friends pool with odds-based, reward-the-underdog
 * scoring, so backing a lonely high-odds pick is celebrated.
 */
export function matchInsight(args: {
  tally: CrowdTally
  odds: { '1': number; X: number; '2': number }
  myPick: Pick | null
}): Insight | null {
  const { tally, odds, myPick } = args
  if (tally.total <= 0) return null

  const pct = toPct(tally)
  const count = (p: Pick) => tally[p]
  const maxCount = Math.max(count('1'), count('X'), count('2'))

  // The underdog = the single highest-odds outcome (skip when there's a tie).
  const maxOdds = Math.max(odds['1'], odds.X, odds['2'])
  const topOdds = PICKS.filter(p => odds[p] === maxOdds)
  const underdog = topOdds.length === 1 ? topOdds[0] : null

  // 1. Underdog hero — you're alone (or in a tiny minority) on the long shot.
  if (myPick && underdog && myPick === underdog && pct[underdog] < 25 && count(underdog) >= 1) {
    return count(underdog) === 1
      ? { kind: 'underdog_hero', tone: 'accent', label: `You're the only one backing ${PICK_LABELS[underdog]}` }
      : { kind: 'underdog_hero', tone: 'accent', label: `Brave minority on ${PICK_LABELS[underdog]}` }
  }

  // 2. Consensus — the crowd piled onto one outcome (headline over a lone holdout).
  const top = PICKS.reduce((a, b) => (pct[b] > pct[a] ? b : a), '1' as Pick)
  if (tally.total >= 3 && pct[top] >= 80) {
    return { kind: 'consensus', tone: 'neutral', label: `${pct[top]}% agree · ${PICK_LABELS[top]}` }
  }

  // 3. Lone wolf — exactly one player on an outcome the rest of the crowd skipped.
  const ones = PICKS.filter(p => count(p) === 1)
  if (tally.total >= 3 && ones.length === 1 && maxCount > 1) {
    const lone = ones[0]
    return myPick === lone
      ? { kind: 'lone_wolf', tone: 'accent', label: `You're the only one on ${PICK_LABELS[lone]}` }
      : { kind: 'lone_wolf', tone: 'amber', label: `Only 1 bet on ${PICK_LABELS[lone]}` }
  }

  // 4. Dead split — nobody can agree.
  if (tally.total >= 4 && pct[top] <= 45) {
    return { kind: 'split', tone: 'neutral', label: 'Dead split · nobody agrees' }
  }

  return null
}
