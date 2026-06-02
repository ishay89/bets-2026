'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  {
    href: '/',
    label: 'Home',
    // House
    d: 'M3 12L5 10.2V5H8V7.5L12 3.5L21 12H18.5V21H14.5V15H9.5V21H5.5V12H3Z',
  },
  {
    href: '/predict',
    // Soccer ball (simplified)
    label: 'Predict',
    d: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 2c1.2 0 2.3.2 3.3.6L13 7H11L8.7 4.6A8 8 0 0 1 12 4zm-4.5 1.5L9.5 8.5 8 11H5.1A8 8 0 0 1 7.5 5.5zm9 0A8 8 0 0 1 18.9 11H16l-1.5-2.5 2-2.5zm-7 4h5l1.5 4.5-4 3-4-3L9 11zm-4.8 2h2.2L8 15.5l-1.5 1A8 8 0 0 1 4.2 13zm15.6 0A8 8 0 0 1 17.5 16.5L16 15.5 17.6 13h2.2zm-10 5.2L11 16h2l1.2 2.2A8 8 0 0 1 12 20a8 8 0 0 1-2.2-.8z',
  },
  {
    href: '/leaderboard',
    label: 'Board',
    // Trophy
    d: 'M7 3h10v7a5 5 0 01-10 0V3zM4 5H7v3H4V5zM17 5h3v3h-3V5zM12 15v3M9 21h6M12 18h0',
  },
  {
    href: '/board',
    label: 'Social',
    // Message bubble
    d: 'M4 4h16v12H8l-4 4V4zm4 5h8M8 12h5',
  },
  {
    href: '/history',
    label: 'History',
    // Clock
    d: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 5v5l3.5 2',
  },
  {
    href: '/profile',
    label: 'Me',
    // Jersey / person
    d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',
  },
]

export function BottomNav() {
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
      {tabs.map(({ href, label, d }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center gap-1 py-2.5"
            style={{ color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d={d} />
            </svg>
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
