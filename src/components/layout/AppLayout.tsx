import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { cn } from '../../utils/cn'

const titles: Array<{ match: RegExp; title: string }> = [
  { match: /^\/dashboard/, title: 'Dashboard' },
  { match: /^\/customers\/[\w-]+$/, title: 'Customer Profile' },
  { match: /^\/customers$/, title: 'Customers' },
  { match: /^\/amc-contracts\/[\w-]+$/, title: 'AMC Contract' },
  { match: /^\/amc-contracts$/, title: 'AMC Contracts' },
  { match: /^\/services\/technicians\/[\w-]+$/, title: 'Technician' },
  { match: /^\/assets/, title: 'Equipment Register' },
  { match: /^\/services/, title: 'Services' },
  { match: /^\/complaints\/[\w-]+$/, title: 'Complaint Details' },
  { match: /^\/complaints$/, title: 'Complaints' },
  { match: /^\/payments/, title: 'Payments' },
  { match: /^\/retention\/[\w-]+$/, title: 'Retention Action' },
  { match: /^\/retention$/, title: 'Retention Center' },
  { match: /^\/reports/, title: 'Reports & Analytics' },
  { match: /^\/notifications/, title: 'Notifications' },
  { match: /^\/settings/, title: 'Settings' },
]

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sp-collapsed') === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    localStorage.setItem('sp-collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  const page = titles.find((t) => t.match.test(location.pathname))
  const title = page?.title ?? 'ServicePulse'

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className={cn('flex min-w-0 flex-1 flex-col transition-all', collapsed && 'lg:ml-0')}>
        <Header title={title} onOpenMobile={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400 sm:px-6">
          ServicePulse — Track. Analyze. Retain. · Frontend demo (backend integration ready)
        </footer>
      </div>
    </div>
  )
}