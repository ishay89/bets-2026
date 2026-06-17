# Mondial Bets 2026 — Style Guide

**Aesthetic direction**: "Clean Pitch" — a light, airy, sporty-editorial design. Crisp white cards float on a soft pitch-green tinted background, with deep pitch-green accents, confident Oswald headlines, and mono numerals for odds and scores. Every player sees the exact same look — there is no per-user or per-team theming.

---

## Themes

Two themes are supported: `light` (Clean Pitch, default) and `dark` (Night Pitch, a companion palette for low-light viewing). The active theme is stored in `localStorage`/a `theme` cookie and applied as `data-theme` on `<html>`.

Switch with the floating `<ThemeToggle />` button (bottom-right, above the nav bar).

### Initializing correctly (SSR-safe)
A `<script>` in `<head>` reads `localStorage.theme` before React hydrates, preventing flash-of-wrong-theme. The default (no localStorage entry) is `light`.

---

## Color Tokens

All colors are CSS custom properties defined in `app/globals.css`. Use `var(--token)` in inline styles, or the Tailwind utility class where it exists (e.g. `bg-bg`, `text-muted`).

### Backgrounds

| Token | Light (default) | Dark | Usage |
|---|---|---|---|
| `--color-bg` | `#e9ece7` | `#0d1611` | Page background |
| `--color-panel` | `#ffffff` | `#15231b` | Cards, sheets |
| `--color-panel2` | `#f6f8f5` | `#1a2a20` | Nested panels |
| `--color-elev` | `#eef1ec` | `#213328` | Raised elements, button fill |
| `--color-elev2` | `#e3e8e1` | `#2a4234` | Double-elevated |

### Text

| Token | Light (default) | Dark | Usage |
|---|---|---|---|
| `--color-text` | `#15231b` | `#eef6f0` | Primary text |
| `--color-sub` | `#7c8c80` | `#9fb3a6` | Secondary text, labels |
| `--color-muted` | `#a3b0a8` | `#6e8278` | Placeholder, hints |
| `--color-dim` | `#c2ccc4` | `#44564a` | Dividers, VS label |

### Accent colors

| Token | Light (default) | Dark | Usage |
|---|---|---|---|
| `--color-accent` | `#0f9d58` | `#18cf78` | Primary CTA, active state, selected pick |
| `--color-accent-soft` | `#e1f3ea` | `#112e21` | Accent background tint |
| `--color-accent-line` | `#bfe6d2` | `#1f4a35` | (deprecated — use `--border-accent`) |
| `--color-amber` | `#ef7d22` | `#f5933f` | Pikanteria, warnings, lock timer |
| `--color-amber-soft` | `#fdeee2` | `#2b1c0d` | Amber tint background |
| `--color-danger` | `#e0444f` | `#ff6b74` | Errors, danger zone |
| `--color-danger-soft` | `#fbe1e3` | `#2a1216` | Danger tint background |

### Rank colors (text use — for podium fills see Components below)

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--color-gold` | `#9c7209` | `#f5c441` | 1st place |
| `--color-silver` | `#677583` | `#aab4cd` | 2nd place |
| `--color-bronze` | `#8a4a26` | `#d18a4d` | 3rd place |

---

## Border Tokens

Never hardcode border colors — use the border token instead. These are defined outside `@theme` so they work per-theme.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--border-base` | `#e8ede7` | `rgba(255,255,255,0.08)` | Default card / panel border |
| `--border-subtle` | `#eef1ec` | `rgba(255,255,255,0.05)` | Dividers, row separators |
| `--border-accent` | `rgba(15,157,88,0.32)` | `rgba(24,207,120,0.32)` | Active / selected state border |
| `--border-danger` | `rgba(224,68,79,0.28)` | `rgba(255,107,116,0.28)` | Danger zone border |
| `--border-warn` | `rgba(239,125,34,0.30)` | `rgba(245,147,63,0.30)` | Pikanteria / warning border |

### Usage pattern
```tsx
style={{ border: '1px solid var(--border-base)' }}
style={{ borderBottom: '1px solid var(--border-subtle)' }}
style={{ border: `1px solid ${active ? 'var(--border-accent)' : 'var(--border-base)'}` }}
```

---

## Other Tokens

