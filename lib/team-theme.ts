export type TeamTheme = {
  slug: string
  label: string
  accent: string
  secondary: string
  soft: string
  line: string
  glow: string
}

export type TeamThemeCssVariables = Record<`--${string}`, string>

const DEFAULT_THEME: TeamTheme = {
  slug: 'mondial',
  label: 'Mondial',
  accent: '#00d97e',
  secondary: '#f5a623',
  soft: 'rgba(0, 217, 126, 0.14)',
  line: 'rgba(0, 217, 126, 0.34)',
  glow: 'radial-gradient(circle at 72% 50%, rgba(0, 217, 126, 0.22) 0%, transparent 64%)',
}

const TEAM_THEMES: Record<string, TeamTheme> = {
  argentina: {
    slug: 'argentina',
    label: 'Argentina',
    accent: '#6bc7ff',
    secondary: '#f6f8ff',
    soft: 'rgba(107, 199, 255, 0.16)',
    line: 'rgba(107, 199, 255, 0.34)',
    glow: 'radial-gradient(circle at 72% 50%, rgba(107, 199, 255, 0.28) 0%, transparent 64%)',
  },
  france: {
    slug: 'france',
    label: 'France',
    accent: '#5aa7ff',
    secondary: '#ff5b5b',
    soft: 'rgba(90, 167, 255, 0.16)',
    line: 'rgba(90, 167, 255, 0.36)',
    glow: 'radial-gradient(circle at 72% 50%, rgba(90, 167, 255, 0.28) 0%, transparent 64%)',
  },
  brazil: {
    slug: 'brazil',
    label: 'Brazil',
    accent: '#f5d547',
    secondary: '#18a058',
    soft: 'rgba(245, 213, 71, 0.18)',
    line: 'rgba(245, 213, 71, 0.38)',
    glow: 'radial-gradient(circle at 72% 50%, rgba(245, 213, 71, 0.25) 0%, transparent 64%)',
  },
  england: {
    slug: 'england',
    label: 'England',
    accent: '#ff6b6b',
    secondary: '#f8fbff',
    soft: 'rgba(255, 107, 107, 0.16)',
    line: 'rgba(255, 107, 107, 0.34)',
    glow: 'radial-gradient(circle at 72% 50%, rgba(255, 107, 107, 0.24) 0%, transparent 64%)',
  },
  germany: {
    slug: 'germany',
    label: 'Germany',
    accent: '#f5c441',
    secondary: '#ef4f5b',
    soft: 'rgba(245, 196, 65, 0.18)',
    line: 'rgba(245, 196, 65, 0.38)',
    glow: 'radial-gradient(circle at 72% 50%, rgba(245, 196, 65, 0.24) 0%, transparent 64%)',
  },
  spain: {
    slug: 'spain',
    label: 'Spain',
    accent: '#ffbf3f',
    secondary: '#ef4f5b',
    soft: 'rgba(255, 191, 63, 0.18)',
    line: 'rgba(255, 191, 63, 0.38)',
    glow: 'radial-gradient(circle at 72% 50%, rgba(255, 191, 63, 0.25) 0%, transparent 64%)',
  },
  portugal: {
    slug: 'portugal',
    label: 'Portugal',
    accent: '#34d058',
    secondary: '#ef4f5b',
    soft: 'rgba(52, 208, 88, 0.16)',
    line: 'rgba(52, 208, 88, 0.34)',
    glow: 'radial-gradient(circle at 72% 50%, rgba(52, 208, 88, 0.24) 0%, transparent 64%)',
  },
  netherlands: {
    slug: 'netherlands',
    label: 'Netherlands',
    accent: '#ff9b42',
    secondary: '#5aa7ff',
    soft: 'rgba(255, 155, 66, 0.18)',
    line: 'rgba(255, 155, 66, 0.36)',
    glow: 'radial-gradient(circle at 72% 50%, rgba(255, 155, 66, 0.25) 0%, transparent 64%)',
  },
  usa: {
    slug: 'usa',
    label: 'USA',
    accent: '#6bb7ff',
    secondary: '#ff5b5b',
    soft: 'rgba(107, 183, 255, 0.16)',
    line: 'rgba(107, 183, 255, 0.34)',
    glow: 'radial-gradient(circle at 72% 50%, rgba(107, 183, 255, 0.25) 0%, transparent 64%)',
  },
  mexico: {
    slug: 'mexico',
    label: 'Mexico',
    accent: '#25c26e',
    secondary: '#f3f0e2',
    soft: 'rgba(37, 194, 110, 0.16)',
    line: 'rgba(37, 194, 110, 0.34)',
    glow: 'radial-gradient(circle at 72% 50%, rgba(37, 194, 110, 0.24) 0%, transparent 64%)',
  },
}

function normalizeTeamName(teamName: string | null | undefined): string {
  return teamName?.trim().toLowerCase() ?? ''
}

export function getTeamTheme(teamName: string | null | undefined): TeamTheme {
  return TEAM_THEMES[normalizeTeamName(teamName)] ?? DEFAULT_THEME
}

export function getTeamThemeCssVariables(teamName: string | null | undefined): TeamThemeCssVariables {
  const theme = getTeamTheme(teamName)
  return {
    '--team-theme-name': theme.label,
    '--team-primary': theme.accent,
    '--team-secondary': theme.secondary,
    '--color-accent': theme.accent,
    '--color-accent-soft': theme.soft,
    '--color-accent-line': theme.line,
    '--border-accent': theme.line,
    '--hero-glow': theme.glow,
  }
}
