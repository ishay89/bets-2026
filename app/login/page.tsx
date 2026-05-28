'use client'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div
      className="pitch-stripes min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Stadium glow backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(0,217,126,0.12) 0%, transparent 70%)',
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
            boxShadow: '0 0 40px rgba(0,217,126,0.5), 0 0 80px rgba(0,217,126,0.20)',
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
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--color-text)',
            textAlign: 'center',
            lineHeight: 0.95,
          }}
        >
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
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--color-sub)',
            }}
          >
            FIFA World Cup 2026
          </span>
        </div>

        {/* Sign in button */}
        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 rounded-xl py-4 font-bold transition-all"
          style={{
            background: 'var(--color-panel)',
            border: '1px solid var(--border-base)',
            color: 'var(--color-text)',
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            boxShadow: 'var(--shadow-card)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--border-accent)'
            e.currentTarget.style.background = 'var(--color-accent-soft)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-base)'
            e.currentTarget.style.background = 'var(--color-panel)'
          }}
        >
          {/* Google G */}
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

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
