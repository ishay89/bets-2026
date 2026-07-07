import { AI_USERS } from './ai-picks'
import type { LeaderboardEntry } from './types'

/** Prize pot per the league rules, paid by final standing: 1st..5th. */
export const PRIZES = [3400, 2380, 1020, 200, 100] as const

/** Fines per the league rules: last place pays ₪200, second-to-last ₪100. */
export const FINES = [200, 100] as const

const AI_USER_IDS = new Set<string>(AI_USERS.map(u => u.id))

type EligibilityFields = Pick<LeaderboardEntry, 'id' | 'automation_strategy' | 'is_monkey'>

/**
 * Only real humans can earn from the pot or pay fines. Automated baselines
 * (min/mid/max markers, monkeys) and the AI players (Claude, Codex — regular
 * approved users, so they carry no automation flag) are all excluded.
 */
export function isRealUser(entry: EligibilityFields): boolean {
  if (entry.automation_strategy || entry.is_monkey) return false
  return !AI_USER_IDS.has(entry.id)
}

export type PotAssignments = {
  prizeByEntryId: Map<string, number>
  fineByEntryId: Map<string, number>
}

/**
 * Walks the standings (already sorted, best first) and assigns prize amounts
 * to the top five real users and fines to the bottom two. Ineligible entries
 * are skipped without consuming a slot. The maps are independent: in a pool
 * smaller than seven the same player can hold both a prize and a fine.
 */
export function computePotAssignments(
  sortedEntries: readonly LeaderboardEntry[],
): PotAssignments {
  const eligible = sortedEntries.filter(isRealUser)

  const prizeByEntryId = new Map<string, number>()
  PRIZES.forEach((amount, i) => {
    const winner = eligible[i]
    if (winner) prizeByEntryId.set(winner.id, amount)
  })

  const fineByEntryId = new Map<string, number>()
  if (eligible.length >= 2) {
    FINES.forEach((amount, i) => {
      fineByEntryId.set(eligible[eligible.length - 1 - i].id, amount)
    })
  }

  return { prizeByEntryId, fineByEntryId }
}
