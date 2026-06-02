'use client'
import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'

const BUTTON_STYLE: CSSProperties = {
  background: 'var(--color-panel)',
  border: '1px solid var(--border-base)',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-display)',
  fontSize: 13,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

export function SignOutButton() {
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="w-full flex items-center justify-center rounded-xl py-3 font-bold transition-colors"
      style={BUTTON_STYLE}
    >
      Sign out
    </button>
  )
}
