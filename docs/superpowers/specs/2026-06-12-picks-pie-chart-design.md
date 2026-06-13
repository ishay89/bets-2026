# Picks Sheet: Pick Distribution Pie Chart Design

## Goal

The `👁 Picks` bottom sheet (`PredictionRevealSheet`) lists who picked what for a match, pikanteria, or futures (champion/top scorer). It currently shows only the per-player list. This adds a small donut/pie chart summarizing the **distribution of all players' picks** at the top of the sheet, in all three contexts (match, pikanteria, futures).

## Scope

- Applies to every `PredictionRevealSheet` instance: match predictions, pikanteria answers, futures champion, and futures top scorer.
- Shows the breakdown of picks among the players in `rows` (e.g. "60% Brazil, 25% France, 15% Argentina" or "57% 1, 29% X, 14% 2").
- Purely a "what did everyone pick" visualization — **not** correctness-aware. The existing ✓/✗ verdict badges (from the odds/result design) are unaffected and remain per-row only.
- No new data fetching: `rows: PlayerRevealRow[]` already contains everything needed (each row has a `pick`).

## Data Layer (`lib/prediction-reveals.ts`)

Add a pure helper next to `sortAndRankRevealRows`:

```ts
export type PickDistributionSegment = { pick: string; count: number; pct: number }

export function computePickDistribution(rows: PlayerRevealRow[]): PickDistributionSegment[] {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.pick, (counts.get(row.pick) ?? 0) + 1)
  const total = rows.length
  return Array.from(counts.entries())
    .map(([pick, count]) => ({ pick, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
}
```

- Groups by `pick`, counts occurrences, computes `pct` rounded to the nearest integer.
- Sorted by count descending; `Array.from(Map.entries())` preserves first-seen order and `.sort` is stable, so ties keep a deterministic order.
- Returns `[]` for empty `rows`.
- Percentages may not sum to exactly 100 due to independent rounding — acceptable, matches the existing "Crowd" bar's behavior.

## New Component (`components/pick-distribution-chart.tsx`)

A new client component plus a shared color helper, consolidating color logic that is currently duplicated inline in `prediction-reveal-sheet.tsx`:

```ts
const SEG_COLORS = [
  'var(--color-amber)',
  'var(--color-accent)',
  'var(--color-dim)',
  'var(--color-silver)',
  'var(--color-sub)',
]

const MATCH_PICK_COLORS: Record<string, string> = {
  '1': 'var(--color-accent)',
  X: 'var(--color-dim)',
  '2': 'var(--color-amber)',
}

export function pickColor(
  pick: string,
  index: number,
  optionLabels?: Record<string, string>,
  optionKeys?: string[],
): string {
  if (optionLabels && optionKeys) return SEG_COLORS[optionKeys.indexOf(pick) % SEG_COLORS.length]
  return MATCH_PICK_COLORS[pick] ?? SEG_COLORS[index % SEG_COLORS.length]
}
```

Behavior change vs. today: for futures rows (no `optionLabels`, `pick` is a team/scorer name not in `MATCH_PICK_COLORS`), `pickColor` now falls back to cycling through `SEG_COLORS` by segment index instead of a flat `var(--color-muted)`. This gives futures picks distinct colors that match their pie slice.

### `PickDistributionChart` component

```ts
interface Props {
  segments: PickDistributionSegment[]
  colorByPick: Record<string, string>
  optionLabels?: Record<string, string>
}

export function PickDistributionChart({ segments, colorByPick, optionLabels }: Props)
```

- Returns `null` if `segments.length === 0`.
- Renders an SVG donut (viewBox `0 0 72 72`, radius ~26, stroke-width ~10):
  - One `<circle>` per segment, `stroke={colorByPick[pick]}`, `fill="none"`.
  - `strokeDasharray="<dash> <circumference - dash>"` where `dash = (pct/100) * circumference`.
  - `strokeDashoffset` accumulated from prior segments' percentages so slices tile around the ring without gaps.
  - A `<g transform="rotate(-90 36 36)">` wrapper so the first slice starts at 12 o'clock and proceeds clockwise.
  - A single 100% segment naturally renders as a full circle (`dasharray = "C 0"`) — no special-casing needed.
  - Center `<text>` showing the total pick count (`segments.reduce((s, seg) => s + seg.count, 0)`).
