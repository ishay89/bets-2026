// Shared presentation helpers (flags, avatars, stage labels, marker labels).
//
// These were previously duplicated across app/page.tsx, components/leaderboard.tsx,
// app/pre-tournament/page.tsx, etc. The H2H pages consume them from here. Pure —
// no Supabase imports — so it is safe to import from server or client components.

import type { AutomationStrategy } from './types'

const STAGE_LABELS: Record<string, string> = {
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

/** Formats a positive integer with its ordinal suffix (1st, 2nd, 3rd, 4th, 11th, 21st, ...). */
export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

// ISO 3166-1 alpha-2 codes for flagcdn.com flag images.
// Covers all WC 2026 participants plus common name variants from football-data.org.
const FLAG_CODES: Record<string, string> = {
  Algeria: 'dz', Argentina: 'ar', Australia: 'au', Austria: 'at',
  Belgium: 'be', 'Bosnia-Herzegovina': 'ba', Brazil: 'br',
  'Cabo Verde': 'cv', 'Cape Verde Islands': 'cv',
  Canada: 'ca', Colombia: 'co', Croatia: 'hr', Curaçao: 'cw',
  Czechia: 'cz', 'DR Congo': 'cd', 'Congo DR': 'cd',
  Ecuador: 'ec', Egypt: 'eg', England: 'gb-eng',
  France: 'fr', Germany: 'de', Ghana: 'gh', Haiti: 'ht',
  Iran: 'ir', Iraq: 'iq', Italy: 'it', 'Ivory Coast': 'ci', "Côte d'Ivoire": 'ci',
  Japan: 'jp', Jordan: 'jo', Mexico: 'mx', Morocco: 'ma',
  Netherlands: 'nl', 'New Zealand': 'nz', Norway: 'no',
  Panama: 'pa', Paraguay: 'py', Portugal: 'pt', Qatar: 'qa',
  'Saudi Arabia': 'sa', Scotland: 'gb-sct', Senegal: 'sn',
  'South Africa': 'za', 'South Korea': 'kr', Spain: 'es',
  Sweden: 'se', Switzerland: 'ch', Tunisia: 'tn',
  Turkey: 'tr', Türkiye: 'tr',
  Uruguay: 'uy', USA: 'us', 'United States': 'us',
  Uzbekistan: 'uz',
}

/** Returns a flagcdn.com image URL (40px wide) for the given team name, or null if unknown. */
export function getFlagUrl(name: string): string | null {
  const code = FLAG_CODES[name]
  return code ? `https://flagcdn.com/w40/${code}.png` : null
}

const EMOJI_FLAGS: Record<string, string> = {
  France: '🇫🇷', Spain: '🇪🇸', Brazil: '🇧🇷', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Argentina: '🇦🇷', Netherlands: '🇳🇱', Portugal: '🇵🇹', Germany: '🇩🇪',
  Italy: '🇮🇹', Belgium: '🇧🇪', Croatia: '🇭🇷', Uruguay: '🇺🇾',
  Mexico: '🇲🇽', USA: '🇺🇸', Canada: '🇨🇦', Japan: '🇯🇵',
  'South Korea': '🇰🇷', Morocco: '🇲🇦',
  Algeria: '🇩🇿', Australia: '🇦🇺', Austria: '🇦🇹', 'Bosnia-Herzegovina': '🇧🇦',
  'Cabo Verde': '🇨🇻', 'Cape Verde Islands': '🇨🇻', Colombia: '🇨🇴',
  "Côte d'Ivoire": '🇨🇮', 'Ivory Coast': '🇨🇮', Curaçao: '🇨🇼',
  Czechia: '🇨🇿', 'DR Congo': '🇨🇩', 'Congo DR': '🇨🇩', Ecuador: '🇪🇨', Egypt: '🇪🇬',
  Ghana: '🇬🇭', Haiti: '🇭🇹', Iran: '🇮🇷', Iraq: '🇮🇶',
  Jordan: '🇯🇴', 'New Zealand': '🇳🇿', Norway: '🇳🇴', Panama: '🇵🇦',
  Paraguay: '🇵🇾', Qatar: '🇶🇦', 'Saudi Arabia': '🇸🇦', Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  Senegal: '🇸🇳', 'South Africa': '🇿🇦', Sweden: '🇸🇪', Switzerland: '🇨🇭',
  Tunisia: '🇹🇳', Türkiye: '🇹🇷', Turkey: '🇹🇷', 'United States': '🇺🇸', Uzbekistan: '🇺🇿',
}

/** Returns an emoji flag for use in text contexts (h2h, profile pages). */
export function getFlag(name: string): string {
  return EMOJI_FLAGS[name] ?? '🏳️'
}

const AVATARS = ['🦁','🐯','🦊','🐺','🦅','🐻','🐼','🦝','🦄','🐉','🦋','🌟','🔥','⚡','🎯']

/**
 * Emoji a player can choose for their own avatar on the Me tab. Kept here so the
 * picker UI and any validation share a single source of truth.
 */
export const AVATAR_EMOJIS = [
  '🦁','🐯','🐱','🦊','🐺','🐻','🐼','🐨','🐸','🐵',
  '🦅','🦆','🦉','🐲','🐉','🦄','🐳','🦈','🐙','🦋',
  '⚽','🏆','🥇','🎯','🎲','🃏','👑','💎','🚀','🛸',
  '⚡','🔥','🌟','✨','🌈','💥','☄️','🌊','🍀','🎉',
  '😎','🤩','🥶','🤖','👽','💀','🤡','👻','🦾','🧠',
]

/** True when a string is exactly one of the selectable avatar emojis. */
export function isValidAvatarEmoji(value: unknown): value is string {
  return typeof value === 'string' && (AVATAR_EMOJIS as string[]).includes(value)
}

/**
 * Marker / monkey aware avatar. Honours a player's chosen emoji, otherwise falls
 * back to a name-derived animal. Automated benchmark users always keep their
 * fixed symbols — they are not user-editable.
 */
export function getAvatar(player: {
  display_name: string
  is_monkey?: boolean | null
  automation_strategy?: AutomationStrategy | null
  avatar_emoji?: string | null
}): string {
  if (player.automation_strategy === 'max') return '▲'
  if (player.automation_strategy === 'mid') return '◆'
  if (player.automation_strategy === 'min') return '▼'
  if (player.is_monkey) return '🐒'
  if (player.avatar_emoji) return player.avatar_emoji
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
