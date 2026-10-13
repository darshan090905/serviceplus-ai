import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardList, Wrench, RotateCcw, HelpCircle } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Legend,
} from 'recharts'
import { useAppStore } from '../store/AppStore'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Field'
import { StatCard } from '../components/ui/StatCard'
import { Badge } from '../components/ui/Badge'
import { ChartSkeleton } from '../components/ui/Skeleton'
import { riskColors, tooltipStyle } from '../components/charts/chartTheme'
import { buildHealthDistribution } from '../services/dashboardService'
import { useLoading } from '../hooks/useDebounce'
import { formatCompact, formatINR } from '../utils/format'
import { HEALTH_THRESHOLDS } from '../utils/health'
import { inRange, monthWindows } from '../utils/dates'
import { EmptyState } from '../components/ui/EmptyState'
import type { ComplaintCategory, Severity } from '../types'
import { slaStateOf } from '../utils/sla'
import { computeComplaintFtf, computeFtfCounts, DEFAULT_REVISIT_WINDOW_DAYS } from '../utils/ftf'

const categoryColors: Record<ComplaintCategory, string> = {
  'Service Quality': '#ef4444',
  Billing: '#f59e0b',
  Technician: '#3b82f6',
  Product: '#8b5cf6',
  Other: '#94a3b8',
}

/** Median days from complaint to the visit that answered it. Null when nothing was scored. */
function medianFixDays(map: { daysToFix: number | null }[]): number | null {
  const days = map.map((m) => m.daysToFix).filter((d): d is number => d != null).sort((a, b) => a - b)
  if (days.length === 0) return null
  const mid = Math.floor(days.length / 2)
  return days.length % 2 === 0 ? Math.round((days[mid - 1] + days[mid]) / 2) : days[mid]
}

