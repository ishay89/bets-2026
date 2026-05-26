import type { LeaderboardEntry } from '@/lib/types'

interface Props {
  entries: LeaderboardEntry[]
  currentUserId: string
}

export function Leaderboard({ entries, currentUserId }: Props) {
  const top3 = entries.slice(0, 3)
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean) // 2nd, 1st, 3rd
  const podiumHeights = ['h-12', 'h-20', 'h-8']
  const podiumMedals = ['🥈', '🏆', '🥉']

  return (
    <div className="pb-24">
      {/* Podium */}
      {top3.length > 0 && (
        <div className="flex items-end justify-center gap-2 mb-4 px-4">
          {podiumOrder.map((entry, i) => entry && (
            <div key={entry.id} className="flex-1 text-center">
              <div className="text-2xl mb-1">{podiumMedals[i]}</div>
              <div className={`${podiumHeights[i]} rounded-t-md flex flex-col items-center
                justify-center ${i === 1
                  ? 'bg-accent/10 border border-accent/30'
                  : 'bg-surface'}`}>
                <div className={`text-xs font-bold truncate px-1
                  ${i === 1 ? 'text-accent' : 'text-muted'}`}>
                  {entry.is_monkey ? '🐒' : ''}{entry.display_name}
                </div>
                <div className={`text-sm font-black ${i === 1 ? 'text-accent' : 'text-muted'}`}>
                  {entry.total_points.toFixed(1)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full list */}
      <div className="px-4 space-y-1.5">
        {entries.map((entry, i) => {
          const rank = i + 1
          const isMe = entry.id === currentUserId
          const isLastTwo = rank >= entries.length - 1 && entries.length > 2
          return (
            <div key={entry.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2
                ${isMe ? 'bg-accent/5 border border-accent/30' : 'bg-surface'}
                ${isLastTwo && !entry.is_monkey ? 'border border-danger/30' : ''}`}>
              <span className={`text-sm ${isMe ? 'text-accent' : 'text-muted'}`}>
                {isMe ? '→ ' : ''}{rank}. {entry.is_monkey ? '🐒 ' : ''}{entry.display_name}
              </span>
              <span className={`font-bold text-sm ${isMe ? 'text-accent' : 'text-muted'}`}>
                {entry.total_points.toFixed(1)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Danger zone */}
      {entries.length >= 2 && (
        <div className="mx-4 mt-3 bg-danger/5 border border-danger/20 rounded-lg p-3">
          <div className="text-danger text-xs font-bold mb-1">⚠️ DANGER ZONE</div>
          {entries.slice(-2).reverse().map((e, i) => (
            <div key={e.id} className="text-muted text-xs">
              {entries.length - i}. {e.display_name} — {e.total_points.toFixed(1)} pts
              {i === 0 ? ' (pays +₪200)' : ' (pays +₪100)'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
