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
    <div className="app-shell bg-bg min-h-screen flex flex-col justify-end p-5">
      <div className="superstar-panel min-h-[430px] p-5 flex flex-col justify-end">
        <div className="ball-mark w-16 h-16 rounded-lg mb-4" aria-hidden="true" />
        <p className="section-kicker mb-1">Private friends pool</p>
        <h1 className="brand-wordmark text-[38px] leading-[0.95] mb-2">Mondial Bets 2026</h1>
        <p className="text-sub text-sm font-semibold max-w-[280px] mb-7">
          Match slips, wild side bets, and a leaderboard your friends will check every kickoff.
        </p>
      </div>
      <button
        onClick={signInWithGoogle}
        className="ticket-card w-full mt-4 font-black py-3 rounded-lg flex items-center justify-center gap-3 text-sm"
      >
        <span className="text-blue-600 font-black">G</span>
        Sign in with Google
      </button>
      <p className="text-muted text-xs mt-4 text-center">
        First time? You&apos;ll be added automatically.
      </p>
    </div>
  )
}
