import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development' || process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== 'true') {
    return new NextResponse('Not found', { status: 404 })
  }

  const email = process.env.DEV_LOGIN_EMAIL
  if (!email) return new NextResponse('DEV_LOGIN_EMAIL not set', { status: 500 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Generate a magic link via the admin API — gives us a token_hash without
  // sending an email or requiring the browser to follow a redirect.
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ type: 'magiclink', email }),
  })

  if (!res.ok) {
    const text = await res.text()
    return new NextResponse(`Admin API error ${res.status}: ${text}`, { status: 500 })
  }

  const data = await res.json() as {
    hashed_token?: string
    properties?: { hashed_token?: string }
  }
  const hashedToken = data.hashed_token ?? data.properties?.hashed_token
  if (!hashedToken) {
    return new NextResponse(`No hashed_token in response: ${JSON.stringify(data)}`, { status: 500 })
  }

  const redirectTo = new URL('/', new URL(request.url).origin)
  const response   = NextResponse.redirect(redirectTo)

  // Verify the token server-side — this exchanges the hash for a real session
  // and writes the auth cookies onto the response directly.
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  const { error } = await supabase.auth.verifyOtp({ token_hash: hashedToken, type: 'magiclink' })
  if (error) {
    return new NextResponse(`verifyOtp failed: ${error.message}`, { status: 500 })
  }

  return response
}
