import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Temporary local-only helper to inject a Supabase session for manual QA
// against the local Docker stack. Not for production use.
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not available' }, { status: 404 })
  }

  const accessToken = request.nextUrl.searchParams.get('access_token')
  const refreshToken = request.nextUrl.searchParams.get('refresh_token')

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: 'missing tokens' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.redirect(new URL('/predict', request.url))
}
