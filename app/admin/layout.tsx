import { AdminNav } from '@/components/admin-nav'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header
        className="px-4 py-3 flex justify-between items-center sticky top-0 z-10"
        style={{ background: 'var(--color-panel)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span className="font-black text-sm tracking-wide" style={{ color: 'var(--color-amber)' }}>⚙️ ADMIN</span>
      </header>
      <main className="p-4 pb-28">{children}</main>
      <AdminNav />
    </div>
  )
}
