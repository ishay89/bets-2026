import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mondial Bets 2026',
  description: 'FIFA World Cup 2026 betting game',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg text-text min-h-screen font-sans">{children}</body>
    </html>
  )
}
