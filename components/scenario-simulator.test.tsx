import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ScenarioSimulator } from './scenario-simulator'

describe('ScenarioSimulator', () => {
  it('starts open so the scenario picker is immediately visible', () => {
    const markup = renderToStaticMarkup(
      <ScenarioSimulator availableTeams={['France', 'Spain']} onScenarioChange={() => undefined} />,
    )

    expect(markup).toContain('Scenarios')
    expect(markup).toContain('Pick the final outcome and preview the table')
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain('aria-label="Scenario winner"')
    expect(markup).toContain('aria-label="Scenario runner-up"')
    expect(markup).toContain('aria-label="Scenario top scorer"')
    expect(markup).toContain('Choose any result to update the leaderboard below')
    expect(markup).toContain('>France<')
    expect(markup).toContain('>Spain<')
    expect(markup).not.toContain('>Brazil<')
    expect(markup).not.toContain('>Player<')
  })
})
