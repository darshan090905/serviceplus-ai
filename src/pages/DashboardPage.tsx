import { useState } from 'react'
import { Users, FileText, AlertTriangle, CreditCard, RefreshCcw, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../store/AppStore'
import { usePrefs } from '../store/prefs'
import type { KpiTrend } from '../types'
import {
  buildHealthDistribution,
  buildKpis,
  buildPriorityActions,
  buildRecentActivity,
  buildRenewalPipeline,
  expiringAmcs,
} from '../services/dashboardService'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Field'
import { HealthDonut } from '../components/charts/HealthDonut'
import { RenewalPipeline } from '../components/dashboard/RenewalPipeline'
import { ExpiringAmcTable } from '../components/dashboard/ExpiringAmcTable'
import { PriorityActions } from '../components/dashboard/PriorityActions'
import { RecentActivity } from '../components/dashboard/RecentActivity'
import { StatSkeleton, ChartSkeleton, PanelSkeleton } from '../components/ui/Skeleton'
import { useLoading } from '../hooks/useDebounce'
import { formatCompact, formatINR } from '../utils/format'
import { daysAgo } from '../utils/dates'
import { EmptyState } from '../components/ui/EmptyState'

const ranges = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'year', label: 'This year' },
]

// A comparison is only green when the number actually rose. A drop has to read
// as a drop, and "not enough history" has to read as neither.
function trendTone(trend: KpiTrend): 'default' | 'positive' | 'negative' {
  if (trend.direction === 'up') return 'positive'
  if (trend.direction === 'down') return 'negative'
  return 'default'
}

export function DashboardPage() {
  const { customers, amcs, services, complaints, payments, retention } = useAppStore()
  const prefs = usePrefs()
  const [range, setRange] = useState('30')
  const loading = useLoading(500)

  const kpis = buildKpis(customers, amcs, payments)
  const distribution = buildHealthDistribution(customers)
  const pipeline = buildRenewalPipeline(customers, amcs)
  const expiring = expiringAmcs(amcs, 30)
  const expiringRows = expiring
    .map((amc) => ({ amc, customer: customers.find((c) => c.id === amc.customerId) }))
    .filter((r): r is { amc: (typeof expiring)[number]; customer: NonNullable<typeof r.customer> } => Boolean(r.customer))
  const priorityActions = buildPriorityActions(customers, complaints, amcs, payments, prefs)

  const cutover = range === 'year' ? '2026-01-01' : daysAgo(Number(range))
  const activity = buildRecentActivity(customers, amcs, services, complaints, payments, retention).filter(
    (e) => e.date >= cutover,
  )

  const overdueTotal = payments
    .filter((p) => p.status === 'Overdue')
    .reduce((sum, p) => sum + p.amount, 0)

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Here's what's happening across your customer base."
        actions={
          <Select
            aria-label="Date range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            options={ranges}
            className="w-40"
          />
        }
      />

      {loading ? (
        <StatSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Total Customers" value={kpis.totalCustomers} sub={kpis.customerGrowth.label} icon={Users} tone="brand" subTone={trendTone(kpis.customerGrowth)} />
          <StatCard label="Active AMCs" value={kpis.activeAmcs} sub={kpis.amcGrowth.label} icon={FileText} tone="default" subTone={trendTone(kpis.amcGrowth)} />
          <StatCard label="Expiring Soon" value={kpis.expiringSoon} sub="AMCs expiring within 60 days" icon={AlertTriangle} tone="warning" subTone="default" />
          <StatCard label="High-Risk Customers" value={kpis.highRisk} sub="Requires action" icon={AlertTriangle} tone="danger" subTone="negative" />
          <StatCard
            label="Outstanding Payments"
            value={formatCompact(kpis.outstandingPayments)}
            sub={`${kpis.overdueAccounts} overdue ${kpis.overdueAccounts === 1 ? 'account' : 'accounts'}`}
            icon={CreditCard}
            tone="default"
            subTone="negative"
          />
          <StatCard label="Renewal Rate" value={`${kpis.renewalRate}%`} sub={kpis.renewalRateDelta.label} icon={RefreshCcw} tone="success" subTone={trendTone(kpis.renewalRateDelta)} />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
            <PanelSkeleton />
          </>
        ) : (
          <>
            <Card title="Customer Health Overview" description="Distribution across the customer base">
              <HealthDonut distribution={distribution} />
            </Card>
            <Card
              title="Renewal Pipeline"
              description="Revenue exposure by health band"
              actions={
                <span className="text-lg font-bold text-slate-900">
                  {formatCompact(pipeline.reduce((sum, p) => sum + p.value, 0))}
                </span>
              }
            >
              <RenewalPipeline data={pipeline} />
            </Card>
            <Card title="Priority Actions" description="What the operations team should do next">
              <PriorityActions items={priorityActions} />
            </Card>
          </>
        )}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="AMC Expiring Soon"
          description="Contracts that need attention"
          actions={
            <Link to="/amc-contracts" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          }
          bodyClassName="p-0"
        >
          {loading ? <ChartSkeleton /> : expiringRows.length === 0 ? (
            <EmptyState title="No AMCs expiring soon" description="Contracts are in good shape within the next 30 days." />
          ) : (
            <ExpiringAmcTable rows={expiringRows} />
          )}
        </Card>
        <Card
          title="Recent Activity"
          description="Latest events across operations"
          actions={
            <span className="text-xs text-slate-400">₹{formatINR(overdueTotal).replace('₹', '')} overdue open</span>
          }
        >
          {loading ? <PanelSkeleton header={false} /> : activity.length === 0 ? (
            <EmptyState title="No activity in this period" />
          ) : (
            <RecentActivity events={activity} />
          )}
        </Card>
      </div>
    </div>
  )
}