import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { calcPreTournamentWinnerPoints, calcTopScorerPoints } from '@/lib/scoring'
import { upsertPreTournamentSnapshot } from '@/lib/score-validation'

async function scoreTournamentEnd(formData: FormData) {
  'use server'
  const supabase = await createServiceClient()
  const winner = (formData.get('winner') as string).trim()
  const runnerUp = (formData.get('runner_up') as string).trim()
  const topScorer = (formData.get('top_scorer') as string).trim()

  const { data: picks } = await supabase.from('pre_tournament_picks').select('*')

  for (const pick of picks ?? []) {
    let placement: 'winner' | 'runner-up' | 'other' = 'other'
    if (pick.winner_team === winner) placement = 'winner'
    else if (pick.winner_team === runnerUp) placement = 'runner-up'

    const winnerPoints = calcPreTournamentWinnerPoints(pick.winner_odds, placement)
    const topScorerPoints = calcTopScorerPoints(pick.top_scorer_odds, pick.top_scorer === topScorer)

    await supabase.from('pre_tournament_picks')
      .update({ winner_points: winnerPoints, top_scorer_points: topScorerPoints })
      .eq('id', pick.id)

    await upsertPreTournamentSnapshot(supabase, pick.user_id)
  }

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