- Renders a legend column beside the donut: for each segment, a small color swatch (`colorByPick[pick]`), the label (`optionLabels?.[pick] ?? pick`), and `${pct}%`, styled like the existing `.prediction-reveal-odds` (mono font, muted color, 11-12px).

## Integration (`components/prediction-reveal-sheet.tsx`)

- Import `computePickDistribution` from `@/lib/prediction-reveals` and `pickColor`, `PickDistributionChart` from `./pick-distribution-chart`.
- At the top of the component body:
  ```ts
  const segments = computePickDistribution(rows)
  const optionKeys = optionLabels ? Object.keys(optionLabels) : undefined
  const colorByPick = Object.fromEntries(
    segments.map((s, i) => [s.pick, pickColor(s.pick, i, optionLabels, optionKeys)]),
  )
  ```
- Render `<PickDistributionChart segments={segments} colorByPick={colorByPick} optionLabels={optionLabels} />` immediately after the header, before the player list / empty state. Since `segments` is `[]` when `rows` is `[]`, the chart renders nothing and the existing empty state is unaffected — no extra `rows.length > 0` guard needed at the call site.
- Replace the existing per-row pick-color computation:
  ```ts
  const pickColor = optionLabels
    ? SEG_COLORS[optionKeys.indexOf(row.pick) % SEG_COLORS.length]
    : (MATCH_PICK_COLORS[row.pick] ?? 'var(--color-muted)')
  ```
  with `colorByPick[row.pick] ?? 'var(--color-muted)'`.
- Remove the now-unused local `SEG_COLORS` / `MATCH_PICK_COLORS` constants and `optionKeys` (replaced by the import + the computation above).

## New CSS (`app/globals.css`)

Add near the existing `.prediction-reveal-*` rules:

```css
.prediction-reveal-distribution {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.prediction-reveal-distribution-legend {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.prediction-reveal-distribution-item {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.prediction-reveal-distribution-swatch {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
```

No separate "-label"/"-body" wrapper classes are needed — the donut SVG and `.prediction-reveal-distribution-legend` are direct children of `.prediction-reveal-distribution` (a flex row).

## Edge Cases

| Scenario | Behavior |
|---|---|
| 0 picks (`rows = []`) | `segments = []`, `PickDistributionChart` returns `null`; existing "No picks recorded yet" empty state shown as today |
| All players picked the same option | Single segment at 100%, donut renders as a full ring in that option's color |
| Pikanteria two-way (no `X`) | `optionLabels` has 2 keys; at most 2 segments, colors from `SEG_COLORS[0]`/`SEG_COLORS[1]` |
| Futures with >5 distinct picks | Colors cycle through the 5-color `SEG_COLORS` palette and may repeat across slices; legend labels (team/scorer names) disambiguate |
| `result` set (verdict known) | Chart and legend are unaffected — distribution is independent of correctness |
| Current user's row highlight | Unchanged — only the per-row pick label color source changes (from inline computation to `colorByPick`), not the row's background/border highlight |

## Files Changed

| File | Change |
|---|---|
| `lib/prediction-reveals.ts` | Add `PickDistributionSegment` type and `computePickDistribution` |
| `lib/prediction-reveals.test.ts` | New `describe('computePickDistribution', ...)` block |
| `components/pick-distribution-chart.tsx` | New file: `pickColor` helper + `PickDistributionChart` component |
| `components/prediction-reveal-sheet.tsx` | Compute `segments`/`colorByPick`, render `PickDistributionChart`, replace inline color logic with `colorByPick`, remove now-unused local color constants |
| `app/globals.css` | Add `.prediction-reveal-distribution`, `-legend`, `-item`, `-swatch` |

## Testing

- `lib/prediction-reveals.test.ts` (Vitest): grouping/counting, percentage rounding, sort-by-count descending, empty input → `[]`, single row → one segment at 100%.
- Manual check on `/predict`:
  - Open `👁 Picks` for a locked match: donut shows 1/X/2 split with `MATCH_PICK_COLORS`, legend matches per-row colors.
  - Open `👁 Picks` for a locked pikanteria (two-way and three-way): donut shows the corresponding option split with `SEG_COLORS`, labels from `optionLabels`.
  - Open `👁 Picks` for futures (champion and top scorer): donut shows team/scorer name distribution; per-row pick labels now colored to match their slice.
  - Item with zero picks recorded: empty state shown, no chart.
- `npm run lint` after implementation.
