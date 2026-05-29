import { createServiceClient, assertAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { upsertPreTournamentSnapshot } from '@/lib/score-validation'
import { buildTournamentScoringPayload } from '@/lib/scoring-writes'
import { TEAMS, SCORERS } from '@/lib/pre-tournament'
import { parseTeamName, parseScorerName, parseNonEmpty } from '@/lib/validation'

async function scoreTournamentEnd(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = await createServiceClient()

  const winner = parseTeamName(formData.get('winner'))
  const runnerUp = parseNonEmpty(formData.get('runner_up'), 'runner_up')
  const topScorer = parseScorerName(formData.get('top_scorer'))

  const { data: picks, error: picksError } = await supabase
    .from('pre_tournament_picks')
    .select('id, user_id, winner_team, winner_odds, top_scorer, top_scorer_odds')
  if (picksError) throw picksError

  const pickPoints = buildTournamentScoringPayload(picks ?? [], winner, runnerUp, topScorer)

  // Single atomic write: all picks scored together, or none (rolled back).
  const { error } = await supabase.rpc('score_tournament_end', {
    p_pick_points: pickPoints,
  })
  if (error) {
    throw new Error(`Tournament scoring failed and was rolled back: ${error.message}`)
  }

  // Snapshots are derived/recoverable data, written outside the transaction.
  await Promise.all(
    (picks ?? []).map(p => upsertPreTournamentSnapshot(supabase, p.user_id))
  )

  revalidatePath('/')
  revalidatePath('/leaderboard')
  revalidatePath('/admin/scores')
  redirect('/admin')
}

const inputStyle = {
  background: 'var(--color-bg)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--color-text)',
}

const cls = 'rounded-lg px-3 py-2 text-sm w-full'

export default function TournamentEndPage() {
  return (
    <div className="max-w-lg mx-auto space-y-6 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>🏆 Score Tournament End</div>
        <div className="text-muted text-xs">
          Enter the final results to compute pre-tournament bonuses for all players
        </div>
      </div>

      <form action={scoreTournamentEnd} className="space-y-4">
        <div className="rounded-xl p-4 space-y-2"
          style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <label className="text-sm font-semibold text-text block">🥇 Tournament Winner</label>
          <select name="winner" required style={inputStyle} className={cls} defaultValue="">
            <option value="" disabled>Select winning team...</option>
            {TEAMS.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl p-4 space-y-2"
          style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <label className="text-sm font-semibold text-text block">🥈 Runner-Up</label>
          <select name="runner_up" required style={inputStyle} className={cls} defaultValue="">
            <option value="" disabled>Select runner-up team...</option>
            {TEAMS.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl p-4 space-y-2"
          style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <label className="text-sm font-semibold text-text block">⚽ Top Scorer</label>
          <select name="top_scorer" required style={inputStyle} className={cls} defaultValue="">
            <option value="" disabled>Select top scorer...</option>
            {SCORERS.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl p-4"
          style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)' }}>
          <div className="text-[11px] font-semibold" style={{ color: 'var(--color-amber)' }}>
            ⚠️ This action scores all pre-tournament picks for everyone. Cannot be undone.
          </div>
        </div>

        <button type="submit"
          className="w-full py-3 rounded-xl font-black text-sm"
          style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
          ⚡ Score Pre-Tournament Bonuses
        </button>
      </form>
    </div>
  )
}
