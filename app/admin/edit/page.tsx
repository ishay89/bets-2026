import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function saveOdds(formData: FormData) {
  'use server'
  const supabase = createAdminClient()

  for (let i = 1; i <= 8; i++) {
    const matchId = (formData.get(`match_id_${i}`) as string | null)?.trim()
    if (!matchId) break
    await supabase.from('matches').update({
      odds_home: parseFloat(formData.get(`odds_home_${i}`) as string),
      odds_draw: parseFloat(formData.get(`odds_draw_${i}`) as string),
      odds_away: parseFloat(formData.get(`odds_away_${i}`) as string),
    }).eq('id', matchId)
  }

  revalidatePath('/predict')
  redirect('/admin')
}

async function toggleDayLock(formData: FormData) {
  'use server'
  const supabase = createAdminClient()
  const matchDayId = formData.get('match_day_id') as string
  const locked = formData.get('locked') === 'true'
  await supabase.from('match_days').update({ locked: !locked }).eq('id', matchDayId)
  revalidatePath('/predict')
  const date = formData.get('date') as string
  redirect(`/admin/edit?date=${date}`)
}

async function toggleMatchLock(formData: FormData) {
  'use server'
  const supabase = createAdminClient()
  const matchId = formData.get('match_id') as string
  const locked = formData.get('locked') === 'true'
  await supabase.from('matches').update({ locked: !locked }).eq('id', matchId)
  revalidatePath('/predict')
  const date = formData.get('date') as string
  redirect(`/admin/edit?date=${date}`)
}

const inputBase = {
  background: 'var(--color-bg)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--color-text)',
}
const cls = 'rounded-lg px-3 py-2 text-sm w-full outline-none focus:ring-1'

