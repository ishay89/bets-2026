import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Leaderboard } from './leaderboard'
import type { LeaderboardEntry, LeaderboardFuturesPick } from '@/lib/types'

const CLAUDE_ID = '00000000-0000-0000-0000-000000000006'

function entry(overrides: Partial<LeaderboardEntry> & Pick<LeaderboardEntry, 'id' | 'display_name'>): LeaderboardEntry {
  const { id, display_name, ...rest } = overrides
  return {
    id,
    display_name,
    is_monkey: false,
    automation_strategy: null,
    avatar_emoji: null,
    total_points: 0,
    today_points: 0,
    previous_total_points: null,
    current_rank: null,
    previous_rank: null,
    rank_delta: null,
    total_success_rate: null,
    total_successful_picks: 0,
    total_scored_picks: 0,
    today_success_rate: null,
    today_successful_picks: 0,
    today_scored_picks: 0,
    ...rest,
  }
}

// Server-provided order is kept as-is in the default Total + Score view, so
// the array below IS the standings: a marker sits on the podium and Claude
// sits mid-table, and neither may consume a prize or fine slot.
const standings: LeaderboardEntry[] = [
  entry({ id: 'real-1', display_name: 'Rina', total_points: 90 }),
  entry({ id: 'max', display_name: 'Always Max', automation_strategy: 'max', total_points: 85 }),
  entry({ id: 'real-2', display_name: 'Benny', total_points: 80 }),
  entry({ id: CLAUDE_ID, display_name: 'Claude', total_points: 75 }),
  entry({ id: 'real-3', display_name: 'Gadi', total_points: 70 }),
  entry({ id: 'real-4', display_name: 'Dana', total_points: 60 }),
  entry({ id: 'real-5', display_name: 'Hila', total_points: 50 }),
  entry({ id: 'real-6', display_name: 'Vered', total_points: 40 }),
  entry({ id: 'real-7', display_name: 'Zohar', total_points: 30 }),
  entry({ id: 'real-8', display_name: 'Hagit', total_points: 20 }),
]

const futuresPicks: Record<string, LeaderboardFuturesPick> = {
  'real-1': { winner: 'France', scorer: 'Kylian Mbappé' },
  'real-8': { winner: 'Brazil', scorer: 'Vinícius Júnior' },
}

function render(picks: Record<string, LeaderboardFuturesPick> | null) {
  return renderToStaticMarkup(
    <Leaderboard entries={standings} currentUserId="real-3" futuresPicks={picks} />,
  )
}

describe('Leaderboard futures picks line', () => {
  it('shows champion flag + team and top scorer under podium and row names', () => {
    const markup = render(futuresPicks)
    // real-1 is on the podium, real-8 is a list row.
    expect(markup).toContain('🏆 🇫🇷 France · ⚽ Kylian Mbappé')
    expect(markup).toContain('🏆 🇧🇷 Brazil · ⚽ Vinícius Júnior')
  })

  it('renders nothing pick-related pre-lock (null prop) or for players without a pick', () => {
    expect(render(null)).not.toContain('· ⚽')
    // Only two players have picks — exactly two picks lines.
    expect(render(futuresPicks).match(/· ⚽/g)).toHaveLength(2)
  })
})

describe('Leaderboard pot chips', () => {
  it('pays the top five real players, skipping the marker and Claude', () => {
    const markup = render(null)
    // real-1 (podium) and real-2 (podium, 3rd spot) hold the first two prizes;
    // real-3..real-5 hold the rest as list rows.
    expect(markup).toContain('>₪3,400<')
    expect(markup).toContain('>₪2,380<')
    expect(markup).toContain('>₪1,020<')
    expect(markup).toContain('>₪200<')
    expect(markup).toContain('>₪100<')
  })

  it('keeps the fines on the bottom two real players with the danger banner', () => {
    const markup = render(null)
    expect(markup).toContain('>+₪200<')
    expect(markup).toContain('>+₪100<')
    expect(markup).toContain('Danger zone · pays extra')
  })
})
