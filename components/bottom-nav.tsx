'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  {
    href: '/',
    label: 'Home',
    path: 'M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V11z',
  },
  {
    href: '/predict',
    label: 'Predict',
    path: 'M4 4h16v12H5l-1 4V4z',
  },
  {
    href: '/leaderboard',
    label: 'Board',
    path: 'M4 20V10m6 10V4m6 16v-7',
  },
  {
    href: '/history',
    label: 'History',
    path: 'M3 12a9 9 0 109-9 9 9 0 00-9 9zm9-5v5l3 2',
  },
  {
    href: '/profile',
    label: 'Me',
    path: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0',
  },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex border-t border-white/[0.06] z-10"
      style={{
        background: 'rgba(6,16,10,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingBottom: 'env(safe-area-inset-bottom, 8px)',
        boxShadow: '0 -14px 30px rgba(0,0,0,0.32)',
      }}
    >
      {tabs.map(({ href, label, path }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center gap-1 py-2"
            style={{ color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={path} />
            </svg>
            <span className="text-[9.5px] font-bold tracking-wide">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
