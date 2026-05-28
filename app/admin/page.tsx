import Link from 'next/link'

const sections = [
  { href: '/admin/publish', icon: '📋', label: 'Publish Match Day', desc: "Add today's matches and pikanteria" },
  { href: '/admin/edit', icon: '✏️', label: 'Edit Published Day', desc: 'Update odds for an already-published day' },
  { href: '/admin/results', icon: '✅', label: 'Enter Results', desc: 'Record outcomes and trigger scoring' },
  { href: '/admin/tournament', icon: '🏆', label: 'Tournament End', desc: 'Set winner and top scorer' },
  { href: '/admin/players', icon: '👥', label: 'Manage Players', desc: 'View players and admin roles' },
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
          style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}
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