export default async function EditPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const supabase = createAdminClient()

  const { data: publishedDays } = await supabase
    .from('match_days')
    .select('id, date, stage')
    .not('published_at', 'is', null)
    .order('date', { ascending: false })

  type PublishedMatchDay = { id: string; stage: string; date: string; lock_time: string; locked: boolean }
  type PublishedMatch = {
    id: string; home_team: string; away_team: string
    kickoff_time: string; odds_home: number; odds_draw: number; odds_away: number
    result: string | null; locked: boolean
  }

  let matchDay: PublishedMatchDay | null = null
  let matches: PublishedMatch[] = []

  if (date) {
    const { data: md } = await supabase
      .from('match_days')
      .select('id, stage, date, lock_time, locked')
      .eq('date', date)
      .not('published_at', 'is', null)
      .maybeSingle()

    if (md) {
      matchDay = md as PublishedMatchDay
      const { data: matchRows } = await supabase
        .from('matches')
        .select('id, home_team, away_team, kickoff_time, odds_home, odds_draw, odds_away, result, locked')
        .eq('match_day_id', md.id)
        .order('kickoff_time')
      matches = (matchRows ?? []) as PublishedMatch[]
    }
  }

  const hasScored = matches.some(m => m.result !== null)

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>✏️ Edit Published Match Day</div>
        <div className="text-muted text-xs">Update match odds or lock predictions for a published day</div>
      </div>

      {/* Date select — GET form */}
      <form method="GET" className="rounded-xl p-4 space-y-4"
        style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
          Select Date
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-muted text-xs">Published Match Day</label>
            <select name="date" defaultValue={date ?? ''} style={inputBase} className={cls}>
              <option value="">— pick a date —</option>
              {(publishedDays ?? []).map(d => (
                <option key={d.id} value={d.date}>
                  {d.date} · {d.stage}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
            Load
          </button>
        </div>
      </form>

      {date && !matchDay && (
        <div className="rounded-xl p-4"
          style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-amber)' }}>
            No published match day found for {date}
          </div>
        </div>
      )}

      {hasScored && (
        <div className="rounded-xl p-4"
          style={{ background: 'rgba(239,79,91,0.08)', border: '1px solid rgba(239,79,91,0.25)' }}>
          <div className="text-[11px] font-semibold" style={{ color: 'var(--color-danger)' }}>
            ⚠️ Some matches are already scored. Changing odds will not recalculate existing points — go to Results to re-score.
          </div>
        </div>
      )}

      {matchDay && (
        <>
          {/* Day-level lock toggle */}
          <form action={toggleDayLock} className="rounded-xl p-4 flex items-center justify-between"
            style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <input type="hidden" name="match_day_id" value={matchDay.id} />
            <input type="hidden" name="date" value={matchDay.date} />
            <input type="hidden" name="locked" value={String(matchDay.locked)} />
            <div>
              <div className="text-sm font-bold text-text">Day lock</div>
              <div className="text-xs text-muted">Locks all matches and pikanteria for this day</div>
            </div>
            <button type="submit"
              className="px-4 py-2 rounded-lg text-sm font-bold"
              style={{
                background: matchDay.locked ? 'rgba(0,217,126,0.15)' : 'rgba(239,79,91,0.15)',
                color: matchDay.locked ? 'var(--color-accent)' : 'var(--color-danger)',
                border: `1px solid ${matchDay.locked ? 'rgba(0,217,126,0.3)' : 'rgba(239,79,91,0.3)'}`,
              }}>
              {matchDay.locked ? '🔓 Unlock Day' : '🔒 Lock Day'}
            </button>
          </form>

          {/* Odds + per-match lock */}
          <form action={saveOdds} className="space-y-6">
            <div className="rounded-xl p-3 flex items-center gap-3"
              style={{ background: 'rgba(0,217,126,0.08)', border: '1px solid rgba(0,217,126,0.2)' }}>
              <div className="text-lg">📅</div>
              <div>
                <div className="text-sm font-bold text-text">{matchDay.date} · {matchDay.stage}</div>
                <div className="text-xs text-muted">{matches.length} matches loaded</div>
              </div>
            </div>

            {matches.map((match, idx) => {
              const i = idx + 1
              const kickoffLabel = new Date(match.kickoff_time).toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
              }) + ' UTC'
              return (
                <div key={match.id} className="rounded-xl p-4 space-y-3"
                  style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <input type="hidden" name={`match_id_${i}`} value={match.id} />
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-sm text-text">
                      {match.home_team} vs {match.away_team}
                    </div>
                    <div className="flex items-center gap-2">
                      {match.result && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent-line)' }}>
                          ✓ {match.result}
                        </span>
                      )}
                      <span className="text-xs text-muted">{kickoffLabel}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['home', 'draw', 'away'] as const).map(k => (
                      <div key={k} className="space-y-1">
                        <label className="text-muted text-xs capitalize">Odds {k}</label>
                        <input
                          type="number" step="0.01" name={`odds_${k}_${i}`}
                          required
                          defaultValue={(k === 'home' ? match.odds_home : k === 'draw' ? match.odds_draw : match.odds_away).toFixed(2)}
                          style={{ ...inputBase, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}
                          className={cls}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            <button type="submit" className="w-full py-3 rounded-xl font-black text-sm"
              style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
              💾 Save Odds
            </button>
          </form>

          {/* Per-match lock toggles */}
          <div className="space-y-3">
            <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
              Per-match locks
            </div>
            {matches.map(match => {
              const kickoffLabel = new Date(match.kickoff_time).toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
              }) + ' UTC'
              return (
                <form key={match.id} action={toggleMatchLock}
                  className="rounded-xl p-3 flex items-center justify-between"
                  style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <input type="hidden" name="match_id" value={match.id} />
                  <input type="hidden" name="date" value={matchDay!.date} />
                  <input type="hidden" name="locked" value={String(match.locked)} />
                  <div>
                    <div className="text-sm font-bold text-text">
                      {match.home_team} vs {match.away_team}
                    </div>
                    <div className="text-xs text-muted">{kickoffLabel}</div>
                  </div>
                  <button type="submit"
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{
                      background: match.locked ? 'rgba(0,217,126,0.15)' : 'rgba(239,79,91,0.15)',
                      color: match.locked ? 'var(--color-accent)' : 'var(--color-danger)',
                      border: `1px solid ${match.locked ? 'rgba(0,217,126,0.3)' : 'rgba(239,79,91,0.3)'}`,
                    }}>
                    {match.locked ? '🔓 Unlock' : '🔒 Lock'}
                  </button>
                </form>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
