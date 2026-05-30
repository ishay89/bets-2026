import { assertAdmin } from '@/lib/supabase/server'
import { AdminNav } from '@/components/admin-nav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await assertAdmin()
  return (
    <div className="min-h-screen bg-bg">
      <header
        className="px-4 py-3 flex justify-between items-center sticky top-0 z-10"
        style={{ background: 'var(--color-panel)', borderBottom: '1px solid var(--border-base)' }}
      >
        <span className="font-black text-sm tracking-wide" style={{ color: 'var(--color-amber)' }}>⚙️ ADMIN</span>
      </header>
      <main className="p-4 pb-28">{children}</main>
      <AdminNav />
    </div>
  )
}
