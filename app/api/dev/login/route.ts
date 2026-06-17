import { NextResponse } from 'next/server'

export async function GET() {
  if (process.env.NODE_ENV !== 'development' || process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== 'true') {
    return new NextResponse('Not found', { status: 404 })
  }

  const email = process.env.DEV_LOGIN_EMAIL
  if (!email) return new NextResponse('DEV_LOGIN_EMAIL not set', { status: 500 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Use the Supabase admin REST API directly to generate a magic link
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      type: 'magiclink',
      email,
      redirect_to: 'http://localhost:3000/auth/callback',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return new NextResponse(`Admin API error ${res.status}: ${text}`, { status: 500 })
  }

  const data = await res.json() as { action_link?: string }
  if (!data.action_link) {
    return new NextResponse(`No action_link in response: ${JSON.stringify(data)}`, { status: 500 })
  }

  return NextResponse.redirect(data.action_link)
}
