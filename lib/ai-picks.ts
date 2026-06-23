import type { Pick } from './types'

// AI-controlled dummy players (see supabase/migrations/20260608000000_ai_dummy_users.sql).
// They are approved regular users with stable IDs; /admin/ai-picks now targets
// them through the same approved-user selector as human players.
export const AI_USERS = [
  { id: '00000000-0000-0000-0000-000000000006', name: 'Claude', slug: 'claude' },
  { id: '00000000-0000-0000-0000-000000000005', name: 'Codex', slug: 'codex' },
] as const

export type AiUser = (typeof AI_USERS)[number]

export function aiUserBySlug(slug: string | undefined): AiUser {
  return AI_USERS.find(u => u.slug === slug) ?? AI_USERS[0]
}

export function aiUserById(id: string): AiUser | undefined {
  return AI_USERS.find(u => u.id === id)
}

// X is only a valid pikanteria pick when the question is three-way (odds_x set),
// mirroring the save_pikanteria_answer RPC's validation.
export function isValidPikanteriaPick(pick: Pick, oddsX: number | null): boolean {
  return pick !== 'X' || oddsX != null
}

// Fill-missing-only filter for bot futures generation: never overwrite an
// existing pick (re-running must not re-roll Monkey's random choice).
export function usersMissingFutures<T extends { id: string }>(
  users: T[],
  existingUserIds: ReadonlySet<string>,
): T[] {
  return users.filter(u => !existingUserIds.has(u.id))
}
