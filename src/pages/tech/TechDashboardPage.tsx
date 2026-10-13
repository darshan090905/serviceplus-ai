import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, MessageSquareWarning, CheckCircle2, Mail, ArrowRight, AlertTriangle } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAppStore } from '../../store/AppStore'
import { Card } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { tooltipStyle } from '../../components/charts/chartTheme'
import { formatShortDate, timeAgo } from '../../utils/dates'
import { cn } from '../../utils/cn'

export function TechDashboardPage() {
  const { session, services, complaints, emails, customers } = useAppStore()
  const me = session?.technicianId ?? ''
  const myName = session?.name ?? ''

  const data = useMemo(() => {
    const isMine = (assigned: string) =>
      assigned === myName ||
      assigned === me ||
      assigned.toLowerCase() === myName.toLowerCase()

    const myServices = services.filter((s) => s.technician === me || s.technician === myName).sort((a, b) => b.date.localeCompare(a.date))
    const upcoming = myServices.filter((s) => s.status === 'Scheduled' || s.status === 'In Progress')
    const myComplaints = complaints.filter((c) => isMine(c.assignedTo))
    const openComplaints = myComplaints.filter((c) => c.status === 'Open' || c.status === 'In Progress')
    const due = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const key = d.toLocaleDateString('en-IN', { weekday: 'short' })
      return { day: key, completed: myServices.filter((s) => s.status === 'Completed' && s.date === d.toISOString().slice(0, 10)).length }
    })
    const myEmails = emails.filter((e) => e.to === session?.name || e.toEmail === session?.email).slice(0, 4)
    const critical = openComplaints.filter((c) => c.severity === 'Critical' || c.severity === 'High')
    return { myServices, upcoming, myComplaints, openComplaints, due, myEmails, critical }
  }, [services, complaints, emails, me, myName, session?.name, session?.email])

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? id
  const completedThisWeek = data.myServices.filter((s) => {
    const d = new Date(s.date)
    const weekAgo = Date.now() - 7 * 86_400_000
    return s.status === 'Completed' && d.getTime() >= weekAgo
  }).length

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">Welcome back,</p>
          <h1 className="text-xl font-bold text-slate-900">{session?.name}</h1>
          <p className="mt-1 text-sm text-slate-500">Field Technician · Service Operations</p>
        </div>
        {data.critical.length > 0 && (
          <Link
            to="/tech/complaints"
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {data.critical.length} urgent complaint{data.critical.length > 1 ? 's' : ''} need attention
          </Link>
        )}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Upcoming / Active Visits" value={data.upcoming.length} sub="assigned to you" icon={CalendarClock} tone="brand" />
        <StatCard label="Open Complaints" value={data.openComplaints.length} sub="waiting on your team" icon={MessageSquareWarning} tone={data.openComplaints.length > 0 ? 'danger' : 'default'} />
        <StatCard label="Completed This Week" value={completedThisWeek} sub="services closed" icon={CheckCircle2} tone="success" />
        <StatCard label="Unread Emails" value={data.myEmails.filter((e) => !e.read).length} sub="in your inbox" icon={Mail} tone="warning" />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card title="Next Visits" description="Your upcoming scheduled work" className="lg:col-span-1" bodyClassName="p-0">
          {data.upcoming.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No upcoming visits.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.upcoming.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{customerName(s.customerId)}</p>
                    <p className="text-xs text-slate-500">{s.serviceType} · {s.id}</p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-medium text-slate-700">{formatShortDate(s.date)}</span>
                    <StatusBadge kind="service" value={s.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Open Complaints" description="Assigned to you, highest severity first" className="lg:col-span-2" bodyClassName="p-0">
          {data.openComplaints.length === 0 ? (
            <EmptyState title="All caught up" description="No open complaints assigned to you right now." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...data.openComplaints]
                .sort((a, b) => Number(a.severity === 'Critical') - Number(b.severity === 'Critical'))
                .slice(0, 5)
                .map((c) => (
                  <li key={c.id}>
                    <Link to="/tech/complaints" className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{c.id} · {customerName(c.customerId)}</p>
                        <p className="truncate text-xs text-slate-500">{c.description}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge tone={c.severity === 'Critical' ? 'critical' : c.severity === 'High' ? 'danger' : 'warning'}>{c.severity}</Badge>
                        <StatusBadge kind="complaint" value={c.status} />
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Weekly Activity" description="Services completed in the last 7 days">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.due} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="completed" name="Completed" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Latest Emails" description="Automated alerts and updates" className="lg:col-span-2" bodyClassName="p-0">
          {data.myEmails.length === 0 ? (
            <EmptyState title="No emails yet" description="System emails will appear here." icon={Mail} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.myEmails.map((e) => (
                <li key={e.id}>
                  <Link to="/tech/inbox" className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className={cn('truncate text-sm text-slate-800', !e.read && 'font-semibold')}>{e.subject}</p>
                      <p className="truncate text-xs text-slate-500">{e.body}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!e.read && <span className="h-2 w-2 rounded-full bg-brand-500" aria-label="Unread" />}
                      <span className="text-[11px] text-slate-400">{timeAgo(e.sentAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 px-5 py-3">
            <Link to="/tech/inbox" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              Open full inbox <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}