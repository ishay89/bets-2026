import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mondial Bets 2026',
  description: 'FIFA World Cup 2026 betting game',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-white min-h-screen">{children}</body>
    </html>
  )
}