| Token | Usage |
|---|---|
| `--nav-bg` | Bottom nav frosted glass background |
| `--shadow-card` | Standard card drop shadow |
| `--hero-glow` | Radial glow overlay for hero sections |

---

## Typography

Three font families, each with a specific role:

| Variable | Font | Role |
|---|---|---|
| `var(--font-display)` | **Oswald** | Headers, titles, nav labels, section headings, CTAs |
| `var(--font-sans)` | **Barlow** | Body text, descriptions, player names |
| `var(--font-mono)` | **IBM Plex Mono** | Odds, scores, timestamps, numeric data |

### Conventions

- Page titles: `font-display` (use the `.font-display` class or `fontFamily: 'var(--font-display)'`), `22px`, `font-extrabold`, `tracking-tight`
- Section headers: `font-display`, `9–11px`, `letterSpacing: '0.16–0.20em'`, `textTransform: 'uppercase'`, `color: --color-muted`
- Card titles / match names: `font-display`, `11–14px`, `letterSpacing: '0.08em'`, `textTransform: 'uppercase'`
- Body / descriptions: `font-sans`, `12–14px`, `fontWeight: 600`
- Odds / numbers: `font-mono`, `11–13px`
- Large countdown digits: `font-display`, `38–48px`, `fontWeight: 700`, `letterSpacing: '-0.02em'`
- Player names: `font-sans`, `13px`, `fontWeight: 700`
- Button labels: `font-display`, `13–14px`, `letterSpacing: '0.08–0.10em'`, `textTransform: 'uppercase'`

### Page eyebrows (section labels above card groups)

**Always use inline style — never Tailwind `tracking-wide` alone.**

Tailwind `tracking-wide` only sets `letter-spacing: 0.025em` and does not set `font-family`, so a `<div className="text-[10px] font-bold uppercase tracking-wide">` will render in the default body font (Barlow) at the wrong tracking. Use:

```tsx
<div style={{
  fontFamily: 'var(--font-display)',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--color-muted)',   // or --color-accent / --color-text as context requires
}}>
  Section label
</div>
```

### Date display in card headers

**Always format ISO date strings with `formatAppDate()`** from `@/lib/time`. Never render raw ISO strings (e.g. `2026-06-17`) to users.

```tsx
import { formatAppDate } from '@/lib/time'

// "June 17, 2026"
<span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--color-text)' }}>
  {formatAppDate(day.date)}
</span>
```

For stage labels paired with a date (e.g. "Group Stage"):
```tsx
<div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
  {stageLabel}
</div>
```

---

## Country Flags

Emoji flags do not render on Windows/Chrome (they show as two-letter ISO codes). Use real flag images from flagcdn.com instead.

```tsx
import { getFlagUrl } from '@/lib/display'

// 28×19 px flag image with rounded corners
const url = getFlagUrl('Argentina') // "https://flagcdn.com/w40/ar.png"
// eslint-disable-next-line @next/next/no-img-element
<img src={url!} alt={name} width={28} height={19} style={{ borderRadius: 3, objectFit: 'cover' }} />
```

`getFlagUrl(name)` returns a `string | null` — null if the team is unknown. Always render a fallback (e.g. a `var(--color-elev)` placeholder box the same size).

