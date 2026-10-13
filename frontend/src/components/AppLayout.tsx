import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Logo, Wordmark } from './ui'

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')

export function AppLayout({ fullHeight = false, children }: { fullHeight?: boolean; children?: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    <div className={`flex flex-col ${fullHeight ? 'h-screen' : 'min-h-screen'}`}>
      <header className="shrink-0 border-b border-white/5 bg-navy text-white">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="flex items-center gap-2.5 font-semibold tracking-tight">
              <Logo size={26} onDark />
              <Wordmark onDark className="text-lg" />
            </Link>
            <nav aria-label="Main" className="hidden sm:block">
              <NavLink to="/dashboard" end className={({ isActive }) => `rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-white/10 text-white' : 'text-white/65 hover:text-white'}`}>Dashboard</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-[11px] font-semibold text-copper-100">{initials(user?.name ?? '')}</span>
              <span className="hidden text-white/80 sm:inline">{user?.name}</span>
            </span>
            <button className="rounded-lg border border-white/20 px-3 py-1.5 text-white/90 transition-colors hover:bg-white/10"
              onClick={async () => { await logout(); navigate('/login') }}>Log out</button>
          </div>
        </div>
      </header>
      <div className={fullHeight ? 'min-h-0 flex-1' : 'flex-1'}>{children ?? <Outlet />}</div>
    </div>
  )
}
