import type { Metadata } from 'next'
import { Oswald, Barlow, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { ThemeToggle } from '@/components/theme-toggle'

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
})

const oswald = Oswald({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Mondial Bets 2026',
  description: 'FIFA World Cup 2026 — USA · CAN · MEX',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${barlow.variable} ${oswald.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        {/* Prevent flash of wrong theme on load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-bg text-text min-h-screen font-sans">
        {children}
        <ThemeToggle />
      </body>
    </html>
  )
}
