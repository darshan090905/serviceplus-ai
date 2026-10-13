import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, Menu, Search, Settings, LogOut, User as UserIcon } from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Avatar } from '../ui/Avatar'
import { Dropdown, MenuItem, MenuLabel } from '../ui/Dropdown'
import { Badge } from '../ui/Badge'
import { useDebouncedValue } from '../../hooks/useDebounce'
import { daysUntil, timeAgo } from '../../utils/dates'
import { cn } from '../../utils/cn'

const typeTones: Record<string, 'danger' | 'warning' | 'info' | 'neutral' | 'brand'> = {
  Risk: 'danger',
  AMC: 'warning',
  Complaint: 'info',
  Payment: 'brand',
  System: 'neutral',
}

interface HeaderProps {
  title: string
  onOpenMobile: () => void
}

export function Header({ title, onOpenMobile }: HeaderProps) {
  const { session, customers, amcs, notifications, markNotificationRead, markAllNotificationsRead, clearNotifications, logout } = useAppStore()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const debounced = useDebouncedValue(query, 200)
  const boxRef = useRef<HTMLDivElement>(null)

  const user = session ? { name: session.name, email: session.email } : { name: 'Admin', email: '' }

  const results = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (!q) return []
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q))
      .slice(0, 6)
      .map((c) => {
        const amc = amcs.find((a) => a.customerId === c.id && a.status !== 'Renewed')
        const days = amc ? daysUntil(amc.endDate) : null
        return { customer: c, days }
      })
  }, [debounced, customers, amcs])

  const unreadCount = notifications.filter((n) => !n.read).length

  const handleSignOut = () => {
    logout()
    toast('You have been signed out.')
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      <button onClick={onOpenMobile} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden min-w-0 sm:block">
        <h1 className="truncate text-base font-semibold text-slate-900">{title}</h1>
      </div>

      <div className="relative ml-auto w-full max-w-sm" ref={boxRef}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
          placeholder="Search customers, complaints, invoices..."
          aria-label="Global search"
          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {searchFocused && debounced.trim() && (
          <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            {results.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-slate-400">No customers match “{debounced}”.</p>
            ) : (
              <>
                <p className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Search results
                </p>
                {results.map(({ customer, days }) => (
                  <button
                    key={customer.id}
                    onMouseDown={() => {
                      navigate(`/customers/${customer.id}`)
                      setQuery('')
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <Avatar name={customer.name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">{customer.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {customer.company !== customer.name ? `${customer.company} · ` : ''}
                        {days !== null && days >= 0
                          ? `AMC expires in ${days} days`
                          : `Health score ${customer.health.score}`}
                      </span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

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
              {notifications.slice(0, 6).map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    markNotificationRead(n.id)
                    if (n.link) navigate(n.link)
                    close()
                  }}
                  className={cn(
                    'flex w-full items-start gap-2.5 border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50',
                    !n.read && 'bg-brand-50/40',
                  )}
                >
                  <Badge tone={typeTones[n.type]} className="mt-0.5 shrink-0">
                    {n.type}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                    <span className="block text-xs text-slate-500">{n.description}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(n.time)}</span>
                  </span>
                  {!n.read && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />}
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 p-2">
              <button
                onClick={() => navigate('/notifications')}
                className="w-full rounded-md px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                View all notifications
              </button>
            </div>
          </>
        )}
      </Dropdown>

      <Dropdown
        width="w-56"
        trigger={
          <span className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100">
            <Avatar name={user.name} size="sm" />
          </span>
        }
      >
        {(close) => (
          <>
            <MenuLabel>{`${user.name} — Administrator`}</MenuLabel>
            <MenuItem close={close} onClick={() => navigate('/settings')}>
              <UserIcon className="h-4 w-4 text-slate-400" /> Profile
            </MenuItem>
            <MenuItem close={close} onClick={() => navigate('/settings')}>
              <Settings className="h-4 w-4 text-slate-400" /> Settings
            </MenuItem>
            <MenuItem danger close={close} onClick={handleSignOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </MenuItem>
            <div className="border-t border-slate-100 px-3 py-2">
              <p className="flex items-center gap-1 text-[11px] text-emerald-600">
                <Check className="h-3 w-3" /> Frontend demo — no live backend
              </p>
            </div>
          </>
        )}
      </Dropdown>
    </header>
  )
}