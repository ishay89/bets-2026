import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PickDistributionChart, pickColor } from './pick-distribution-chart'

describe('pickColor', () => {
  it('uses match colors for 1/X/2 picks with no option labels', () => {
    expect(pickColor('1', 0)).toBe('var(--color-accent)')
    expect(pickColor('X', 0)).toBe('var(--color-dim)')
    expect(pickColor('2', 0)).toBe('var(--color-amber)')
  })

  it('indexes into the segment palette for pikanteria option labels', () => {
    const optionLabels = { '1': 'Yes', '2': 'No' }
    const optionKeys = Object.keys(optionLabels)
    expect(pickColor('1', 0, optionLabels, optionKeys)).toBe('var(--color-amber)')
    expect(pickColor('2', 1, optionLabels, optionKeys)).toBe('var(--color-accent)')
  })

  it('falls back to the segment palette by index for arbitrary picks (futures)', () => {
    expect(pickColor('Brazil', 0)).toBe('var(--color-amber)')
    expect(pickColor('France', 1)).toBe('var(--color-accent)')
  })
})

describe('PickDistributionChart', () => {
  it('renders one circle and one legend item per segment, plus the total count', () => {
    const segments = [
      { pick: '1', count: 2, pct: 67 },
      { pick: 'X', count: 1, pct: 33 },
    ]
    const colorByPick = { '1': 'var(--color-accent)', X: 'var(--color-dim)' }
    const markup = renderToStaticMarkup(
      <PickDistributionChart segments={segments} colorByPick={colorByPick} />,
    )
    expect(markup.match(/<circle/g)).toHaveLength(2)
    expect(markup).toContain('67%')
    expect(markup).toContain('33%')
    expect(markup).toContain('>3<')
  })

  it('renders option labels when provided', () => {
    const segments = [{ pick: '1', count: 1, pct: 100 }]
    const colorByPick = { '1': 'var(--color-amber)' }
    const markup = renderToStaticMarkup(
      <PickDistributionChart segments={segments} colorByPick={colorByPick} optionLabels={{ '1': 'Yes' }} />,
    )
    expect(markup).toContain('Yes · 100%')
  })

  it('renders nothing for an empty segment list', () => {
    const markup = renderToStaticMarkup(
      <PickDistributionChart segments={[]} colorByPick={{}} />,
    )
    expect(markup).toBe('')
  })
})
