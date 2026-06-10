import { createClient, createAdminClient, assertAdmin } from '@/lib/supabase/server'
import { parseUUID } from '@/lib/validation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import type { User, UserStatus } from '@/lib/types'

async function toggleAdmin(formData: FormData) {
  'use server'
  await assertAdmin()
  const userId = parseUUID(formData.get('user_id'), 'user_id')
  const isAdmin = formData.get('is_admin') === 'true'
  const nextIsAdmin = !isAdmin

  // Prevent an admin from demoting themselves, which would lock them out of /admin/*.
  const { data: { user: currentUser } } = await (await createClient()).auth.getUser()
  if (currentUser?.id === userId && !nextIsAdmin) return

  const supabase = createAdminClient()
  await supabase.from('users').update({ is_admin: nextIsAdmin }).eq('id', userId)
  revalidatePath('/admin/players')
}

async function setStatus(formData: FormData) {
  'use server'
  await assertAdmin()
  const userId = parseUUID(formData.get('user_id'), 'user_id')
  const status = formData.get('status')
  if (status !== 'pending' && status !== 'approved' && status !== 'blocked') {
    throw new Error('Invalid status')
  }

  // Prevent an admin from blocking (and thus self-demoting) themselves.
  const { data: { user: currentUser } } = await (await createClient()).auth.getUser()
  if (currentUser?.id === userId && status === 'blocked') return

  const supabase = createAdminClient()
  // Blocking a player also strips any admin rights so they cannot regain access.
  const patch: { status: UserStatus; is_admin?: boolean } = { status }
  if (status === 'blocked') patch.is_admin = false
  await supabase.from('users').update(patch).eq('id', userId)
  revalidatePath('/admin/players')
}

function StatusButton({ userId, status, label, color }: {
  userId: string; status: UserStatus; label: string; color: string
}) {
  return (
    <form action={setStatus} className="shrink-0">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit"
        className="text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors"
        style={{ color, border: '1px solid var(--border-base)', background: 'var(--color-elev)' }}>
        {label}
      </button>
    </form>
  )
}

function PlayerRow({ player, futuresDone }: { player: User; futuresDone: boolean }) {
  return (
    <div className="rounded-xl px-4 py-3 space-y-2.5"
      style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
      <div className="flex items-center justify-between gap-3">
        <Link href={`/admin/players/${player.id}`} className="flex-1 min-w-0 group">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[13px] text-text truncate group-hover:text-amber transition-colors">{player.display_name}</span>
            {player.is_admin && <StatusBadge label="admin" tone="amber" />}
            {player.status === 'pending' && <StatusBadge label="pending" tone="amber" />}
            {player.status === 'blocked' && <StatusBadge label="blocked" tone="danger" />}
            <FuturesBadge done={futuresDone} />
          </div>
          <div className="text-muted text-[11px] mt-0.5 truncate">{player.email}</div>
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {player.status === 'pending' && (
          <StatusButton userId={player.id} status="approved" label="Approve" color="var(--color-accent)" />
        )}
        {player.status === 'blocked' ? (
          <StatusButton userId={player.id} status="approved" label="Unblock" color="var(--color-accent)" />
        ) : (
          <StatusButton userId={player.id} status="blocked" label="Block & remove" color="var(--color-danger)" />
        )}
        {player.status === 'approved' && (
          <form action={toggleAdmin} className="shrink-0">
            <input type="hidden" name="user_id" value={player.id} />
            <input type="hidden" name="is_admin" value={String(player.is_admin)} />
            <button type="submit"
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                color: player.is_admin ? 'var(--color-danger)' : 'var(--color-muted)',
                border: '1px solid var(--border-base)',
                background: 'var(--color-elev)',
              }}>
              {player.is_admin ? 'Demote' : 'Make admin'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function FuturesBadge({ done }: { done: boolean }) {
  const styles = done
    ? { color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }
    : { color: 'var(--color-danger)', background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }
  return (
    <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0" style={styles}>
      {done ? '🏆 ✓' : '🏆 ✗'}
    </span>
  )
}

function StatusBadge({ label, tone }: { label: string; tone: 'amber' | 'danger' }) {
  const styles = tone === 'danger'
    ? { color: 'var(--color-danger)', background: 'var(--color-danger-soft, rgba(220,38,38,0.12))', border: '1px solid var(--border-base)' }
    : { color: 'var(--color-amber)', background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)' }
  return (
    <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0" style={styles}>
      {label}
    </span>
  )
}

function Section({ title, players, futuresDone }: { title: string; players: User[]; futuresDone: Set<string> }) {
  if (players.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="text-muted text-[11px] font-bold uppercase tracking-wide px-1">{title} · {players.length}</div>
      {players.map(player => <PlayerRow key={player.id} player={player} futuresDone={futuresDone.has(player.id)} />)}
    </div>
  )
}

export default async function PlayersPage() {
  const supabase = await createClient()
  const [{ data: players }, { data: futuresPicks }] = await Promise.all([
    supabase.from('users').select('*').order('display_name'),
    supabase.from('pre_tournament_picks').select('user_id, winner_team, top_scorer'),
  ])

  // Players who have completed both futures picks (winner + top scorer).
  const futuresDone = new Set<string>()
  for (const pick of futuresPicks ?? []) {
    if (pick.winner_team && pick.top_scorer) {
      futuresDone.add(pick.user_id as string)
    }
  }

  const allPlayers = (players ?? []) as User[]
  const realPlayers = allPlayers.filter(p => !p.is_monkey)
  const automatedPlayers = allPlayers.filter(p => p.is_monkey)

  const pending = realPlayers.filter(p => p.status === 'pending')
  const active = realPlayers.filter(p => p.status === 'approved')
  const blocked = realPlayers.filter(p => p.status === 'blocked')

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>
          👥 Manage Players
        </div>
        <div className="text-muted text-xs">
          {active.length} active · {pending.length} pending · {blocked.length} blocked
        </div>
      </div>

      <Section title="⏳ Awaiting approval" players={pending} futuresDone={futuresDone} />
      <Section title="Active players" players={active} futuresDone={futuresDone} />
      <Section title="🚫 Blocked" players={blocked} futuresDone={futuresDone} />

      {automatedPlayers.length > 0 && (
        <div className="space-y-2">
          {automatedPlayers.map(player => (
            <div key={player.id} className="rounded-xl px-4 py-3 opacity-60"
              style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{automationIcon(player)}</span>
                <div>
                  <div className="font-semibold text-[13px] text-text">{player.display_name}</div>
                  <div className="text-muted text-[11px]">
                    {automationLabel(player)} · not eligible for prizes
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function automationIcon(player: User): string {
  if (player.automation_strategy === 'max') return '▲'
  if (player.automation_strategy === 'mid') return '◆'
  if (player.automation_strategy === 'min') return '▼'
  return '🐒'
}

function automationLabel(player: User): string {
  if (player.automation_strategy === 'max') return 'Highest-odds marker'
  if (player.automation_strategy === 'mid') return 'Median-odds marker'
  if (player.automation_strategy === 'min') return 'Lowest-odds marker'
  return 'Shadow player'
}
