import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ScenarioSimulator } from './scenario-simulator'

describe('ScenarioSimulator', () => {
  it('starts compact and explains that scenarios are previews', () => {
    const markup = renderToStaticMarkup(
      <ScenarioSimulator entries={[]} picks={[]} currentUserId="user-1" />,
    )

    expect(markup).toContain('Scenarios')
    expect(markup).toContain('Pick the final outcome and preview the table')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('Scenario winner')
  })
})
