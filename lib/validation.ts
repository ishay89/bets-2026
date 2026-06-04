import { TEAM_NAMES, SCORER_NAMES } from './pre-tournament'
import type { Pick } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_PICKS: Pick[] = ['1', 'X', '2']

function str(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' ? value : null
}

export function parseUUID(value: FormDataEntryValue | null, field: string): string {
  const v = str(value)
  if (!v || !UUID_RE.test(v)) throw new Error(`Invalid ${field}: expected a UUID`)
  return v
}

export function parsePick(value: FormDataEntryValue | null, field: string): Pick {
  const v = str(value)
  if (!v || !(VALID_PICKS as string[]).includes(v)) {
    throw new Error(`Invalid result for ${field}: must be 1, X, or 2`)
  }
  return v as Pick
}

export function parseOdds(value: FormDataEntryValue | null, field: string): number {
  const v = str(value)
  const n = v === null ? NaN : parseFloat(v)
  if (!Number.isFinite(n) || n <= 0 || n > 1000) {
    throw new Error(`Invalid odds for ${field}: must be a positive number (max 1000)`)
  }
  return n
}

export function parseNonEmpty(value: FormDataEntryValue | null, field: string): string {
  const v = str(value)?.trim()
  if (!v) throw new Error(`${field} cannot be empty`)
  return v
}

export interface PikanteriaOutcomes {
  label_1: string
  odds_1: number
  label_2: string
  odds_2: number
  label_x: string | null
  odds_x: number | null
}

// Parse the 1/X/2 outcome fields emitted by <PicanteriaBuilder>. X is optional:
// when the "add a third outcome" box is unchecked, label_x/odds_x are null and
// the question is two-way.
export function parsePikanteriaOutcomes(formData: FormData): PikanteriaOutcomes {
  const label_1 = parseNonEmpty(formData.get('pik_label_1'), 'outcome 1 label')
  const odds_1 = parseOdds(formData.get('pik_odds_1'), 'outcome 1 odds')
  const label_2 = parseNonEmpty(formData.get('pik_label_2'), 'outcome 2 label')
  const odds_2 = parseOdds(formData.get('pik_odds_2'), 'outcome 2 odds')
  const hasX = formData.get('pik_has_x') === 'on'
  const label_x = hasX ? parseNonEmpty(formData.get('pik_label_x'), 'outcome X label') : null
  const odds_x = hasX ? parseOdds(formData.get('pik_odds_x'), 'outcome X odds') : null
  return { label_1, odds_1, label_2, odds_2, label_x, odds_x }
}

export function parseTeamName(value: FormDataEntryValue | null): string {
  const v = str(value)
  if (!v || !TEAM_NAMES.includes(v as typeof TEAM_NAMES[number])) {
    throw new Error(`Invalid team: must be one of ${TEAM_NAMES.join(', ')}`)
  }
  return v
}

export function parseScorerName(value: FormDataEntryValue | null): string {
  const v = str(value)
  if (!v || !SCORER_NAMES.includes(v as typeof SCORER_NAMES[number])) {
    throw new Error(`Invalid scorer: must be one of ${SCORER_NAMES.join(', ')}`)
  }
  return v
}