export function ReportsPage() {
  const { customers, amcs, complaints, payments, retention, services } = useAppStore()
  const [range, setRange] = useState('6')
  const loading = useLoading(500)
  const monthCount = Number(range)

  const series = useMemo(() => {
    const distribution = buildHealthDistribution(customers)
    const windows = monthWindows(monthCount)
    const from = windows[0]?.start
    const to = windows[windows.length - 1]?.end

    // Revenue at risk: contract value that lapses this month for a customer
    // already flagged At Risk or Critical. Months with nothing at risk are
    // reported as zero, never as a made-up number.
    const atRiskCustomerIds = new Set(
      customers.filter((c) => c.health.level === 'At Risk' || c.health.level === 'Critical').map((c) => c.id),
    )
    const exposed = amcs.filter(
      (a) => atRiskCustomerIds.has(a.customerId) && a.status !== 'Renewed' && a.status !== 'Expired',
    )
    const revenueAtRisk = windows.map((w) => ({
      month: w.label,
      value: exposed.filter((a) => inRange(a.endDate, w.start, w.end)).reduce((sum, a) => sum + a.amount, 0),
    }))

    // Renewal rate per month, from contracts that actually ended in it. A month
    // with no contracts ending is left out of the series rather than plotted at
    // some invented percentage.
    const renewalRate = windows
      .map((w) => {
        const ending = amcs.filter((a) => inRange(a.endDate, w.start, w.end))
        if (!ending.length) return null
        const renewed = ending.filter((a) => a.renewalStatus === 'Done').length
        return { month: w.label, rate: Math.round((renewed / ending.length) * 100), count: ending.length }
      })
      .filter((row): row is { month: string; rate: number; count: number } => row !== null)

    const categoryCount = (['Service Quality', 'Billing', 'Technician', 'Product', 'Other'] as ComplaintCategory[]).map((cat) => ({
      category: cat,
      count: complaints.filter((c) => c.category === cat && inRange(c.created, from, to)).length,
    }))

    // SLA performance is measured on when a complaint was raised, since that is
    // when the clock started. Complaints with no deadline on record are counted
    // separately rather than folded into the pass rate, which would let an
    // untracked backlog flatter the number.
    const windowComplaints = complaints.filter((c) => inRange(c.created, from, to))
    const scored = windowComplaints.filter((c) => slaStateOf(c) !== 'none')
    const breached = scored.filter((c) => slaStateOf(c) === 'breached')
    const slaBySeverity = (['Critical', 'High', 'Medium', 'Low'] as Severity[]).map((sev) => {
      const group = scored.filter((c) => c.severity === sev)
      const missed = group.filter((c) => slaStateOf(c) === 'breached').length
      return {
        severity: sev,
        total: group.length,
        breached: missed,
        rate: group.length ? Math.round(((group.length - missed) / group.length) * 100) : null,
      }
    })

    const inWindow = (date: string) => inRange(date, from, to)
    const collected = payments.filter((p) => p.status === 'Paid' && inWindow(p.dueDate)).reduce((s, p) => s + p.amount, 0)
    const pending = payments
      .filter((p) => (p.status === 'Pending' || p.status === 'Partially Paid') && inWindow(p.dueDate))
      .reduce((s, p) => s + p.amount, 0)
    const overdue = payments.filter((p) => p.status === 'Overdue' && inWindow(p.dueDate)).reduce((s, p) => s + p.amount, 0)

    // Retention actions carry no date, so these stay all-time by definition.
    const completedActions = retention.filter((a) => a.status === 'Completed' || a.status === 'In Progress')
    const renewedAmcs = amcs.filter((a) => a.renewalStatus === 'Done')
    const revenueRetained =
      renewedAmcs.reduce((s, a) => s + a.amount, 0) +
      completedActions.reduce((s, a) => s + a.revenueAtRisk / 2, 0)
    const rated = services.filter((s) => s.rating !== null)
    const avgRating = rated.length
      ? (rated.reduce((s, x) => s + (x.rating ?? 0), 0) / rated.length).toFixed(1)
      : null

    return {
      distribution,
      revenueAtRisk,
      renewalRate,
      categoryCount,
      collected,
      pending,
      overdue,
      retained: {
        actions: retention.length,
        success: completedActions.length,
        renewals: renewedAmcs.length,
        revenueRetained,
      },
      avgRating,
      ratedCount: rated.length,
      sla: {
        scored: scored.length,
        breached: breached.length,
        untracked: windowComplaints.length - scored.length,
        onTime: scored.length - breached.length,
        passRate: scored.length ? Math.round(((scored.length - breached.length) / scored.length) * 100) : null,
        bySeverity: slaBySeverity,
      },
      ftf: (() => {
        // Scored only over complaints raised inside the selected window, so the
        // figure moves with the range the reader picked rather than describing
        // all history since the day the app was installed.
        const windowed = windowComplaints
        const map = computeComplaintFtf(windowed, services)
        const counts = computeFtfCounts(map)
        const scored = counts.firstTimeFixes + counts.revisits
        return {
          total: counts.totalComplaints,
          scored,
          unknown: counts.unknown,
          firstTimeFixes: counts.firstTimeFixes,
          revisits: counts.revisits,
          ftfRate: counts.ftfRate,
          windowDays: DEFAULT_REVISIT_WINDOW_DAYS,
          medianDays: medianFixDays(map),
        }
      })(),
    }
  }, [customers, amcs, complaints, payments, retention, services, monthCount])

  const windowLabel = range === '3' ? 'the last 3 months' : range === '6' ? 'the last 6 months' : 'the last 12 months'
  const atRiskTotal = series.revenueAtRisk.reduce((s, r) => s + r.value, 0)
  const hasRevenueExposure = atRiskTotal > 0
  const hasRenewalHistory = series.renewalRate.length > 0
  const hasComplaints = series.categoryCount.some((c) => c.count > 0)
  const hasCollections = series.collected + series.pending + series.overdue > 0
  const hasFtf = series.ftf.scored > 0

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Understand customer health, renewals and service performance."
        actions={
          <Select
            aria-label="Report range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            options={[
              { value: '3', label: 'Last 3 months' },
              { value: '6', label: 'Last 6 months' },
              { value: '12', label: 'Last 12 months' },
            ]}
            className="w-40"
          />
        }
      />

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartSkeleton /><ChartSkeleton /><ChartSkeleton /><ChartSkeleton />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Retention Actions" value={series.retained.actions} tone="brand" />
            <StatCard label="Successful Interventions" value={series.retained.success} tone="success" />
            <StatCard label="Renewals" value={series.retained.renewals} sub="completed on renewal status" tone="brand" />
            <StatCard label="Revenue Retained" value={formatCompact(series.retained.revenueRetained)} tone="success" />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card title="Customer Health Distribution" description="Share of customers by health band">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={Object.entries(series.distribution).map(([name, value]) => ({ name, value }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {Object.keys(series.distribution).map((name) => (
                        <Cell key={name} fill={riskColors[name]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {Object.entries(HEALTH_THRESHOLDS).map(([level, range]) => (
                  <p key={level} className="text-slate-500">
                    <span className="font-medium text-slate-700">{level}</span> {range.min}–{range.max}
                  </p>
                ))}
              </div>
            </Card>

            <Card title="Renewal Rate Trend" description={`Share of contracts renewed, by end month · ${windowLabel}`}>
              {hasRenewalHistory ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series.renewalRate} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [name === 'rate' ? `${value}%` : value, name === 'rate' ? 'Renewal rate' : 'Contracts ending']} />
                      <Line type="monotone" dataKey="rate" stroke="#2852e3" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="No contracts have ended yet"
                  description="A month appears here once contracts reach their end date, so there is nothing to plot yet."
                />
              )}
            </Card>

            <Card title="Complaint Trends by Category" description={`Complaints raised in ${windowLabel}`}>
              {hasComplaints ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series.categoryCount} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {series.categoryCount.map((entry) => (
                          <Cell key={entry.category} fill={categoryColors[entry.category]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="No complaints in this window" description="Nothing was reported by customers in the selected period." />
              )}
            </Card>

            {/* Full width: this card carries a 3-up stat row and a 4-column
                severity table. In a third of the page the table had no room for
                its headers and the stat tiles were left ~17px for a 24px-font
                value, so the numbers collided with their own icons. */}
            <Card
              className="xl:col-span-3"
              title="SLA Performance"
              description={`Deadlines from each complaint's severity · ${windowLabel}`}
            >
              {series.sla.scored === 0 ? (
                <EmptyState
                  title="No SLA data in this window"
                  description={
                    series.sla.untracked > 0
                      ? `${series.sla.untracked} complaint${series.sla.untracked === 1 ? ' was' : 's were'} raised before deadlines were being recorded, so there is nothing to score.`
                      : 'No complaints were raised in the selected period.'
                  }
                />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <StatCard label="On-time rate" value={`${series.sla.passRate}%`} icon={CheckCircle2} tone={series.sla.passRate != null && series.sla.passRate < 90 ? 'warning' : 'success'} />
                    <StatCard label="Breached" value={String(series.sla.breached)} icon={AlertTriangle} tone={series.sla.breached > 0 ? 'danger' : 'success'} />
                    <StatCard label="Scored" value={String(series.sla.scored)} icon={ClipboardList} />
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                        <th className="py-2">Severity</th>
                        <th className="py-2">Scored</th>
                        <th className="py-2">Breached</th>
                        <th className="py-2 text-right">On-time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {series.sla.bySeverity.map((row) => (
                        <tr key={row.severity} className="border-b border-slate-50 last:border-0">
                          <td className="py-2 font-medium text-slate-700">{row.severity}</td>
                          <td className="py-2 text-slate-600">{row.total}</td>
                          <td className="py-2">
                            {row.total === 0 ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <Badge tone={row.breached > 0 ? 'danger' : 'success'}>{row.breached}</Badge>
                            )}
                          </td>
                          <td className="py-2 text-right font-semibold text-slate-900">
                            {row.rate == null ? <span className="font-normal text-slate-400">—</span> : `${row.rate}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {series.sla.untracked > 0 && (
                    <p className="text-xs text-slate-500">
                      {series.sla.untracked} complaint{series.sla.untracked === 1 ? '' : 's'} in this window predate SLA
                      tracking and are excluded from the rate rather than assumed to have been on time.
                    </p>
                  )}
                </div>
              )}
            </Card>

            {/* Full width, and two tiles per row rather than four: at four
                across a third-width card each tile was narrower than its own
                icon badge, so the rework and first-time-fix figures had nowhere
                to go. */}
            <Card
              className="xl:col-span-3"
              title="First-Time Fix & Rework"
              description={`Did the visit that answered a complaint actually fix it · ${windowLabel}`}
            >
              {hasFtf ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                      label="First-time fix"
                      value={`${series.ftf.ftfRate}%`}
                      icon={CheckCircle2}
                      tone={series.ftf.ftfRate >= 80 ? 'success' : series.ftf.ftfRate >= 60 ? 'warning' : 'danger'}
                    />
                    <StatCard label="Fixed first visit" value={String(series.ftf.firstTimeFixes)} icon={Wrench} tone="success" />
                    <StatCard label="Came back" value={String(series.ftf.revisits)} icon={RotateCcw} tone={series.ftf.revisits > 0 ? 'danger' : 'default'} />
                    <StatCard
                      label="Median time to fix"
                      value={series.ftf.medianDays == null ? '—' : `${series.ftf.medianDays}d`}
                      icon={ClipboardList}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    A complaint counts as a first-time fix when a completed visit followed it and the same fault did not
                    come back within {series.ftf.windowDays} days. A complaint that came back after a visit had already
                    fixed it is counted as a rework, because that is the only evidence in the data that a repair failed.
                  </p>
                  {series.ftf.unknown > 0 && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700">
                      <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {series.ftf.unknown} of {series.ftf.total} complaints in this window had no completed visit recorded
                      within {series.ftf.windowDays} days. They are left out of the rate instead of being counted as
                      successes, so the percentage above covers only the {series.ftf.scored} that can actually be judged.
                    </p>
                  )}
                </div>
              ) : (
                <EmptyState
                  title="Nothing to score yet"
                  description={
                    series.ftf.total === 0
                      ? 'No complaints were raised in the selected period, so there is no fix rate to report.'
                      : `None of the ${series.ftf.total} complaints in this window have a completed visit recorded against them yet. Until a visit is logged, no rate is reported rather than reporting 0% or 100%.`
                  }
                />
              )}
            </Card>

            <Card title="Revenue at Risk" description={`Contract value lapsing for At Risk / Critical customers · ${windowLabel}`}>
              {hasRevenueExposure ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series.revenueAtRisk} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revRisk" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                      <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatINR(Number(value)), 'Revenue at risk']} />
                      <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} fill="url(#revRisk)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="No revenue at risk in this window"
                  description="Only contracts held by At Risk or Critical customers count here, and none of theirs end in this period."
                />
              )}
              <p className="mt-2 text-xs text-slate-400">Exposure estimate — not guaranteed loss.</p>
            </Card>

            <Card title="Payment Collection" description={`Invoices due in ${windowLabel}`}>
              {hasCollections ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={[
                        { name: 'Collected', value: series.collected, color: '#10b981' },
                        { name: 'Pending', value: series.pending, color: '#f59e0b' },
                        { name: 'Overdue', value: series.overdue, color: '#ef4444' },
                      ]}
                      margin={{ top: 8, right: 16, left: 24, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatINR(Number(value)), 'Amount']} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={26}>
                        {[{ name: 'Collected', color: '#10b981' }, { name: 'Pending', color: '#f59e0b' }, { name: 'Overdue', color: '#ef4444' }].map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="No invoices due in this window" description="Payments are grouped by their due date, and none fall in the selected period." />
              )}
            </Card>

            <Card title="Retention Performance" description="Actions taken and results">
              {/* These were four hand-rolled tiles rather than StatCards, which
                  left the block visibly misaligned with itself: "Revenue
                  retained" had to drop to text-xl to fit, so one number in a
                  2x2 sat a size below the other three, and the tiles were 82px
                  tall against 116px for every StatCard elsewhere on the page.
                  StatCard also carries the container-query guard, so they stay
                  readable when this card is a third of the page width. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <StatCard label="Recommendations" value={series.retained.actions} />
                <StatCard label="Successfully handled" value={series.retained.success} />
                <StatCard label="Renewals closed" value={series.retained.renewals} />
                <StatCard label="Revenue retained" value={formatCompact(series.retained.revenueRetained)} />
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 p-4 text-sm">
                <p className="flex justify-between">
                  <span className="text-slate-500">Average service rating</span>
                  <span className="font-semibold">
                    {series.avgRating ? `${series.avgRating} / 5` : 'Awaiting ratings'}
                  </span>
                </p>
                <p className="mt-1 flex justify-between"><span className="text-slate-500">Customers (current)</span><span className="font-semibold">{customers.length}</span></p>
                {!series.avgRating && (
                  <p className="mt-1.5 text-xs text-slate-400">
                    {series.ratedCount} rated {series.ratedCount === 1 ? 'visit' : 'visits'} so far. Customers rate a visit from their portal once it is complete.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}