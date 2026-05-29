import { shouldWriteAuditEvent, writeAuditEvent, type AuditJson } from '@/lib/audit'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { BottomNav } from '@/components/bottom-nav'

const TEAMS = [
  { name: 'Argentina', odds: 4.0 },
  { name: 'France', odds: 4.5 },
  { name: 'Brazil', odds: 5.0 },
  { name: 'England', odds: 6.0 },
  { name: 'Germany', odds: 6.5 },
  { name: 'Spain', odds: 7.5 },
  { name: 'Portugal', odds: 8.0 },
  { name: 'Netherlands', odds: 9.0 },
  { name: 'USA', odds: 12.0 },
  { name: 'Mexico', odds: 15.0 },
]

const SCORERS = [
  { name: 'K. Mbappé', odds: 5.0 },
  { name: 'Vinícius Jr', odds: 6.0 },
  { name: 'H. Kane', odds: 6.5 },
  { name: 'L. Messi', odds: 8.0 },
  { name: 'C. Ronaldo', odds: 9.0 },
  { name: 'E. Haaland', odds: 7.0 },
  { name: 'J. Bellingham', odds: 8.5 },
]

const FLAGS: Record<string, string> = {
  Argentina: '🇦🇷', France: '🇫🇷', Brazil: '🇧🇷', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Germany: '🇩🇪', Spain: '🇪🇸', Portugal: '🇵🇹', Netherlands: '🇳🇱',
  USA: '🇺🇸', Mexico: '🇲🇽',
}

