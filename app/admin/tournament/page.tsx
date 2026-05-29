import { createServiceClient, assertAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { upsertPreTournamentSnapshot } from '@/lib/score-validation'
import { buildTournamentScoringPayload } from '@/lib/scoring-writes'

async function scoreTournamentEnd(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = await createServiceClient()
  const winner = (formData.get('winner') as string).trim()
  const runnerUp = (formData.get('runner_up') as string).trim()
  const topScorer = (formData.get('top_scorer') as string).trim()

  const { data: picks } = await supabase
    .from('pre_tournament_picks')
    .select('id, user_id, winner_team, winner_odds, top_scorer, top_scorer_odds')

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
        {[
          { name: 'winner', label: '🥇 Tournament Winner', placeholder: 'Team name exactly as entered' },
          { name: 'runner_up', label: '🥈 Runner-Up', placeholder: 'Team name exactly as entered' },
          { name: 'top_scorer', label: '⚽ Top Scorer', placeholder: 'Player name exactly as entered' },
        ].map(({ name, label, placeholder }) => (
          <div key={name} className="rounded-xl p-4 space-y-2"
            style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <label className="text-sm font-semibold text-text block">{label}</label>
            <input
              name={name}
              placeholder={placeholder}
              required
              style={inputStyle}
              className="rounded-lg px-3 py-2 text-sm w-full"
            />
          </div>
        ))}

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
