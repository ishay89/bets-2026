'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/admin', label: 'Home', exact: true },
  { href: '/admin/publish', label: 'Bets' },
  { href: '/admin/results', label: 'Results' },
  { href: '/admin/players', label: 'Players' },
  { href: '/admin/audit', label: 'Audit' },
  { href: '/', label: 'App', exact: true },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex border-t z-10"
      style={{
        background: 'var(--nav-bg)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderColor: 'var(--border-subtle)',
        paddingBottom: 'env(safe-area-inset-bottom, 8px)',
      }}
    >
      {tabs.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex items-center justify-center py-3"
            style={{ color: active ? 'var(--color-amber)' : 'var(--color-muted)' }}
          >
            <span
              className="text-[12px] uppercase"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: active ? 700 : 500,
                letterSpacing: '0.04em',
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
