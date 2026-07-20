import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { upsertPreTournamentSnapshot } from '@/lib/score-validation'
import { buildTournamentScoringPayload } from '@/lib/scoring-writes'
import { TEAMS, SCORERS, withCurrentFuturesOdds } from '@/lib/pre-tournament'
import { parseTeamName, parseScorerName, parseNonEmpty } from '@/lib/validation'
import { getFlag } from '@/lib/display'
import Link from 'next/link'

async function scoreTournamentEnd(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const winner = parseTeamName(formData.get('winner'))
  const runnerUp = parseNonEmpty(formData.get('runner_up'), 'runner_up')
  const topScorer = parseScorerName(formData.get('top_scorer'))
  // Re-scoring an already-settled tournament is deliberate: the admin must tick
  // the confirmation box, which submits overwrite=on.
  const overwrite = formData.get('overwrite') === 'on'

  const { data: picks, error: picksError } = await supabase
    .from('pre_tournament_picks')
    .select('id, user_id, winner_team, winner_odds, top_scorer, top_scorer_odds')
  if (picksError) throw picksError

  // Score against the live odds, not the snapshot stored when each pick was
  // made, so the bonus awarded matches the odds shown on the predict screen.
  const pickPoints = buildTournamentScoringPayload(
    (picks ?? []).map(withCurrentFuturesOdds), winner, runnerUp, topScorer,
  )

  // Single atomic write: points + recorded result together, or none (rolled
  // back). The RPC also refuses to re-score unless p_overwrite is set.
  const { error } = await supabase.rpc('score_tournament_end', {
    p_pick_points: pickPoints,
    p_winner: winner,
    p_runner_up: runnerUp,
    p_top_scorer: topScorer,
    p_overwrite: overwrite,
  })
  if (error) {
    // Turn the "already scored" guard into a friendly notice instead of a crash.
    if (error.message.includes('already scored')) {
      redirect('/admin/tournament?notice=already-scored')
    }
    throw new Error(`Tournament scoring failed and was rolled back: ${error.message}`)
  }

  // Snapshots are derived/recoverable data, written outside the transaction.
  await Promise.all(
    (picks ?? []).map(p => upsertPreTournamentSnapshot(supabase, p.user_id))
  )

  revalidatePath('/')
  revalidatePath('/leaderboard')
  revalidatePath('/predict')
  revalidatePath('/admin/scores')
  revalidatePath('/u/[userId]', 'layout')
  revalidatePath('/h2h/[opponentId]', 'layout')
  // Stay on this page and confirm success, instead of silently bouncing to
  // /admin where a completed scoring looked indistinguishable from a failure.
  redirect('/admin/tournament?scored=1')
}

const inputStyle = {
  background: 'var(--color-bg)',
  border: '1px solid var(--border-base)',
  color: 'var(--color-text)',
}

const cls = 'rounded-lg px-3 py-2 text-sm w-full'

const panelStyle = { background: 'var(--color-panel)', border: '1px solid var(--border-base)' }

