// football-data.org v4 client + pure mapping helpers for the results sync.
//
// Free tier is enough for what we need: finished World Cup matches with a
// full-time score. We read the competition's *current* season (the WC is the
// current WC season during the tournament), filter to FINISHED, and convert
// each into a 1 / X / 2 suggestion. The HTTP layer is intentionally thin; all
// the testable logic lives in the pure helpers below.

import type { Pick, Stage } from './types'

const FD_BASE = 'https://api.football-data.org/v4'

// ─── Provider response shapes (only the fields we consume) ───────────────────

export interface FdScore {
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
  duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' | string
  fullTime: { home: number | null; away: number | null }
}

export interface FdMatch {
  id: number
  utcDate: string
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | string
  // Current match minute for live games (IN_PLAY / PAUSED). null pre-match;
  // the provider also returns injuryTime separately when stoppage time is on.
  minute?: number | null
  injuryTime?: number | null
  stage: string
  group: string | null
  homeTeam: { id: number | null; name: string | null; shortName?: string | null }
  awayTeam: { id: number | null; name: string | null; shortName?: string | null }
  score: FdScore
}

export interface FdMatchesResponse {
  matches: FdMatch[]
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

// Normalize a team name for cross-source comparison: lowercase, strip accents,
// drop punctuation, collapse whitespace. "Côte d'Ivoire" -> "cote d ivoire".
export function normalizeTeamName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Aliases bridge the names our seed data uses and the names football-data.org
// returns. Keyed by the NORMALIZED form; both sides are normalized before
// lookup, so an entry only needs to exist once per real-world team. Values are
// the canonical normalized key both sides resolve to.
const TEAM_ALIASES: Record<string, string> = {
  // seed name -> canonical            // provider variants -> canonical
  'czechia': 'czech republic',
  'turkiye': 'turkey',
  'cote d ivoire': 'ivory coast',
  'cabo verde': 'cape verde',
  'cape verde islands': 'cape verde',
  'bosnia herzegovina': 'bosnia and herzegovina',
  'dr congo': 'congo dr',
  'south korea': 'korea republic',
  'iran': 'ir iran',
  'usa': 'united states',
  'curacao': 'curacao',
}

// Resolve a (possibly source-specific) team name to a canonical key suitable
// for equality comparison across sources.
export function canonicalTeamKey(name: string): string {
  const norm = normalizeTeamName(name)
  return TEAM_ALIASES[norm] ?? norm
}

// Convert a finished provider score into our 1 / X / 2 outcome. We compare the
// full-time scoreline rather than score.winner, so a knockout drawn after 90'
// but won on penalties still maps to 'X' at full time — the value bettors
// actually predicted. Callers should still let an admin confirm knockouts.
export function fdScoreToPick(score: FdScore): Pick | null {
  const { home, away } = score.fullTime
  if (home == null || away == null) return null
  if (home > away) return '1'
  if (home < away) return '2'
  return 'X'
}

// Is this match finished and safe to turn into a suggestion?
export function isScorableFdMatch(m: FdMatch): boolean {
  return m.status === 'FINISHED' && fdScoreToPick(m.score) != null
}

// ─── HTTP layer ──────────────────────────────────────────────────────────────

export interface FootballDataConfig {
  apiKey: string
  competition?: string // default 'WC'
}

export function getFootballDataConfig(): FootballDataConfig | null {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY
  if (!apiKey) return null
  return {
    apiKey,
    competition: process.env.FOOTBALL_DATA_COMPETITION || 'WC',
  }
}

// Fetch finished matches for the competition's current season. Optional date
// window narrows the call (and helps stay under the free-tier rate limit).
export async function fetchFinishedMatches(
  config: FootballDataConfig,
  opts: { dateFrom?: string; dateTo?: string } = {},
): Promise<FdMatch[]> {
  const competition = config.competition || 'WC'
  const params = new URLSearchParams({ status: 'FINISHED' })
  if (opts.dateFrom) params.set('dateFrom', opts.dateFrom)
  if (opts.dateTo) params.set('dateTo', opts.dateTo)

  const url = `${FD_BASE}/competitions/${competition}/matches?${params}`
  const res = await fetch(url, {
    headers: { 'X-Auth-Token': config.apiKey },
    // Always hit the network; results change during match days.
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `football-data.org request failed (${res.status} ${res.statusText}): ${body.slice(0, 200)}`,
    )
  }

  const json = (await res.json()) as FdMatchesResponse
  return (json.matches ?? []).filter(isScorableFdMatch)
}

// ─── Stage mapping ───────────────────────────────────────────────────────────

// Map a football-data.org stage enum to our internal Stage. Returns null for
// stages we don't model (qualification, etc.).
export function fdStageToStage(stage: string): Stage | null {
  switch (stage) {
    case 'GROUP_STAGE': return 'group'
    case 'LAST_32': return 'r32'
    case 'LAST_16': return 'r16'
    case 'QUARTER_FINALS': return 'qf'
    case 'SEMI_FINALS': return 'sf'
    case 'THIRD_PLACE': return '3rd'
    case 'FINAL': return 'final'
    default: return null
  }
}

// Fetch every match of the competition's current season, regardless of status.
// Used by the one-time fixtures backfill (id mapping + knockout seeding), where
// we want scheduled knockout placeholders too, not just finished games.
export async function fetchAllMatches(config: FootballDataConfig): Promise<FdMatch[]> {
  const competition = config.competition || 'WC'
  const url = `${FD_BASE}/competitions/${competition}/matches`
  const res = await fetch(url, {
    headers: { 'X-Auth-Token': config.apiKey },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `football-data.org request failed (${res.status} ${res.statusText}): ${body.slice(0, 200)}`,
    )
  }
  const json = (await res.json()) as FdMatchesResponse
  return json.matches ?? []
}
