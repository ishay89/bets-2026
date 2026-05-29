'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/admin/publish', label: 'Publish' },
  { href: '/admin/edit', label: 'Edit' },
  { href: '/admin/results', label: 'Results' },
  { href: '/admin/tournament', label: 'Tourney' },
  { href: '/admin/players', label: 'Players' },
  { href: '/admin/audit', label: 'Audit' },
  { href: '/', label: 'App' },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex border-t z-10"
      style={{
        background: 'var(--nav-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderColor: 'var(--border-subtle)',
        paddingBottom: 'env(safe-area-inset-bottom, 8px)',
      }}
    >
      {tabs.map(({ href, label }) => {
        // "App" (/) should only be active on the exact path; admin tabs stay lit
        // on their nested routes (e.g. /admin/players/[id] keeps Players active).
        const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex items-center justify-center py-3"
            style={{ color: active ? 'var(--color-amber)' : 'var(--color-muted)' }}
          >
            <span
              className="text-[10px] tracking-widest uppercase"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: active ? 700 : 500,
                letterSpacing: '0.06em',
              }}
            >
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
