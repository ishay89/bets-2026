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