export default async function TournamentEndPage({
  searchParams,
}: {
  searchParams: Promise<{ scored?: string; notice?: string }>
}) {
  await assertAdmin()
  const { scored: justScored, notice } = await searchParams

  const supabase = createAdminClient()
  const [{ data: settings }, { data: picks }] = await Promise.all([
    supabase
      .from('tournament_settings')
      .select('final_winner, final_runner_up, final_top_scorer, scored_at')
      .eq('id', true)
      .single(),
    supabase
      .from('pre_tournament_picks')
      .select('winner_team, top_scorer, winner_points, top_scorer_points'),
  ])

  const allPicks = picks ?? []
  const alreadyScored = !!settings?.scored_at
  const { final_winner, final_runner_up, final_top_scorer } = settings ?? {}

  // Settlement counts, straight from the recorded result — what the confirmation
  // panel reports back to the admin.
  const championCount = final_winner ? allPicks.filter(p => p.winner_team === final_winner).length : 0
  const runnerUpCount = final_runner_up ? allPicks.filter(p => p.winner_team === final_runner_up).length : 0
  const scorerHitCount = final_top_scorer ? allPicks.filter(p => p.top_scorer === final_top_scorer).length : 0
  const settledCount = allPicks.filter(p => p.winner_points !== null && p.top_scorer_points !== null).length

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-10">
      <div>
        <Link href="/admin" className="text-muted hover:text-amber transition-colors text-xs">
          ← Admin
        </Link>
        <div className="font-display font-black text-lg mt-1" style={{ color: 'var(--color-amber)' }}>🏆 Score Tournament End</div>
        <div className="text-muted text-xs">
          Enter the final results to compute pre-tournament bonuses for all players
        </div>
      </div>

      {justScored && (
        <div className="rounded-xl p-4 space-y-1"
          style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }}>
          <div className="text-sm font-black" style={{ color: 'var(--color-accent)' }}>
            ✅ Tournament scored — bonuses awarded to all {settledCount} players
          </div>
          <div className="text-xs text-muted">Every player&apos;s futures bet is now settled. See the recorded result below.</div>
        </div>
      )}

      {notice === 'already-scored' && (
        <div className="rounded-xl p-4"
          style={{ background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--color-danger)' }}>
            Already scored — tick the overwrite box below to re-score.
          </div>
        </div>
      )}

      {alreadyScored && (
        <div className="rounded-xl p-4 space-y-3" style={panelStyle}>
          <div className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--color-amber)' }}>
            Recorded result · scored {new Date(settings!.scored_at as string).toLocaleString()}
          </div>
          <ResultRow emoji="🥇" label="Winner" value={final_winner} flag count={championCount} countLabel="picked" />
          <ResultRow emoji="🥈" label="Runner-up" value={final_runner_up} flag count={runnerUpCount} countLabel="picked" />
          <ResultRow emoji="⚽" label="Top scorer" value={final_top_scorer} count={scorerHitCount} countLabel="nailed it" />
        </div>
      )}

      <form action={scoreTournamentEnd} className="space-y-4">
        <div className="rounded-xl p-4 space-y-2" style={panelStyle}>
          <label htmlFor="winner-select" className="text-sm font-semibold text-text block">🥇 Tournament Winner</label>
          <select id="winner-select" name="winner" required style={inputStyle} className={cls} defaultValue={final_winner ?? ''}>
            <option value="" disabled>Select winning team…</option>
            {TEAMS.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl p-4 space-y-2" style={panelStyle}>
          <label htmlFor="runner-up-select" className="text-sm font-semibold text-text block">🥈 Runner-Up</label>
          <select id="runner-up-select" name="runner_up" required style={inputStyle} className={cls} defaultValue={final_runner_up ?? ''}>
            <option value="" disabled>Select runner-up team…</option>
            {TEAMS.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl p-4 space-y-2" style={panelStyle}>
          <label htmlFor="top-scorer-select" className="text-sm font-semibold text-text block">⚽ Top Scorer</label>
          <select id="top-scorer-select" name="top_scorer" required style={inputStyle} className={cls} defaultValue={final_top_scorer ?? ''}>
            <option value="" disabled>Select top scorer…</option>
            {SCORERS.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>

        {alreadyScored ? (
          <label className="rounded-xl p-4 flex items-start gap-3 cursor-pointer"
            style={{ background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}>
            <input type="checkbox" name="overwrite" required className="mt-0.5" />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--color-danger)' }}>
              This tournament is already scored. I understand re-scoring overwrites the recorded result and everyone&apos;s bonuses.
            </span>
          </label>
        ) : (
          <div className="rounded-xl p-4"
            style={{ background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)' }}>
            <div className="text-[11px] font-semibold" style={{ color: 'var(--color-amber)' }}>
              ⚠️ This action scores all pre-tournament picks for everyone. It records the result and awards each player&apos;s futures bonus.
            </div>
          </div>
        )}

        <button type="submit"
          className="w-full py-3 rounded-xl font-black text-sm"
          style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
          {alreadyScored ? '♻️ Re-score Pre-Tournament Bonuses' : '⚡ Score Pre-Tournament Bonuses'}
        </button>
      </form>
    </div>
  )
}

function ResultRow({
  emoji, label, value, flag, count, countLabel,
}: {
  emoji: string; label: string; value?: string | null; flag?: boolean; count: number; countLabel: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-lg">{emoji}</span>
      <div className="flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</div>
        <div className="text-sm font-extrabold text-text">
          {flag && value ? `${getFlag(value)} ` : ''}{value ?? '—'}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm font-bold" style={{ color: 'var(--color-amber)' }}>{count}</div>
        <div className="text-[10px] text-muted">{countLabel}</div>
      </div>
    </div>
  )
}
