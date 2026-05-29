// Shared presentation helpers (flags, avatars, stage labels, marker labels).
//
// These were previously duplicated across app/page.tsx, components/leaderboard.tsx,
// app/pre-tournament/page.tsx, etc. The H2H pages consume them from here. Pure —
// no Supabase imports — so it is safe to import from server or client components.

import type { AutomationStrategy } from './types'

export const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage',
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter Finals',
  sf: 'Semi Finals',
  '3rd': 'Third Place',
  final: 'Final',
}

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage
}

export const FLAGS: Record<string, string> = {
  France: '🇫🇷', Spain: '🇪🇸', Brazil: '🇧🇷', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Argentina: '🇦🇷', Netherlands: '🇳🇱', Portugal: '🇵🇹', Germany: '🇩🇪',
  Italy: '🇮🇹', Belgium: '🇧🇪', Croatia: '🇭🇷', Uruguay: '🇺🇾',
  Mexico: '🇲🇽', USA: '🇺🇸', Canada: '🇨🇦', Japan: '🇯🇵',
  'South Korea': '🇰🇷', Morocco: '🇲🇦',
}

export function getFlag(name: string): string {
  return FLAGS[name] ?? '🏳️'
}

export const AVATARS = ['🦁','🐯','🦊','🐺','🦅','🐻','🐼','🦝','🦄','🐉','🦋','🌟','🔥','⚡','🎯']

/** Marker / monkey aware avatar. Falls back to a name-derived animal. */
export function getAvatar(player: {
  display_name: string
  is_monkey?: boolean | null
  automation_strategy?: AutomationStrategy | null
}): string {
  if (player.automation_strategy === 'max') return '▲'
  if (player.automation_strategy === 'mid') return '◆'
  if (player.automation_strategy === 'min') return '▼'
  if (player.is_monkey) return '🐒'
  return AVATARS[player.display_name.charCodeAt(0) % AVATARS.length]
}

/** Human-readable label for an automated baseline, or null for a human. */
export function getAutomationLabel(player: {
  is_monkey?: boolean | null
  automation_strategy?: AutomationStrategy | null
}): string | null {
  if (player.automation_strategy === 'max') return 'max marker'
  if (player.automation_strategy === 'mid') return 'mid marker'
  if (player.automation_strategy === 'min') return 'min marker'
  if (player.automation_strategy === 'monkey' || player.is_monkey) return 'shadow'
  return null
}

/** Whether a player is an automated baseline (monkey or marker). */
export function isAutomated(player: {
  is_monkey?: boolean | null
  automation_strategy?: AutomationStrategy | null
}): boolean {
  return Boolean(player.automation_strategy || player.is_monkey)
}
