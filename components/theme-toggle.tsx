'use client'
import { useState } from 'react'

function readTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  return (localStorage.getItem('theme') ??
    document.documentElement.getAttribute('data-theme') ??
    'dark') as 'dark' | 'light'
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(readTheme)

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('theme', next) } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      style={{
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
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
