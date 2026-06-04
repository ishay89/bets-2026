import type { SupabaseClient } from '@supabase/supabase-js'
import type { AutomationStrategy } from './types'
import type { Database } from './supabase/types'

export type PlayerRevealRow = {
  userId: string
  displayName: string
  isMonkey: boolean
  automationStrategy: AutomationStrategy | null
  pick: string
  rank: number
  totalPoints: number
}

export function sortAndRankRevealRows(
  rows: Omit<PlayerRevealRow, 'rank'>[],
): PlayerRevealRow[] {
  return [...rows]
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((row, i) => ({ ...row, rank: i + 1 }))
}
