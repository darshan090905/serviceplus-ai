import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Wrench,
  MessageSquareWarning,
  Mail,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Logo } from './Logo'
import { Avatar } from '../ui/Avatar'
import { Dropdown, MenuItem } from '../ui/Dropdown'
import { IncomingCallOverlay } from '../calls/IncomingCallOverlay'
import { cn } from '../../utils/cn'

const titles: Array<{ match: RegExp; title: string }> = [
  { match: /^\/tech\/jobs$/, title: 'My Jobs' },
  { match: /^\/tech\/complaints$/, title: 'Assigned Complaints' },
  { match: /^\/tech\/inbox$/, title: 'Email Inbox' },
  { match: /^\/tech/, title: 'My Dashboard' },
]

const nav = [
  { to: '/tech', label: 'My Dashboard', icon: LayoutDashboard },
  { to: '/tech/jobs', label: 'My Jobs', icon: Wrench },
  { to: '/tech/complaints', label: 'Complaints', icon: MessageSquareWarning },
  { to: '/tech/inbox', label: 'Inbox', icon: Mail },
]

export function TechLayout() {
  const { session, logout, emails, complaints } = useAppStore()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const title = titles.find((t) => t.match.test(location.pathname))?.title ?? 'My Dashboard'

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!session?.technicianId) navigate('/login', { replace: true })
  }, [session?.technicianId, navigate])

  const myEmails = useMemo(
    () =>
      emails.filter(
        (e) => e.to === session?.name || e.toEmail === session?.email,
      ),
    [emails, session?.name, session?.email],
  )
  const unread = myEmails.filter((e) => !e.read).length
  const assignedComplaintCount = complaints.filter(
    (complaint) => complaint.assignedTo === session?.technicianId && complaint.status !== 'Resolved' && complaint.status !== 'Closed',
  ).length

  if (!session?.technicianId) {
    return null
  }

  const signOut = () => {
    logout()
    toast('You have been signed out.')
    navigate('/login')
  }

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
        <Logo />
        <button onClick={() => setMobileOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 lg:hidden" aria-label="Close menu">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <div className="mb-3 rounded-lg border border-sky-100 bg-sky-50/50 px-3 py-2.5">
          <p className="text-xs font-semibold text-sky-700">Field Operations</p>
          <p className="mt-0.5 text-[11px] leading-snug text-sky-600/80">
            Manage your visits and resolve assigned complaints.
          </p>
        </div>
        <nav className="space-y-0.5" aria-label="Technician navigation">
          {nav.map(({ to, label, icon: Icon }) => {
            const badge = to === '/tech/inbox' ? unread : to === '/tech/complaints' ? assignedComplaintCount : 0
            return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-600')} aria-hidden />
                  <span className="min-w-0 flex-1">{label}</span>
                  {badge > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white" aria-label={`${badge} pending updates`}>{badge}</span>
                  )}
                  {isActive && <span className="h-1.5 w-1.5 rounded-full bg-sky-600" aria-hidden />}
                </>
              )}
            </NavLink>
            )
          })}
        </nav>
      </div>

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={session.name} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800">{session.name}</span>
            <span className="block truncate text-xs text-slate-400">Signed in as Technician</span>
          </span>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-slate-50">
      <IncomingCallOverlay />
      {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col border-r border-slate-200 bg-white transition-all lg:static lg:translate-x-0 lg:transition-none">
        {sidebarContent}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="truncate text-base font-semibold text-slate-900">{title}</h1>

          <div className="ml-auto flex items-center gap-2">
            {unread > 0 && (
              <button
                onClick={() => navigate('/tech/inbox')}
                className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Open inbox"
              >
                <Mail className="h-5 w-5" aria-hidden />
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unread}
                </span>
              </button>
            )}
            <Dropdown
              width="w-56"
              trigger={
                <span className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100">
                  <Avatar name={session.name} size="sm" />
                </span>
              }
            >
              {(close) => (
                <>
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-800">{session.name}</p>
                    <p className="text-xs text-slate-400">{session.email}</p>
                  </div>
                  <MenuItem danger close={close} onClick={signOut}>
                    <LogOut className="h-4 w-4" /> Sign out
                  </MenuItem>
                </>
              )}
            </Dropdown>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400 sm:px-6">
          ServicePulse — Technician Portal · Track. Resolve. Report.
        </footer>
      </div>
    </div>
  )
}
