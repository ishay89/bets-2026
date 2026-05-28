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
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6">
      <div className="text-6xl mb-4">⚽</div>
      <h1 className="text-accent font-black text-2xl mb-1">MONDIAL 2026</h1>
      <p className="text-muted text-sm mb-10">The official bets game</p>
      <button
        onClick={signInWithGoogle}
        className="w-full max-w-xs bg-white text-gray-800 font-bold py-3 rounded-xl
                   flex items-center justify-center gap-3 text-sm"
      >
        <span className="text-blue-500 font-black">G</span>
        Sign in with Google
      </button>
      <p className="text-muted text-xs mt-4 text-center">
        First time? You&apos;ll be added automatically.
      </p>
    </div>
  )
}
