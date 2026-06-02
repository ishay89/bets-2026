import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { UserStatus } from '@/lib/types'
import { SignOutButton } from './sign-out'

export const metadata = { title: 'Awaiting approval | Mondial Bets 2026', description: 'Your account is awaiting approval' }

export default async function PendingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin, status')
    .eq('id', user.id)
    .maybeSingle()

  // Approved players and admins don't belong here.
  if (profile?.is_admin || profile?.status === 'approved') redirect('/')

  const status = (profile?.status ?? 'pending') as UserStatus
  const blocked = status === 'blocked'

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="w-full max-w-xs flex flex-col items-center text-center">
        <div
          className="mb-6 flex items-center justify-center rounded-full text-4xl"
          style={{
            width: 80,
            height: 80,
            background: 'var(--color-elev)',
            border: `2px solid ${blocked ? 'var(--color-danger)' : 'var(--color-amber)'}`,
          }}
        >
          {blocked ? '🚫' : '⏳'}
        </div>

        <div
          className="font-black text-xl mb-2"
          style={{ color: blocked ? 'var(--color-danger)' : 'var(--color-amber)' }}
        >
          {blocked ? 'Account blocked' : 'Waiting for approval'}
        </div>

        <p className="text-sub text-sm leading-relaxed mb-8">
          {blocked
            ? 'Your account has been blocked by an administrator. If you think this is a mistake, please contact the organizer.'
            : 'Your account is waiting for an administrator to approve it. Once approved you’ll be able to make predictions and join the leaderboard.'}
        </p>

        <div className="text-muted text-[11px] mb-3 truncate w-full">{user.email}</div>
        <SignOutButton />
      </div>
    </div>
  )
}
