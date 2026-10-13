import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Home,
  FileText,
  Wrench,
  CreditCard,
  MessageSquareWarning,
  PlusCircle,
  Bell,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Logo } from './Logo'
import { Avatar } from '../ui/Avatar'
import { Dropdown, MenuItem } from '../ui/Dropdown'
import { Badge } from '../ui/Badge'
import { cn } from '../../utils/cn'
import { timeAgo } from '../../utils/dates'

const titles: Array<{ match: RegExp; title: string }> = [
  { match: /^\/portal\/complaints\/new$/, title: 'Raise a Complaint' },
  { match: /^\/portal\/complaints\/[\w-]+$/, title: 'Complaint Details' },
  { match: /^\/portal\/complaints$/, title: 'My Complaints' },
  { match: /^\/portal\/amc$/, title: 'My AMC Contract' },
  { match: /^\/portal\/services$/, title: 'My Services' },
  { match: /^\/portal\/payments$/, title: 'My Payments' },
  { match: /^\/portal/, title: 'My Dashboard' },
]

const nav = [
  { to: '/portal', label: 'My Home', icon: Home },
  { to: '/portal/amc', label: 'My AMC', icon: FileText },
  { to: '/portal/services', label: 'My Services', icon: Wrench },
  { to: '/portal/payments', label: 'My Payments', icon: CreditCard },
  { to: '/portal/complaints', label: 'My Complaints', icon: MessageSquareWarning },
]

export function CustomerLayout() {
  const { session, logout, notifications, markNotificationRead, markAllNotificationsRead, clearNotifications, customers } = useAppStore()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const customer = customers.find((c) => c.id === session?.customerId)
  const title = titles.find((t) => t.match.test(location.pathname))?.title ?? 'My Dashboard'

  const signOut = () => {
    logout()
    toast('You have been signed out.')
    navigate('/login')
  }

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const myNotifications = useMemo(
    () => notifications.filter((n) => n.customerId === session?.customerId),
    [notifications, session?.customerId],
  )
  const unreadCount = myNotifications.filter((n) => !n.read).length
  const paymentAlertCount = myNotifications.filter((n) => !n.read && n.type === 'Payment').length
  const complaintAlertCount = myNotifications.filter((n) => !n.read && n.type === 'Complaint').length

  if (!customer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Logo className="mx-auto" />
          <h1 className="mt-6 text-2xl font-semibold text-slate-900">Portal not ready yet</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            We could not find a customer profile for this signed-in account. Create a customer record in Supabase,
            or sign out and log in with a valid customer account.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={signOut}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
            <button
              onClick={() => navigate('/login')}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Go to login
            </button>
          </div>
        </div>
      </div>
    )
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
        <div className="mb-3 rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2.5">
          <p className="text-xs font-semibold text-brand-700">Customer Portal</p>
          <p className="mt-0.5 text-[11px] leading-snug text-brand-600/80">
            Manage your AMC, services and complaints.
          </p>
        </div>
        <nav className="space-y-0.5" aria-label="Customer navigation">
          {nav.map(({ to, label, icon: Icon }) => {
            const badge = to === '/portal/payments' ? paymentAlertCount : to === '/portal/complaints' ? complaintAlertCount : 0
            return (
            <NavLink
              key={to}
              to={to}
              onClick={() => {
                const type = to === '/portal/payments' ? 'Payment' : to === '/portal/complaints' ? 'Complaint' : undefined
                if (type) myNotifications.filter((notification) => !notification.read && notification.type === type).forEach((notification) => markNotificationRead(notification.id))
              }}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')} aria-hidden />
                  <span className="min-w-0 flex-1">{label}</span>
                  {badge > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white" aria-label={`${badge} unread updates`}>{badge}</span>
                  ) : isActive && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden />}
                </>
              )}
            </NavLink>
            )
          })}
        </nav>

        <NavLink
          to="/portal/complaints/new"
          className={({ isActive }) =>
            cn(
              'mt-3 flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700',
              isActive && 'ring-2 ring-brand-200',
            )
          }
        >
          <PlusCircle className="h-4 w-4" aria-hidden />
          Raise a Complaint
        </NavLink>
      </div>

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={customer.name} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800">{customer.name}</span>
            <span className="block truncate text-xs text-slate-400">Signed in as Customer</span>
          </span>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-slate-50">
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
            <Dropdown
              width="w-80"
              trigger={
                <span className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100">
                  <Bell className="h-5 w-5" aria-hidden />
                  {unreadCount > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </span>
              }
            >
              {(close) => (
                <>
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
                    <p className="text-sm font-semibold text-slate-800">Notifications</p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          markAllNotificationsRead()
                          toast('All notifications marked as read.')
                        }}
                        className="text-xs font-medium text-brand-600 hover:text-brand-700"
                      >
                        Mark all as read
                      </button>
                      <button
                        onClick={() => {
                          clearNotifications()
                          toast('All notifications cleared.')
                        }}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto scrollbar-thin">
                    {myNotifications.length === 0 ? (
                      <p className="px-3 py-4 text-center text-sm text-slate-400">You have no notifications.</p>
                    ) : (
                      myNotifications.slice(0, 6).map((n) => (
                        <button
                          key={n.id}
                          onClick={() => {
                            markNotificationRead(n.id)
                            if (n.link) {
                              const portal = n.link.startsWith('/portal') ? n.link : `/portal/complaints`
                              navigate(portal)
                            }
                            close()
                          }}
                          className={cn(
                            'flex w-full items-start gap-2.5 border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50',
                            !n.read && 'bg-brand-50/40',
                          )}
                        >
                          <Badge tone="info" className="mt-0.5 shrink-0">Complaint</Badge>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                            <span className="block text-xs text-slate-500">{n.description}</span>
                            <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(n.time)}</span>
                          </span>
                          {!n.read && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </Dropdown>

            <Dropdown
              width="w-56"
              trigger={
                <span className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100">
                  <Avatar name={customer.name} size="sm" />
                </span>
              }
            >
              {(close) => (
                <>
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-800">{customer.name}</p>
                    <p className="text-xs text-slate-400">{customer.company}</p>
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
          ServicePulse — Customer Portal · Track. Analyze. Retain.
        </footer>
      </div>
    </div>
  )
}
