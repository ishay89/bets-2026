'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/', icon: '🏠', label: 'Home' },
  { href: '/predict', icon: '✏️', label: 'Predict' },
  { href: '/history', icon: '📊', label: 'History' },
  { href: '/profile', icon: '👤', label: 'Profile' },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface flex border-t border-white/5">
      {tabs.map(({ href, icon, label }) => {
        const active = pathname === href
        return (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5
              ${active ? 'text-accent' : 'text-muted'}`}>
            <span className="text-xl">{icon}</span>
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