async function savePreTournamentPick(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const winnerName = formData.get('winner') as string
  const scorerName = formData.get('scorer') as string
  const winner = TEAMS.find(t => t.name === winnerName)
  const scorer = SCORERS.find(s => s.name === scorerName)
  if (!winner || !scorer) return

  const service = await createServiceClient()
  const [{ data: existing }, { data: firstDay }] = await Promise.all([
    service
      .from('pre_tournament_picks')
      .select('id, winner_team, winner_odds, top_scorer, top_scorer_odds')
      .eq('user_id', user.id)
      .maybeSingle(),
    service
      .from('match_days')
      .select('lock_time')
      .not('published_at', 'is', null)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (firstDay && new Date() >= new Date(firstDay.lock_time)) {
    throw new Error('Pre-tournament picks are locked')
  }

  const oldValue: AuditJson | null = existing ? {
    winner_team: existing.winner_team,
    winner_odds: existing.winner_odds,
    top_scorer: existing.top_scorer,
    top_scorer_odds: existing.top_scorer_odds,
  } : null
  const newValue: AuditJson = {
    winner_team: winner.name,
    winner_odds: winner.odds,
    top_scorer: scorer.name,
    top_scorer_odds: scorer.odds,
  }
  const shouldAudit = shouldWriteAuditEvent(oldValue, newValue)

  const { data: savedPick, error } = await service.from('pre_tournament_picks').upsert({
    user_id: user.id,
    winner_team: winner.name,
    winner_odds: winner.odds,
    top_scorer: scorer.name,
    top_scorer_odds: scorer.odds,
  }, { onConflict: 'user_id' }).select('id').single()
  if (error) throw error

  if (shouldAudit) {
    await writeAuditEvent(service, {
      user_id: user.id,
      event_type: 'pre_tournament_pick',
      action: existing ? 'update' : 'create',
      entity_id: savedPick.id,
      entity_ref: 'pre_tournament',
      old_value: oldValue,
      new_value: newValue,
      metadata: {
        label: 'Pre-tournament',
      },
    })
  }

  revalidatePath('/', 'layout')
  revalidatePath('/pre-tournament')
}

export default async function PreTournamentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: pick }, { data: firstDay }] = await Promise.all([
    supabase.from('pre_tournament_picks').select('*').eq('user_id', user!.id).single(),
    supabase.from('match_days').select('lock_time').not('published_at', 'is', null)
      .order('date', { ascending: true }).limit(1).single(),
  ])

  const isLocked = firstDay ? new Date() >= new Date(firstDay.lock_time) : false

  const inputStyle = {
    background: 'var(--color-bg)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--color-text)',
  }
  const cls = 'rounded-lg px-3 py-2 text-sm w-full'

  return (
    <div className="app-shell bg-bg">
      <div className="stadium-header px-4 pt-4 pb-4">
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
          One-time picks
        </div>
        <div className="brand-wordmark text-[24px]">Pre-tournament futures</div>
      </div>

      <main className="px-4 pb-28 space-y-6">
        {isLocked && (
          <div className="rounded-lg px-4 py-3"
            style={{ background: 'rgba(239,79,91,0.08)', border: '1px solid rgba(239,79,91,0.25)' }}>
            <span className="text-[12px] font-bold" style={{ color: 'var(--color-danger)' }}>
              🔒 Pre-tournament picks are locked
            </span>
          </div>
        )}

        {/* Current picks summary */}
        {pick && (
          <>
            {/* Winner card */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[1.2px] mb-2 px-0.5"
                style={{ color: 'var(--color-muted)' }}>Your champion · 1.5× bonus</div>
              <div className="superstar-panel p-[18px]">
                <div className="relative flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-3xl"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {FLAGS[pick.winner_team] ?? '🏆'}
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: 'var(--color-gold)' }}>
                      🏆 Winner
                    </div>
                    <div className="text-[22px] font-extrabold tracking-tight text-text">{pick.winner_team}</div>
                    <div className="text-[11px] text-sub mt-1">
                      Win: <strong style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-mono)' }}>
                        {(pick.winner_odds * 1.5).toFixed(2)} pts
                      </strong> · Runner-up: <strong style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-mono)' }}>
                        {(pick.winner_odds * 0.75).toFixed(2)} pts
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Top scorer card */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[1.2px] mb-2 px-0.5"
                style={{ color: 'var(--color-muted)' }}>Top scorer · fixed bonus</div>
              <div className="bet-card p-4">
                <div className="flex items-center gap-4">
                  <div className="ball-mark w-16 h-16 rounded-lg shrink-0" aria-hidden="true" />
                  <div className="flex-1">
                    <div className="text-[18px] font-extrabold tracking-tight text-text">{pick.top_scorer}</div>
                    <div className="text-[11px] text-sub mt-1">
                      Bonus: <strong style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>
                        {pick.top_scorer_odds.toFixed(2)} pts
                      </strong>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-[22px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                      {pick.top_scorer_odds.toFixed(2)}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Odds</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Pot card */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[1.2px] mb-2 px-0.5"
            style={{ color: 'var(--color-muted)' }}>The pot</div>
          <div className="ticket-card p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[11px] font-semibold text-muted">Entry fee</div>
                <div className="text-[11px] text-sub mt-0.5">₪200 per player</div>
              </div>
              <div className="space-y-1 text-right">
                <div className="text-[11px]" style={{ color: 'var(--color-gold)' }}>
                  🥇 70% · <strong style={{ fontFamily: 'var(--font-mono)' }}>of pot</strong>
                </div>
                <div className="text-[11px]" style={{ color: 'var(--color-silver)' }}>
                  🥈 30% · <strong style={{ fontFamily: 'var(--font-mono)' }}>of pot</strong>
                </div>
                <div className="text-[11px]" style={{ color: 'var(--color-bronze)' }}>
                  🥉 From penalties
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Edit form if not locked */}
        {!isLocked && (
          <form action={savePreTournamentPick} className="space-y-4">
            <div className="text-[10px] font-bold uppercase tracking-[1.2px] px-0.5" style={{ color: 'var(--color-muted)' }}>
              {pick ? 'Update your picks' : 'Make your picks'}
            </div>

            <div className="bet-card p-4 space-y-2">
              <label className="text-sm font-semibold text-text block">🏆 Tournament Winner</label>
              <select name="winner" defaultValue={pick?.winner_team ?? ''} required style={inputStyle} className={cls}>
                <option value="">Select a team...</option>
                {TEAMS.map(t => (
                  <option key={t.name} value={t.name}>
                    {FLAGS[t.name] ?? ''} {t.name} — {t.odds.toFixed(2)}
                  </option>
                ))}
              </select>
              <p className="text-muted text-xs">Win: odds ×1.5 · Runner-up: odds ×0.75</p>
            </div>

            <div className="bet-card p-4 space-y-2">
              <label className="text-sm font-semibold text-text block">⚽ Top Scorer</label>
              <select name="scorer" defaultValue={pick?.top_scorer ?? ''} required style={inputStyle} className={cls}>
                <option value="">Select a player...</option>
                {SCORERS.map(s => (
                  <option key={s.name} value={s.name}>{s.name} — {s.odds.toFixed(2)}</option>
                ))}
              </select>
            </div>

            <button type="submit"
              className="w-full py-3 rounded-lg font-black text-sm"
              style={{ background: 'var(--color-accent)', color: '#000' }}>
              {pick ? 'Update Picks ✓' : 'Save Picks ✓'}
            </button>
          </form>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
