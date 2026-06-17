import type { Metadata } from 'next'
import { Oswald, Barlow, IBM_Plex_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import Script from 'next/script'
import './globals.css'
import { ThemeToggle } from '@/components/theme-toggle'
import { createClient } from '@/lib/supabase/server'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'

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
  weight: ['400', '600', '700'],
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

  if (user) {
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()
    if (!existingProfile) {
      const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim())
      const isAdmin = adminEmails.includes(user.email!)
      await supabase.from('users').insert({
        id: user.id,
        email: user.email!,
        display_name: (user.user_metadata?.full_name as string | undefined) ?? user.email!.split('@')[0],
        is_admin: isAdmin,
        // New players wait for admin approval before they can use the app.
        // Configured admins are approved automatically.
        status: isAdmin ? 'approved' : 'pending',
      })
    }
  }

  const cookieStore = await cookies()
  const theme = (cookieStore.get('theme')?.value === 'dark' ? 'dark' : 'light') as 'dark' | 'light'

  return (
    <html
      lang="en"
      data-theme={theme}
      suppressHydrationWarning
      className={`${barlow.variable} ${oswald.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        {/* Prevent flash of wrong theme on load */}
        <Script strategy="beforeInteractive" id="theme-init">
          {`(function(){try{var t=localStorage.getItem('theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`}
        </Script>
      </head>
      <body className="bg-bg text-text min-h-screen font-sans">
        {children}
        <ThemeToggle />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