For HTML `<option>` elements inside `<select>` (which can't contain images), use `getFlag(name)` which returns the emoji — acceptable because select dropdowns typically don't render emoji on Windows either, making it a non-issue.

### Flag images inside text rows (history, h2h, leaderboard)

For compact rows where a flag appears inline with truncating text, **do not use `flex` on a `<span>`** — `text-overflow: ellipsis` only works on block-level containers. Use a `<div>` wrapper with `min-w-0`, and a separate `<span className="truncate">` around only the text:

```tsx
import { getFlagUrl } from '@/lib/display'

// ✅ Correct — truncation works
<div className="flex items-center gap-1 min-w-0" style={{ color: 'var(--color-sub)' }}>
  {getFlagUrl(homeTeam) && (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={getFlagUrl(homeTeam)!} alt={homeTeam} width={18} height={12}
      style={{ borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
  )}
  <span className="text-[12px] truncate">{homeTeam} vs {awayTeam}</span>
  {getFlagUrl(awayTeam) && (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={getFlagUrl(awayTeam)!} alt={awayTeam} width={18} height={12}
      style={{ borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
  )}
</div>

// ❌ Wrong — flex on span breaks ellipsis
<span className="flex items-center gap-1 truncate">...</span>
```

---

## Component Patterns

### Cards
```tsx
<div style={{
  background: 'var(--color-panel)',
  border: '1px solid var(--border-base)',
  boxShadow: 'var(--shadow-card)',
  borderRadius: 16,
}}>
```

Add `className="pitch-stripes"` to hero / featured cards for the subtle grass-stripe texture.

### Match card — teams row
Compact single-row layout: flag image + team name inline, VS centered between them.

```tsx
// Home (left-aligned): [FLAG] TEAM NAME
// Away (right-aligned): TEAM NAME [FLAG]  ← flex-row-reverse
<div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
  <div className="flex items-center gap-2" style={{ flex: 1 }}>
    <img src={getFlagUrl(homeTeam)!} width={28} height={19} style={{ borderRadius: 3, objectFit: 'cover' }} />
    <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {homeTeam}
    </span>
  </div>
  <div style={{ minWidth: 56, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: 'var(--color-dim)', letterSpacing: '0.16em' }}>VS</div>
  <div className="flex items-center gap-2 flex-row-reverse" style={{ flex: 1 }}>
    <img src={getFlagUrl(awayTeam)!} width={28} height={19} style={{ borderRadius: 3, objectFit: 'cover' }} />
    <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'right' }}>
      {awayTeam}
    </span>
  </div>
</div>
```

### Selected / active state
```tsx
style={{
  background: 'var(--color-accent)',
  color: '#fff',
  transform: 'scale(1.03)',
  boxShadow: '0 4px 16px rgba(15,157,88,0.35)',
}}
```
Text on a solid accent/amber/danger fill is always white (`#fff`); text on a soft tint (`*-soft` background) uses the matching solid token color (e.g. `color: var(--color-accent)` on `var(--color-accent-soft)`).

### Amber (Pikanteria) cards
Use `--border-warn` as border and `--color-amber-soft` for the header tint.

### Row separators
```tsx
style={{ borderBottom: '1px solid var(--border-subtle)' }}
```

### My-row highlight (leaderboard)
```tsx
style={{
  background: 'var(--color-accent-soft)',
  borderLeft: '3px solid var(--color-accent)',
}}
```

### Podium medal fills (leaderboard)
The podium uses fixed, theme-independent medal colors (decorative, not text): gold `#f5b301`, silver `#9aa5b1`, bronze `#cd7f32`.

---

## Soccer-specific CSS utilities

Defined in `app/globals.css`:

| Class | Effect |
|---|---|
| `pitch-stripes` | Subtle repeating grass-stripe background (works in both themes) |
| `font-display` | Applies `var(--font-display)` (Oswald) |

---

## Layout & Spacing

- Page padding: `px-4` on main content
- Card border-radius: `rounded-2xl` (16px) for primary cards, `rounded-xl` (12px) for rows/chips
- Bottom nav clearance: `pb-28` on page `<main>`
- Theme toggle: fixed `bottom: 76px, right: 16px`

---

## Icons

Icons are inline SVG with `width/height="22"` (nav) or `18–24` (in-card). Stroke-based, `strokeWidth="1.7"`, `strokeLinecap="round"`, `strokeLinejoin="round"`, no fill.

The `SoccerBallLogo` / login-page ball mark renders an inline SVG soccer ball on a `--color-accent` circle background; the ball's classic black pentagon/seam lines are illustrative (depicting an actual soccer ball), not a text-contrast choice, and stay black in both themes.

---

## Tone

This is a **friends betting game** — keep copy punchy and direct. Use Oswald ALL CAPS for section labels. Avoid corporate hedging. Lean into the sport: "Make Picks", "Locked", "Danger Zone", "Pikanteria".

---

## No per-user theming

Every player sees the identical Clean Pitch (or Night Pitch, if they toggle dark mode) styling — the app's look never changes based on a player's tournament-winner pick or any other personal data. There is no `lib/team-theme.ts`, no `data-team` attribute, and no `--team-*` CSS variables; do not reintroduce per-user/per-team color overrides.
