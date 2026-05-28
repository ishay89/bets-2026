# Mondial Bets 2026 — Style Guide

**Aesthetic direction**: "Stadium Night / Pitch Day" — a premium soccer-betting app that feels like it belongs inside a FIFA World Cup stadium. Dark mode = stadium under floodlights. Light mode = sun-bleached match day at the pitch.

---

## Themes

Two themes are supported: `dark` (default) and `light`. The active theme is stored in `localStorage` and applied as `data-theme` on `<html>`.

Switch with the floating `<ThemeToggle />` button (bottom-right, above the nav bar).

### Initializing correctly (SSR-safe)
A `<script>` in `<head>` reads `localStorage.theme` before React hydrates, preventing flash-of-wrong-theme. The default (no localStorage entry) is `dark`.

---

## Color Tokens

All colors are CSS custom properties defined in `app/globals.css`. Use `var(--token)` in inline styles, or the Tailwind utility class where it exists (e.g. `bg-bg`, `text-muted`).

### Backgrounds

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--color-bg` | `#05080f` | `#eef4e5` | Page background |
| `--color-panel` | `#0b1120` | `#ffffff` | Cards, sheets |
| `--color-panel2` | `#0f1830` | `#f4f9ed` | Nested panels |
| `--color-elev` | `#152038` | `#e5f0d6` | Raised elements, button fill |
| `--color-elev2` | `#1c2c4a` | `#d6e8c2` | Double-elevated |

### Text

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--color-text` | `#edf2ff` | `#0a1428` | Primary text |
| `--color-sub` | `#8899cc` | `#283f5e` | Secondary text, labels |
| `--color-muted` | `#4d5f8c` | `#6a7d9a` | Placeholder, hints |
| `--color-dim` | `#2a3a5e` | `#b5c8d8` | Dividers, VS label |

### Accent colors

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--color-accent` | `#00d97e` | `#00905a` | Primary CTA, active state, selected pick |
| `--color-accent-soft` | `#001f12` | `#dff5ec` | Accent background tint |
| `--color-accent-line` | `#00462a` | `#b0e5cf` | (deprecated — use `--border-accent`) |
| `--color-amber` | `#f5a623` | `#b87000` | Pikanteria, warnings, lock timer |
| `--color-amber-soft` | `#1e1000` | `#fef3dc` | Amber tint background |
| `--color-danger` | `#ef4f5b` | `#c0303a` | Errors, danger zone |
| `--color-danger-soft` | `#1e0609` | `#ffe6e8` | Danger tint background |

### Rank colors

| Token | Value | Usage |
|---|---|---|
| `--color-gold` | `#f5c441` / `#a07800` | 1st place |
| `--color-silver` | `#aab4cd` / `#607098` | 2nd place |
| `--color-bronze` | `#d18a4d` / `#7a4020` | 3rd place |

---

## Border Tokens

Never hardcode `rgba(255,255,255,0.07)` — use the border token instead. These are defined outside `@theme` so they work per-theme.

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--border-base` | `rgba(255,255,255,0.07)` | `rgba(0,0,0,0.08)` | Default card / panel border |
| `--border-subtle` | `rgba(255,255,255,0.04)` | `rgba(0,0,0,0.05)` | Dividers, row separators |
| `--border-accent` | `rgba(0,217,126,0.30)` | `rgba(0,144,90,0.28)` | Active / selected state border |
| `--border-danger` | `rgba(239,79,91,0.25)` | `rgba(192,48,58,0.22)` | Danger zone border |
| `--border-warn` | `rgba(245,166,35,0.28)` | `rgba(184,112,0,0.26)` | Pikanteria / warning border |

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

- Section headers: `font-display`, `9–11px`, `letterSpacing: '0.16–0.20em'`, `textTransform: 'uppercase'`, `color: --color-muted`
- Card titles / match names: `font-display`, `11–14px`, `letterSpacing: '0.08em'`, `textTransform: 'uppercase'`
- Body / descriptions: `font-sans`, `12–14px`, `fontWeight: 600`
- Odds / numbers: `font-mono`, `11–13px`
- Large countdown digits: `font-display`, `38–48px`, `fontWeight: 700`, `letterSpacing: '-0.02em'`
- Player names: `font-sans`, `13px`, `fontWeight: 700`
- Button labels: `font-display`, `13–14px`, `letterSpacing: '0.08–0.10em'`, `textTransform: 'uppercase'`

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

### Selected / active state
```tsx
style={{
  background: 'var(--color-accent)',
  color: '#000',
  transform: 'scale(1.03)',
  boxShadow: '0 4px 16px rgba(0,217,126,0.35)',
}}
```

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

The `SoccerBallLogo` in the home page header is an inline SVG soccer ball on a `--color-accent` circle background.

---

## Tone
This is a **friends betting game** — keep copy punchy and direct. Use Oswald ALL CAPS for section labels. Avoid corporate hedging. Lean into the sport: "Make Picks", "Locked", "Danger Zone", "Pikanteria".
