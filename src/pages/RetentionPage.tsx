import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HeartHandshake, AlertTriangle, IndianRupee, Clock } from 'lucide-react'
import type { RetentionAction } from '../types'
import { useAppStore } from '../store/AppStore'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { StatCard } from '../components/ui/StatCard'
import { Card } from '../components/ui/Card'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Tabs } from '../components/ui/Tabs'
import { SearchInput } from '../components/ui/SearchInput'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Badge } from '../components/ui/Badge'
import { HealthRing } from '../components/customers/HealthRing'
import { EmptyState } from '../components/ui/EmptyState'
import { TableSkeleton } from '../components/ui/Skeleton'
import { ApprovalModal } from '../components/retention/ApprovalModal'
import { formatINR } from '../utils/format'
import { useLoading } from '../hooks/useDebounce'
import { daysUntil, formatDate } from '../utils/dates'

const statusTabs = [
  { id: 'all', label: 'All' },
  { id: 'Pending', label: 'Pending' },
  { id: 'Approved', label: 'Approved' },
  { id: 'In Progress', label: 'In Progress' },
  { id: 'Completed', label: 'Completed' },
]

const workflow = ['Customer', 'Health Score', 'Risk', 'Risk Factors', 'Recommended Action', 'Owner Approval', 'AI Communication']

export function RetentionPage() {
  const { retention, customers, amcs, setRetentionStatus } = useAppStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [approveTarget, setApproveTarget] = useState<RetentionAction | null>(null)
  const loading = useLoading(450)

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers])
  const amcMap = useMemo(() => {
    const map = new Map<string, string>()
    amcs.forEach((a) => {
      if (a.status !== 'Renewed' && !map.has(a.customerId)) map.set(a.customerId, a.endDate)
    })
    return map
  }, [amcs])

  const summary = useMemo(() => {
    const highRisk = retention.filter((a) => {
      const level = customerMap.get(a.customerId)?.health.level
      return level === 'At Risk' || level === 'Critical'
    })
    const critical = retention.filter((a) => customerMap.get(a.customerId)?.health.level === 'Critical')
    return {
      highRisk: highRisk.length,
      critical: critical.length,
      revenue: retention.reduce((s, a) => s + a.revenueAtRisk, 0),
      pending: retention.filter((a) => a.status === 'Pending').length,
    }
  }, [retention, customerMap])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return retention
      .filter((a) => {
        const customer = customerMap.get(a.customerId)
        if (q && !customer?.name.toLowerCase().includes(q)) return false
        if (tab !== 'all' && a.status !== tab) return false
        return true
      })
      .sort((a, b) => a.priority - b.priority)
  }, [retention, tab, query, customerMap])

  const columns: Array<Column<RetentionAction>> = [
    { key: 'priority', header: 'Priority', render: (a) => <Badge tone={a.priority === 1 ? 'critical' : a.priority === 2 ? 'danger' : a.priority === 3 ? 'warning' : 'success'}>#{a.priority}</Badge> },
    {
      key: 'customer',
      header: 'Customer',
      render: (a) => {
        const customer = customerMap.get(a.customerId)
        return (
          <button className="text-left font-medium text-brand-700 hover:underline" onClick={(e) => { e.stopPropagation(); navigate(`/customers/${a.customerId}`) }}>
            {customer?.name}
          </button>
        )
      },
    },
    {
      key: 'health',
      header: 'Health',
      render: (a) => {
        const customer = customerMap.get(a.customerId)
        if (!customer) return '—'
        return (
          <span className="flex items-center gap-1.5">
            <HealthRing score={customer.health.score} level={customer.health.level} size={30} showLabel={false} />
            <span className="font-semibold">{customer.health.score}</span>
          </span>
        )
      },
    },
    { key: 'risk', header: 'Risk', render: (a) => <StatusBadge kind="risk" value={customerMap.get(a.customerId)?.health.level ?? 'Healthy'} /> },
    {
      key: 'expiry',
      header: 'AMC Expiry',
      render: (a) => {
        const expiry = amcMap.get(a.customerId)
        if (!expiry) return <span className="text-slate-300">—</span>
        const days = daysUntil(expiry)
        return (
          <span>
            <span className="block text-slate-600">{formatDate(expiry)}</span>
            <span className="block text-xs text-slate-400">{days > 0 ? `${days} days` : 'expired'}</span>
          </span>
        )
      },
    },
    { key: 'revenue', header: 'Revenue at Risk', align: 'right', render: (a) => <span className="font-semibold text-slate-900">{formatINR(a.revenueAtRisk)}</span> },
    { key: 'primary', header: 'Primary Risk', render: (a) => <Badge tone={a.primaryRisk === 'Service Quality' ? 'danger' : a.primaryRisk === 'Payment' ? 'warning' : a.primaryRisk === 'Price' ? 'info' : 'neutral'}>{a.primaryRisk}</Badge> },
    { key: 'action', header: 'Recommended Action', render: (a) => <span className="font-medium text-slate-700">{a.recommendedAction}</span> },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge kind="retention" value={a.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) => (
        <span className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/retention/${a.id}`) }}>
            Review
          </Button>
          {a.status === 'Pending' && (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); setApproveTarget(a) }}>
              Approve
            </Button>
          )}
        </span>
      ),
    },
  ]

  return (    <div>
      <PageHeader
        title="Retention Center"
        subtitle="Prioritize customers who need attention before renewal is at risk."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="High Risk" value={summary.highRisk} sub="At Risk + Critical" icon={AlertTriangle} tone="danger" />
        <StatCard label="Critical" value={summary.critical} sub="score below 40" icon={AlertTriangle} tone="danger" />
        <StatCard label="Revenue at Risk" value={formatINR(summary.revenue)} sub="potential exposure only" icon={IndianRupee} tone="warning" />
        <StatCard label="Actions Pending" value={summary.pending} sub="awaiting owner approval" icon={Clock} tone="brand" />
      </div>

      <Card className="mb-6" bodyClassName="p-4">
        <ol className="flex flex-wrap items-center gap-2 text-xs">
          {workflow.map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              <span
                className={
                  i === workflow.length - 1
                    ? 'rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700'
                    : 'rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600'
                }
              >
                {step}
              </span>
              {i < workflow.length - 1 && <span className="text-slate-300">→</span>}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-slate-400">
          The workflow combines business rules + customer data + AI assistance, with owner approval before any action or offer.
        </p>
      </Card>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs tabs={statusTabs} active={tab} onChange={setTab} className="border-0" />
            <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer..." className="w-full max-w-xs" />
          </div>
        </div>
        {loading ? (
          <TableSkeleton rows={8} columns={9} />
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            rowKey={(a) => a.id}
            onRowClick={(a) => navigate(`/retention/${a.id}`)}
            empty={
              <EmptyState
                title={retention.length === 0 ? 'Your Retention Center is ready' : 'No retention actions match'}
                description={retention.length === 0 ? 'No retention actions have been raised yet. Actions are created automatically when a service complaint, overdue invoice or expiring contract puts a renewal at risk.' : 'Try a different status or search term.'}
              />
            }
          />
        )}
        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <HeartHandshake className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-brand-500" />
          Revenue at Risk is potential exposure, not guaranteed loss. Actions depend on why the customer is at risk.
        </div>
      </div>

      <ApprovalModal
        action={approveTarget}
        customer={approveTarget ? customerMap.get(approveTarget.customerId) : undefined}
        open={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        onApprove={(action) => setRetentionStatus(action.id, 'Approved')}
      />
    </div>
  )
}
