import Link from 'next/link'

const sections = [
  { href: '/admin/missing-picks', icon: '🔔', label: 'Missing Picks', desc: 'See who still needs to submit picks' },
  { href: '/admin/publish', icon: '📋', label: 'Publish & Edit Bets', desc: 'Manage odds, visibility, pikanteria, and locks' },
  { href: '/admin/results', icon: '✅', label: 'Enter Results', desc: 'Record outcomes and trigger scoring' },
  { href: '/admin/tournament', icon: '🏆', label: 'Tournament End', desc: 'Set winner and top scorer' },
  { href: '/admin/players', icon: '👥', label: 'Manage Players', desc: 'View players and admin roles' },
  { href: '/admin/ai-picks', icon: '🤖', label: 'Pick for AI', desc: 'Enter bets for Claude, Codex, and bot futures' },
  { href: '/admin/scores', icon: '📊', label: 'Score Snapshots', desc: 'Per-day breakdown and validation audit' },
  { href: '/admin/audit', icon: '🧾', label: 'User Audit', desc: 'Track user prediction commits and changes' },
]

export default function AdminHome() {
  return (
    <div className="max-w-lg mx-auto space-y-3">
      {sections.map(s => (
        <Link
          key={s.href}
          href={s.href}
          className="block rounded-xl p-4 transition-colors"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{s.icon}</span>
            <div>
              <div className="font-bold text-sm" style={{ color: 'var(--color-amber)' }}>{s.label}</div>
              <div className="text-muted text-xs">{s.desc}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
