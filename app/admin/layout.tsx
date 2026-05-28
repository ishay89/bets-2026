import Link from 'next/link'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header
        className="px-4 py-3 flex justify-between items-center sticky top-0 z-10"
        style={{ background: 'var(--color-panel)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span className="font-black text-sm tracking-wide" style={{ color: 'var(--color-amber)' }}>⚙️ ADMIN</span>
        <nav className="flex gap-3 text-xs">
          <Link href="/admin/publish" className="text-muted hover:text-amber transition-colors">Publish</Link>
          <Link href="/admin/results" className="text-muted hover:text-amber transition-colors">Results</Link>
          <Link href="/admin/tournament" className="text-muted hover:text-amber transition-colors">Tournament</Link>
          <Link href="/admin/players" className="text-muted hover:text-amber transition-colors">Players</Link>
          <Link href="/admin/audit" className="text-muted hover:text-amber transition-colors">Audit</Link>
          <Link href="/" className="text-muted hover:text-accent transition-colors">← App</Link>
        </nav>
      </header>
      <main className="p-4">{children}</main>
    </div>
  )
}
