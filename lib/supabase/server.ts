import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Database } from './types'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

// True service-role client — uses the service role key as the Authorization
// token directly, bypassing RLS entirely. Use for admin operations that need
// to read or write rows that regular users cannot see (e.g. draft match days).
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Authenticated client built from an explicit access token instead of
// cookies, so it can run inside unstable_cache() (which forbids reading
// cookies()/headers()). Still runs as `authenticated` for that one user, RLS
// fully enforced — NOT a service-role client. Lets a per-viewer cache entry
// reuse the viewer's own RLS scope instead of bypassing it with the admin
// client.
export function createClientWithToken(accessToken: string) {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}

export async function assertAdmin(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (profileError) throw profileError
  if (!profile?.is_admin) redirect('/')
}

// CAUTION: despite taking the service role key, this client reads the auth
// session from cookies, and supabase-js sends the session's user JWT as the
// Authorization header whenever one exists. Requests therefore run as the
// signed-in user (`authenticated` role, RLS enforced) — NOT as service_role.
// For true service-role access (RLS bypass, service_role-only RPCs like the
// scoring functions), use createAdminClient() instead.
export async function createServiceClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
