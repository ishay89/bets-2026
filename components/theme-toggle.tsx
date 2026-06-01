'use client'
import { useState } from 'react'

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

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(readTheme)

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
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
