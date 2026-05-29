import type { Metadata } from 'next'
import { Oswald, Barlow, IBM_Plex_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'
import { ThemeToggle } from '@/components/theme-toggle'
import { createClient } from '@/lib/supabase/server'
import { getTeamTheme, getTeamThemeCssVariables } from '@/lib/team-theme'

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let winningTeam: string | null = null

  if (user) {
    const { data: pick } = await supabase
      .from('pre_tournament_picks')
      .select('winner_team')
      .eq('user_id', user.id)
      .maybeSingle()
    winningTeam = pick?.winner_team ?? null
  }

  const cookieStore = await cookies()
  const theme = (cookieStore.get('theme')?.value === 'light' ? 'light' : 'dark') as 'dark' | 'light'

  const teamTheme = getTeamTheme(winningTeam)
  const teamThemeStyle = getTeamThemeCssVariables(winningTeam) as React.CSSProperties

  return (
    <html
      lang="en"
      data-theme={theme}
      data-team={teamTheme.slug}
      style={teamThemeStyle}
      suppressHydrationWarning
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
