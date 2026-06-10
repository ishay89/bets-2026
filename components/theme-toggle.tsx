'use client'
import { useState, useSyncExternalStore } from 'react'

const TOGGLE_PANEL_STYLE: React.CSSProperties = {
  position: 'fixed',
  bottom: 76,
  right: 16,
  zIndex: 30,
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: 'var(--color-panel)',
  border: '1px solid var(--border-base)',
  boxShadow: 'var(--shadow-card)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'transform 0.15s, background 0.2s',
  fontSize: 18,
}

function readTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  return (localStorage.getItem('theme') ??
    document.documentElement.getAttribute('data-theme') ??
    'light') as 'dark' | 'light'
}

function persistTheme(theme: 'dark' | 'light') {
  try { localStorage.setItem('theme', theme) } catch {}
  try { document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax` } catch {}
}

// No-op subscription: the stored theme only changes via this component's own
// `toggle()`, which updates `override` directly rather than relying on a
// storage event.
function subscribe() {
  return () => {}
}

// Matches the server-rendered default (and the inline theme-init script's
// fallback) so the first client render doesn't mismatch the SSR output.
function getServerSnapshot(): 'dark' | 'light' {
  return 'light'
}

export function ThemeToggle() {
  // Synced to the real stored preference after hydration via
  // useSyncExternalStore, avoiding a setState-in-effect.
  const storedTheme = useSyncExternalStore(subscribe, readTheme, getServerSnapshot)
  // Optimistic override applied immediately when the user clicks toggle.
  const [override, setOverride] = useState<'dark' | 'light' | null>(null)

  const theme = override ?? storedTheme

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setOverride(next)
    document.documentElement.setAttribute('data-theme', next)
    persistTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      style={TOGGLE_PANEL_STYLE}
      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
