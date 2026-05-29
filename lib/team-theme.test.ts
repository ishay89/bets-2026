import { describe, expect, it } from 'vitest'
import { getTeamTheme, getTeamThemeCssVariables } from './team-theme'

describe('team theme', () => {
  it('falls back to the default mondial theme when no winning team is picked', () => {
    expect(getTeamTheme(null)).toMatchObject({
      slug: 'mondial',
      label: 'Mondial',
      accent: '#00d97e',
    })
  })

  it('normalizes team names before selecting a theme', () => {
    expect(getTeamTheme('  brazil  ')).toMatchObject({
      slug: 'brazil',
      label: 'Brazil',
      accent: '#f5d547',
      secondary: '#18a058',
    })
  })

  it('returns CSS variables that can be applied to the document root', () => {
    expect(getTeamThemeCssVariables('Argentina')).toMatchObject({
      '--team-theme-name': 'Argentina',
      '--team-primary': '#6bc7ff',
      '--team-secondary': '#f6f8ff',
      '--color-accent': '#6bc7ff',
      '--color-accent-soft': 'rgba(107, 199, 255, 0.16)',
      '--border-accent': 'rgba(107, 199, 255, 0.34)',
    })
  })

  it('uses the default theme variables for unsupported teams', () => {
    expect(getTeamThemeCssVariables('Atlantis FC')).toMatchObject({
      '--team-theme-name': 'Mondial',
      '--team-primary': '#00d97e',
      '--team-secondary': '#f5a623',
    })
  })
})
