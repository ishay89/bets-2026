import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { User } from '@/lib/types'

async function toggleAdmin(formData: FormData) {
  'use server'
  const supabase = await createServiceClient()
  const userId = formData.get('user_id') as string
  const isAdmin = formData.get('is_admin') === 'true'
  await supabase.from('users').update({ is_admin: !isAdmin }).eq('id', userId)
  revalidatePath('/admin/players')
}

export default async function PlayersPage() {
  const supabase = await createClient()
  const { data: players } = await supabase
    .from('users')
    .select('*')
    .order('display_name')

  const realPlayers = ((players ?? []) as User[]).filter(p => !p.is_monkey)
  const monkey = ((players ?? []) as User[]).find(p => p.is_monkey)

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>
          👥 Manage Players
        </div>
        <div className="text-muted text-xs">{realPlayers.length} registered players</div>
      </div>

      <div className="space-y-2">
        {realPlayers.map((player) => (
          <div key={player.id}
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[13px] text-text truncate">{player.display_name}</span>
                {player.is_admin && (
                  <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
                    style={{ color: 'var(--color-amber)', background: 'rgba(245,166,35,0.13)', border: '1px solid rgba(245,166,35,0.3)' }}>
                    admin
                  </span>
                )}
              </div>
              <div className="text-muted text-[11px] mt-0.5 truncate">{player.email}</div>
            </div>
            <form action={toggleAdmin} className="shrink-0 ml-3">
              <input type="hidden" name="user_id" value={player.id} />
              <input type="hidden" name="is_admin" value={String(player.is_admin)} />
              <button type="submit"
                className="text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  color: player.is_admin ? 'var(--color-danger)' : 'var(--color-muted)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'var(--color-elev)',
                }}>
                {player.is_admin ? 'Demote' : 'Make admin'}
              </button>
            </form>
          </div>
        ))}
      </div>

      {/* Monkey */}
      {monkey && (
        <div className="rounded-xl px-4 py-3 opacity-60"
          style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <span className="text-lg">🐒</span>
            <div>
              <div className="font-semibold text-[13px] text-text">{monkey.display_name}</div>
              <div className="text-muted text-[11px]">Shadow player · not eligible for prizes</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
