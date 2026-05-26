import type { LeaderboardEntry } from '@/lib/types'

interface Props {
  entries: LeaderboardEntry[]
  currentUserId: string
}

// Maps display_name initial to a fun emoji avatar (deterministic by first char)
const AVATARS = ['🦁','🐯','🦊','🐺','🦅','🐻','🐼','🦝','🦄','🐉','🦋','🌟','🔥','⚡','🎯']
function getAvatar(name: string, isMonkey: boolean): string {
  if (isMonkey) return '🐒'
  const code = name.charCodeAt(0) % AVATARS.length
  return AVATARS[code]
}

const podiumColors = {
  gold: '#f5c441',
  silver: '#aab4cd',
  bronze: '#d18a4d',
}
const podiumOrder = [
  { idx: 1, color: podiumColors.silver, height: 92 },
  { idx: 0, color: podiumColors.gold, height: 118 },
  { idx: 2, color: podiumColors.bronze, height: 72 },
]

export function Leaderboard({ entries, currentUserId }: Props) {
  const top3 = entries.slice(0, 3)
  const rest = entries.slice(3)
  const dangerZone = entries.slice(-2)
  const dangerIds = new Set(dangerZone.map(e => e.id))

  return (
    <div className="pb-28 px-4">
      {/* Podium */}
      {top3.length > 0 && (
        <div className="flex items-end justify-center gap-2 mb-5 mt-2">
          {podiumOrder.map(({ idx, color, height }) => {
            const entry = top3[idx]
            if (!entry) return null
            const rank = idx + 1
            const av = getAvatar(entry.display_name, entry.is_monkey)
            return (
              <div key={entry.id} style={{ width: idx === 0 ? '36%' : '32%', textAlign: 'center' }}>
                {/* Avatar */}
                <div
                  className="mx-auto mb-1.5 flex items-center justify-center rounded-full text-xl"
                  style={{
                    width: 42, height: 42,
                    background: 'var(--color-elev)',
                    border: `2px solid ${color}`,
                  }}
                >{av}</div>
                <div className="font-extrabold text-[13px] text-text truncate">{entry.display_name}</div>
                <div className="font-mono text-[11px] text-sub mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
                  {entry.total_points.toFixed(1)}
                </div>
                {/* Bar */}
                <div
                  className="flex items-start justify-center pt-2 rounded-t-lg font-black text-[18px]"
                  style={{
                    height,
                    background: `linear-gradient(180deg, ${color}, ${color}40)`,
                    color: '#000',
                  }}
                >{rank}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full list */}
      <div className="mb-3">
        {rest.map((entry, i) => {
          const rank = i + 4
          const isMe = entry.id === currentUserId
          const av = getAvatar(entry.display_name, entry.is_monkey)
          return (
            <div
              key={entry.id}
              className="flex items-center gap-3"
              style={{
                padding: '10px 12px',
                background: isMe ? 'rgba(0,217,126,0.06)' : 'transparent',
                borderBottom: `1px solid rgba(255,255,255,0.06)`,
                borderLeft: isMe ? '2px solid var(--color-accent)' : '2px solid transparent',
                opacity: entry.is_monkey ? 0.6 : 1,
                fontStyle: entry.is_monkey ? 'italic' : 'normal',
              }}
            >
              <div
                className="font-bold text-[12px] w-[22px]"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: isMe ? 'var(--color-accent)' : 'var(--color-muted)',
                }}
              >{rank}.</div>
              <div
                className="flex items-center justify-center rounded-full text-base shrink-0"
                style={{ width: 28, height: 28, background: 'var(--color-elev)', fontSize: 14 }}
              >{av}</div>
              <div
                className="flex-1 font-bold text-[13px]"
                style={{ color: isMe ? 'var(--color-accent)' : 'var(--color-text)' }}
              >
                {entry.display_name}
                {entry.is_monkey && (
                  <span className="ml-1 text-[9px] not-italic" style={{ color: 'var(--color-muted)' }}>
                    · shadow
                  </span>
                )}
              </div>
              <div
                className="font-bold text-[13px] w-12 text-right"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}
              >
                {entry.total_points.toFixed(1)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Danger zone */}
      {entries.length >= 2 && (
        <div
          className="rounded-xl p-3"
          style={{
            background: 'rgba(239,79,91,0.08)',
            border: '1px solid rgba(239,79,91,0.25)',
          }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs">⚠️</span>
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-danger)' }}
            >Danger zone · pays extra</span>
          </div>
          {dangerZone.map((e, i) => {
            const rank = entries.length - 1 + i
            const fine = i === 0 ? '+₪200' : '+₪100'
            const av = getAvatar(e.display_name, e.is_monkey)
            return (
              <div
                key={e.id}
                className="flex items-center gap-2.5"
                style={{
                  padding: '6px 0',
                  borderBottom: i === 0 ? '1px dashed rgba(239,79,91,0.18)' : 'none',
                }}
              >
                <div
                  className="font-bold text-[11px] w-[22px]"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-danger)' }}
                >{rank}.</div>
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{ width: 22, height: 22, background: 'var(--color-elev)', fontSize: 12 }}
                >{av}</div>
                <div className="flex-1 text-[12px] font-semibold text-text">{e.display_name}</div>
                <div
                  className="text-[12px]"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-sub)' }}
                >{e.total_points.toFixed(1)}</div>
                <div
                  className="font-bold text-[11px] w-12 text-right"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-danger)' }}
                >{fine}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
