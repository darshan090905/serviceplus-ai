import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  FileText,
  Wrench,
  MessageSquareWarning,
  CreditCard,
  HeartHandshake,
  BarChart3,
  Bell,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  X,
  UserCheck,
  Cpu,
  CalendarDays,
} from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { cn } from '../../utils/cn'
import { Logo } from './Logo'
import { Avatar } from '../ui/Avatar'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  badge?: number
  onClick?: () => void
}

const mainNav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/assets', label: 'Equipment', icon: Cpu },
  { to: '/amc-contracts', label: 'AMC Contracts', icon: FileText },
  { to: '/services', label: 'Services', icon: Wrench },
  { to: '/dispatch', label: 'Dispatch', icon: CalendarDays },
  { to: '/complaints', label: 'Complaints', icon: MessageSquareWarning },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/retention', label: 'Retention Center', icon: HeartHandshake },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
]

const systemNav: NavItem[] = [
  { to: '/accounts', label: 'Accounts', icon: UserCheck, badge: 0 },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

function NavSection({ title, items, collapsed }: { title: string; items: NavItem[]; collapsed: boolean }) {
  return (
    <div className="mb-2">
      {!collapsed && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>}
      <nav className="space-y-0.5" aria-label={title}>
        {items.map(({ to, label, icon: Icon, badge, onClick }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            onClick={onClick}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn('h-4 w-4 shrink-0', isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')}
                  aria-hidden
                />
                {!collapsed && <span>{label}</span>}
                {!collapsed && typeof badge === 'number' && badge > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white" aria-label={`${badge} pending`}>
                    {badge}
                  </span>
                )}
                {isActive && !collapsed && !badge && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden />}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: SidebarProps) {
  const navigate = useNavigate()
  const { session, accounts, notifications, retention, markNotificationRead, markAllNotificationsRead } = useAppStore()
  const pendingCount = accounts.filter((a) => a.status === 'pending').length
  const unreadCount = notifications.filter((n) => !n.read).length
  const paymentAlertCount = notifications.filter((n) => !n.read && n.type === 'Payment').length
  const retentionCount = retention.filter((a) => a.status === 'Pending').length
  const markPaymentAlertsRead = () => {
    notifications.filter((n) => !n.read && n.type === 'Payment').forEach((n) => markNotificationRead(n.id))
  }
  const user = session ? { name: session.name, role: 'Administrator' } : { name: 'Admin', role: 'Service Operations' }
  const content = (
    <>
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
        <Logo compact={collapsed} />
        <button onClick={onCloseMobile} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 lg:hidden" aria-label="Close menu">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        {!collapsed && (
          <div className="mb-3 rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2.5">
            <p className="text-xs font-semibold text-brand-700">Retention Intelligence</p>
            <p className="mt-0.5 text-[11px] leading-snug text-brand-600/80">
              Track customer health before it affects renewals.
            </p>
          </div>
        )}
        <NavSection
          title="Main"
          items={mainNav.map((n) =>
            n.to === '/payments' ? { ...n, badge: paymentAlertCount, onClick: markPaymentAlertsRead } : n.to === '/retention' ? { ...n, badge: retentionCount } : n,
          )}
          collapsed={collapsed}
        />
        <NavSection
          title="System"
          items={systemNav.map((n) =>
            n.to === '/accounts' ? { ...n, badge: pendingCount } : n.to === '/notifications' ? { ...n, badge: unreadCount, onClick: markAllNotificationsRead } : n,
          )}
          collapsed={collapsed}
        />
      </div>

      <div className="border-t border-slate-100 p-3">
        <button
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100',
            collapsed && 'justify-center',
          )}
          onClick={() => navigate('/settings')}
          title={collapsed ? user.name : undefined}
        >
          <Avatar name={user.name} size="sm" />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800">{user.name}</span>
              <span className="block truncate text-xs text-slate-400">{user.role}</span>
            </span>
          )}
        </button>
        {/*
          Always rendered, in both directions. This used to be hidden while
          collapsed, which made collapsing a one-way door: the only control that
          could undo it was removed by the act of using it. The state is
          persisted to localStorage as sp-collapsed, so it also survived every
          reload and the user was stuck at icon width with no way back short of
          clearing site data by hand.
        */}
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600',
            collapsed && 'justify-center',
          )}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <>
              <ChevronsLeft className="h-3.5 w-3.5" aria-hidden />
              <span>Collapse sidebar</span>
            </>
          )}
        </button>
      </div>
    </>
  )

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={onCloseMobile} aria-hidden />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col border-r border-slate-200 bg-white transition-all',
          'lg:static lg:translate-x-0 lg:transition-none',
          collapsed && 'lg:w-[68px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {content}
      </aside>
    </>
  )
}
