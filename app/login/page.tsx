import type { CSSProperties } from 'react'
import { GoogleSignIn } from './google-sign-in'

export const metadata = { title: 'Login | Mondial Bets 2026', description: 'Sign in to your account' }

const TITLE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 40,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-text)',
  textAlign: 'center',
  lineHeight: 0.95,
}

export default function LoginPage() {
  return (
    <div
      className="pitch-stripes min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Stadium glow backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, color-mix(in srgb, var(--color-accent) 12%, transparent) 0%, transparent 70%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-xs">
        {/* Ball */}
        <div
          className="mb-6 flex items-center justify-center rounded-full"
          style={{
            width: 80,
            height: 80,
            background: 'var(--color-accent)',
            boxShadow: '0 0 40px color-mix(in srgb, var(--color-accent) 50%, transparent), 0 0 80px color-mix(in srgb, var(--color-accent) 20%, transparent)',
          }}
        >
          <svg width="50" height="50" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="#000" strokeWidth="1.4" />
            <polygon points="12,7 14.8,9 13.8,12.2 10.2,12.2 9.2,9" fill="#000" />
            <line x1="12" y1="3" x2="12" y2="7" stroke="#000" strokeWidth="1.2" />
            <line x1="14.8" y1="9" x2="18" y2="7.5" stroke="#000" strokeWidth="1.2" />
            <line x1="13.8" y1="12.2" x2="16.5" y2="15" stroke="#000" strokeWidth="1.2" />
            <line x1="10.2" y1="12.2" x2="7.5" y2="15" stroke="#000" strokeWidth="1.2" />
            <line x1="9.2" y1="9" x2="6" y2="7.5" stroke="#000" strokeWidth="1.2" />
          </svg>
        </div>

        {/* Title */}
        <div style={TITLE_STYLE}>
          Mondial
          <br />
          <span style={{ color: 'var(--color-accent)' }}>Bets</span>
        </div>

        {/* Year / host badge */}
        <div
          className="mt-3 mb-8 flex items-center gap-1.5 px-4 py-1.5 rounded-full"
          style={{
            background: 'var(--color-elev)',
            border: '1px solid var(--border-base)',
          }}
        >
          <span style={{ fontSize: 14 }}>🇺🇸🇨🇦🇲🇽</span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 12,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--color-sub)',
            }}
          >
            FIFA World Cup 2026
          </span>
        </div>

        {/* Sign in button */}
        <GoogleSignIn />

        <p
          className="mt-4 text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--color-muted)',
            lineHeight: 1.5,
          }}
        >
          First time? You&apos;ll be added automatically.
        </p>
      </div>
    </div>
  )
}
