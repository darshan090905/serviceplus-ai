import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Wrench, CreditCard, MessageSquareWarning, ArrowRight, CalendarClock, Activity, BarChart3 } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from 'recharts'
import { useAppStore } from '../../store/AppStore'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { StatCard } from '../../components/ui/StatCard'
import { HealthRing } from '../../components/customers/HealthRing'
import { formatDate, daysUntil, formatShortDate } from '../../utils/dates'
import { formatINR } from '../../utils/format'

const SEVERITY_PENALTY: Record<string, number> = { Critical: -25, High: -15, Medium: -8, Low: -4 }

export function PortalHomePage() {
  const { session, customers, amcs, services, complaints, payments } = useAppStore()
  const customer = customers.find((c) => c.id === session?.customerId)

  const data = useMemo(() => {
    if (!customer) return null
    const amc = amcs.find((a) => a.customerId === customer.id && a.status !== 'Renewed')
    const myServices = services.filter((s) => s.customerId === customer.id).sort((a, b) => b.date.localeCompare(a.date))
    const myComplaints = complaints.filter((c) => c.customerId === customer.id).sort((a, b) => b.created.localeCompare(a.created))
    const openComplaints = myComplaints.filter((c) => c.status === 'Open' || c.status === 'In Progress').length
    const resolvedComplaints = myComplaints.filter((c) => c.status === 'Resolved' || c.status === 'Closed').length
    const overduePayments = payments.filter((p) => p.customerId === customer.id && p.status === 'Overdue').length
    const nextService = myServices.find((s) => s.status === 'Scheduled')

    const events = [
      ...myServices.filter((s) => s.status === 'Completed').map((s) => ({ date: s.date, delta: 5 })),
      ...myComplaints.map((c) => ({ date: c.created, delta: SEVERITY_PENALTY[c.severity] ?? -5 })),
    ].sort((a, b) => a.date.localeCompare(b.date))

    const points: { date: string; score: number }[] = []
    let running = 100
    for (const e of events) {
      running = Math.max(5, Math.min(100, running + e.delta))
      const last = points[points.length - 1]
      if (last && last.date === e.date) last.score = running
      else points.push({ date: e.date, score: running })
    }
    if (points.length === 0) points.push({ date: new Date().toISOString().slice(0, 10), score: customer.health.score })
    else points.push({ date: new Date().toISOString().slice(0, 10), score: customer.health.score })

    const completed = myServices.filter((s) => s.status === 'Completed')
    // Only average visits the customer actually rated — never assume a score.
    const rated = completed.filter((s) => s.rating !== null)
    const avgRating = rated.length ? rated.reduce((sum, s) => sum + (s.rating ?? 0), 0) / rated.length : null
    const monthly = (() => {
      const out: { month: string; visits: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        out.push({
          month: d.toLocaleDateString('en-IN', { month: 'short' }),
          visits: completed.filter((s) => {
            const sd = new Date(s.date)
            return sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear()
          }).length,
        })
      }
      return out
    })()

    return { amc, myServices, myComplaints, openComplaints, resolvedComplaints, overduePayments, nextService, healthTrend: points, monthly, avgRating }
  }, [customer, amcs, services, complaints, payments])

  if (!customer || !data) return null

  const days = data.amc ? daysUntil(data.amc.endDate) : null

  return (
    <div>
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">Welcome back,</p>
            <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{customer.company}</p>
            <p className="mt-1 flex flex-wrap gap-1">
              {customer.serviceTypes.map((s) => <Badge key={s} tone="brand">{s}</Badge>)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <HealthRing score={customer.health.score} level={customer.health.level} size={44} />
              <div>
                <StatusBadge kind="risk" value={customer.health.level} />
                <p className="text-[11px] text-slate-400">out of 100</p>
              </div>
            </div>
            <Link
              to="/portal/complaints/new"
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              Raise a Complaint
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="AMC Status"
          value={data.amc?.status ?? '—'}
          sub={days !== null && days >= 0 ? `ends in ${days} days` : data.amc ? 'needs renewal attention' : 'no active AMC'}
          icon={FileText}
          tone="brand"
        />
        <StatCard label="Open Complaints" value={data.openComplaints} sub="awaiting resolution" icon={MessageSquareWarning} tone="danger" />
        <StatCard label="Services Completed" value={data.myServices.filter((s) => s.status === 'Completed').length} sub={data.nextService ? `next: ${formatShortDate(data.nextService.date)}` : 'no upcoming service'} icon={Wrench} tone="success" />
        <StatCard label="Overdue Payments" value={data.overduePayments} sub={formatINR(payments.filter((p) => p.customerId === customer.id && p.status === 'Overdue').reduce((s, p) => s + p.amount, 0)) || 'all clear'} icon={CreditCard} tone="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={data.amc ? `My AMC — ${data.amc.serviceType}` : 'My AMC'} description="Your active service contract">
          {data.amc ? (
            <div className="space-y-2 text-sm">
              <p className="flex justify-between"><span className="text-slate-500">Contract</span><span className="font-medium">{data.amc.id}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Start</span><span>{formatDate(data.amc.startDate)}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">End</span><span>{formatDate(data.amc.endDate)}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Annual value</span><span className="font-semibold">{formatINR(data.amc.amount)}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Status</span><StatusBadge kind="amc" value={data.amc.status} /></p>
              {days !== null && days >= 0 && (
                <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  Your contract ends in {days} days — renewal reminder will be sent before expiry.
                </p>
              )}
              <Link to="/portal/amc" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                View contract details <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No active AMC contract.</p>
          )}
        </Card>

        <Card title="Recent Activity" description="Your latest interactions">
          {data.myComplaints.length === 0 && data.myServices.length === 0 ? (
            <p className="text-sm text-slate-400">No activity yet.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {[...data.myServices.slice(0, 3).map((s) => ({ date: s.date, label: s.status === 'Completed' ? 'Service completed' : 'Service scheduled', detail: `${s.serviceType} · ${s.technician}` })),
              ...data.myComplaints.slice(0, 3).map((c) => ({ date: c.created, label: 'Complaint updated', detail: `${c.id} · ${c.status}` }))]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 5)
                .map((e, i) => (
                  <li key={i} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{e.label}</p>
                      <p className="text-xs text-slate-500">{e.detail}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatShortDate(e.date)}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card title="My Complaints" description="Track resolution status">
          <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
            <span className="text-slate-500">Resolved complaints</span>
            <span className="font-semibold text-emerald-600">{data.resolvedComplaints} / {data.myComplaints.length}</span>
          </div>
          {data.myComplaints.length === 0 ? (
            <p className="text-sm text-slate-400">You have not raised any complaints yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.myComplaints.slice(0, 3).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link to={`/portal/complaints/${c.id}`} className="min-w-0 truncate font-medium text-slate-800 hover:text-brand-600">{c.id}</Link>
                  <StatusBadge kind="complaint" value={c.status} />
                </li>
              ))}
            </ul>
          )}
          <Link to="/portal/complaints" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
            View all complaints <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title={<span className="flex items-center gap-1.5"><Activity className="h-4 w-4 text-brand-500" aria-hidden /> Health Trend</span>}
          description="How your account health score has moved with each service and complaint."
        >
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.healthTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="portalHealth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2852e3" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2852e3" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="date" tickFormatter={(d: string) => formatShortDate(d)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number | string) => [`${v}/100`, 'Health score']}
                  labelFormatter={(d: string) => formatShortDate(String(d))}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="score" stroke="#2852e3" strokeWidth={2} fill="url(#portalHealth)" dot={{ r: 3, fill: '#2852e3' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title={<span className="flex items-center gap-1.5"><BarChart3 className="h-4 w-4 text-brand-500" aria-hidden /> Service Activity</span>}
          description={data.avgRating !== null ? `6-month visits with an average rating of ${data.avgRating.toFixed(1)} / 5` : 'Completed services over the last 6 months.'}
        >
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number | string) => [`${v}`, 'visits']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar dataKey="visits" fill="#2852e3" radius={[5, 5, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}