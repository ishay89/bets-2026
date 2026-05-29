import { createClient, createAdminClient, assertAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { recalculateAllSnapshots } from '@/lib/score-validation'

async function revalidateAll() {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()
  await recalculateAllSnapshots(supabase)
  revalidatePath('/admin/scores')
  redirect('/admin/scores')
}

type SnapshotRow = {
  id: string
  user_id: string
  match_day_id: string | null
  stage: string | null
  match_points: number
  pikanteria_points: number
  pre_tournament_winner_pts: number
  pre_tournament_scorer_pts: number
  day_points: number
  cumulative_points: number
  is_valid: boolean
  discrepancy: number | null
  calculated_at: string
  users: { display_name: string; is_monkey: boolean }
  match_days: { date: string; stage: string } | null
}

function fmt(n: number) {
  return n.toFixed(2)
}

function ValidationBadge({ snapshot }: { snapshot: SnapshotRow }) {
  if (snapshot.is_valid) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
        style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent-line)' }}>
        ✓ valid
      </span>
    )
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ color: '#ff5555', background: 'rgba(255,85,85,0.1)', border: '1px solid rgba(255,85,85,0.3)' }}>
      ✗ off by {snapshot.discrepancy != null ? fmt(Math.abs(snapshot.discrepancy)) : '?'} pts
    </span>
  )
}

export default async function ScoresPage() {
  const supabase = await createClient()

  const { data: rawSnapshots } = await supabase
    .from('score_snapshots')
    .select(`
      *,
      users(display_name, is_monkey),
      match_days(date, stage)
    `)
    .order('calculated_at', { ascending: false })

  const snapshots = (rawSnapshots ?? []) as SnapshotRow[]

  // Group: pre-tournament (null match_day_id) + per match day
  const preTournament = snapshots.filter(s => s.match_day_id === null)
  const byDay = snapshots.filter(s => s.match_day_id !== null)

  // Group byDay by match_day_id
  const dayMap = new Map<string, SnapshotRow[]>()
  for (const s of byDay) {
    const key = s.match_day_id!
    if (!dayMap.has(key)) dayMap.set(key, [])
    dayMap.get(key)!.push(s)
  }

  // Sort days by date descending
  const sortedDays = [...dayMap.entries()].sort(([, aRows], [, bRows]) => {
    const aDate = aRows[0]?.match_days?.date ?? ''
    const bDate = bRows[0]?.match_days?.date ?? ''
    return bDate.localeCompare(aDate)
  })

  const totalInvalid = snapshots.filter(s => !s.is_valid).length

  const sectionStyle = {
    background: 'var(--color-panel)',
    border: '1px solid rgba(255,255,255,0.06)',
  }

  const thStyle = {
    color: 'var(--color-muted)',
    fontWeight: 600,
    fontSize: '11px',
    textAlign: 'left' as const,
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  }

  const tdStyle = {
    padding: '8px 12px',
    fontSize: '12px',
    color: 'var(--color-text)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>
            📊 Score Snapshots
          </div>
          <div className="text-muted text-xs mt-0.5">
            Per-day breakdown · validated against raw source data
          </div>
        </div>
        <div className="flex items-center gap-3">
          {totalInvalid > 0 && (
            <span className="text-[11px] font-bold px-2 py-1 rounded-lg"
              style={{ color: '#ff5555', background: 'rgba(255,85,85,0.1)', border: '1px solid rgba(255,85,85,0.3)' }}>
              {totalInvalid} invalid
            </span>
          )}
          <form action={revalidateAll}>
            <button type="submit"
              className="px-4 py-2 rounded-lg font-bold text-xs"
              style={{ background: 'var(--color-accent)', color: '#000' }}>
              ↺ Revalidate All
            </button>
          </form>
        </div>
      </div>

      {snapshots.length === 0 && (
        <div className="rounded-xl p-8 text-center" style={sectionStyle}>
          <div className="text-3xl mb-2">📭</div>
          <div className="text-muted text-sm">No snapshots yet — enter results to generate them.</div>
        </div>
      )}

      {/* Pre-tournament section */}
      {preTournament.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={sectionStyle}>
          <div className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <span className="font-bold text-sm" style={{ color: 'var(--color-amber)' }}>
                🏆 Pre-Tournament
              </span>
              <span className="text-muted text-xs ml-2">winner + top scorer picks</span>
            </div>
            {preTournament.some(s => !s.is_valid) && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ color: '#ff5555', background: 'rgba(255,85,85,0.1)', border: '1px solid rgba(255,85,85,0.3)' }}>
                {preTournament.filter(s => !s.is_valid).length} invalid
              </span>
            )}
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th style={thStyle}>Player</th>
                <th style={{ ...thStyle, textAlign: 'right' as const }}>Winner pts</th>
                <th style={{ ...thStyle, textAlign: 'right' as const }}>Scorer pts</th>
                <th style={{ ...thStyle, textAlign: 'right' as const }}>Total</th>
                <th style={{ ...thStyle, textAlign: 'right' as const }}>Cumulative</th>
                <th style={{ ...thStyle, textAlign: 'right' as const }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {preTournament
                .sort((a, b) => a.users.display_name.localeCompare(b.users.display_name))
                .map(s => (
                  <tr key={s.id}>
                    <td style={tdStyle}>
                      <span className="font-medium">{s.users.display_name}</span>
                      {s.users.is_monkey && <span className="text-muted text-[10px] ml-1">🐒</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' as const }}>{fmt(s.pre_tournament_winner_pts)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' as const }}>{fmt(s.pre_tournament_scorer_pts)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' as const, fontWeight: 700 }}>{fmt(s.day_points)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' as const, color: 'var(--color-accent)' }}>{fmt(s.cumulative_points)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' as const }}>
                      <ValidationBadge snapshot={s} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per match day sections */}
      {sortedDays.map(([dayId, rows]) => {
        const day = rows[0]?.match_days
        const invalidCount = rows.filter(r => !r.is_valid).length
        return (
          <div key={dayId} className="rounded-xl overflow-hidden" style={sectionStyle}>
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <span className="font-bold text-sm uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
                  {day?.stage ?? ''}
                </span>
                <span className="text-muted text-xs ml-2">· {day?.date ?? ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted">{rows.length} players</span>
                {invalidCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ color: '#ff5555', background: 'rgba(255,85,85,0.1)', border: '1px solid rgba(255,85,85,0.3)' }}>
                    {invalidCount} invalid
                  </span>
                )}
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th style={thStyle}>Player</th>
                  <th style={{ ...thStyle, textAlign: 'right' as const }}>Match pts</th>
                  <th style={{ ...thStyle, textAlign: 'right' as const }}>Pikanteria pts</th>
                  <th style={{ ...thStyle, textAlign: 'right' as const }}>Day total</th>
                  <th style={{ ...thStyle, textAlign: 'right' as const }}>Cumulative</th>
                  <th style={{ ...thStyle, textAlign: 'right' as const }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .sort((a, b) => b.day_points - a.day_points)
                  .map(s => (
                    <tr key={s.id}>
                      <td style={tdStyle}>
                        <span className="font-medium">{s.users.display_name}</span>
                        {s.users.is_monkey && <span className="text-muted text-[10px] ml-1">🐒</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' as const }}>{fmt(s.match_points)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' as const }}>{fmt(s.pikanteria_points)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' as const, fontWeight: 700 }}>{fmt(s.day_points)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' as const, color: 'var(--color-accent)' }}>{fmt(s.cumulative_points)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' as const }}>
                        <ValidationBadge snapshot={s} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
