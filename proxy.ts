import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Redirect unauthenticated users to login (except auth routes)
  if (!user && !path.startsWith('/login') && !path.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('is_admin, status')
      .eq('id', user.id)
      .maybeSingle()
    const isAdmin = !!profile?.is_admin
    // No row yet (brand-new sign-in) is treated as pending; the row is created
    // with status 'pending' when the layout renders.
    const status = profile?.status ?? 'pending'

    // Guard admin routes
    if (path.startsWith('/admin')) {
      if (!isAdmin) return NextResponse.redirect(new URL('/', request.url))
    } else if (isAdmin || status === 'approved') {
      // Approved players (and admins) never sit on the waiting screen.
      if (path.startsWith('/pending')) {
        return NextResponse.redirect(new URL('/', request.url))
      }
    } else {
      // Pending / blocked players can only reach the waiting screen and the
      // auth routes (so they can complete sign-in or sign out).
      const allowed = path.startsWith('/pending') ||
        path.startsWith('/auth') || path.startsWith('/login')
      if (!allowed) {
        return NextResponse.redirect(new URL('/pending', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
