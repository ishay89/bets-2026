'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Leaderboard } from './leaderboard'
import { ScenarioSimulator } from './scenario-simulator'
import type { LeaderboardEntry, LeaderboardFuturesPick } from '@/lib/types'
import {
  buildScenarioLeaderboardEntries,
  type ScenarioFuturesPick,
  type TournamentScenario,
} from '@/lib/scenario-leaderboard'

interface Props {
  initialEntries: LeaderboardEntry[]
  currentUserId: string
  futuresPicks?: Record<string, LeaderboardFuturesPick> | null
  scenarioPicks?: ScenarioFuturesPick[] | null
}

export function LeaderboardRealtime({
  initialEntries,
  currentUserId,
  futuresPicks = null,
  scenarioPicks = null,
}: Props) {
  const [entries, setEntries] = useState(initialEntries)
  const [scenario, setScenario] = useState<TournamentScenario | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function refresh() {
      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .returns<LeaderboardEntry[]>()
      if (data) setEntries(data)
    }

    const channel = supabase
      .channel('leaderboard-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'predictions' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pikanteria_answers' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pre_tournament_picks' }, refresh)
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [])

  const displayedEntries = scenario && scenarioPicks
    ? buildScenarioLeaderboardEntries(entries, scenarioPicks, scenario)
    : entries

  return (
    <>
      {scenarioPicks && (
        <div className="px-4 pb-4">
          <ScenarioSimulator onScenarioChange={setScenario} />
        </div>
      )}
      <Leaderboard
        entries={displayedEntries}
        currentUserId={currentUserId}
        futuresPicks={futuresPicks}
        movementPointsLabel={scenario ? 'scenario' : 'today'}
        scenarioMode={Boolean(scenario)}
      />
    </>
  )
}
