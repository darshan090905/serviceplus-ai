import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MapPin, Mail, Phone, Building2, ArrowLeft, User, Plus } from 'lucide-react'
import { useAppStore } from '../store/AppStore'
import { Card } from '../components/ui/Card'
import { Tabs } from '../components/ui/Tabs'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { DataTable, type Column } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { AssetFormModal } from '../components/assets/AssetFormModal'
import { DetailSkeleton } from '../components/ui/Skeleton'
import { HealthScoreCard } from '../components/customers/HealthScoreCard'
import { ScoreBreakdown } from '../components/customers/ScoreBreakdown'
import { RetentionRecommendation } from '../components/retention/RetentionRecommendation'
import { AIEmailGenerator } from '../components/retention/AIEmailGenerator'
import { useLoading } from '../hooks/useDebounce'
import { formatDate, formatShortDate, daysUntil } from '../utils/dates'
import { formatINR, formatINRExact } from '../utils/format'
import { toRupees } from '../utils/money'
import { GST_STATES, resolveStateCode } from '../utils/gst'
import { loadInvoices } from '../services/invoiceService'
import { Input, Select, Field } from '../components/ui/Field'
import { TableSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import type { AMCContract, Complaint, Customer, EquipmentAsset, Invoice, Payment, RetentionAction, ServiceRecord } from '../types'

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'amc', label: 'AMC' },
  { id: 'assets', label: 'Equipment' },
  { id: 'services', label: 'Services' },
  { id: 'complaints', label: 'Complaints' },
  { id: 'payments', label: 'Payments' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'comms', label: 'Communications' },
  { id: 'retention', label: 'Retention' },
]

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { customers, amcs, assets, services, complaints, payments, retention } = useAppStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [assetOpen, setAssetOpen] = useState(false)
  const loading = useLoading(400)

  const customer = customers.find((c) => c.id === id)
  const customerAmcs = amcs.filter((a) => a.customerId === id)
  const primaryAmc = customerAmcs.find((a) => a.status !== 'Renewed')
  const customerAssets = assets.filter((a) => a.customerId === id)
  const assetLabels = useMemo(() => new Map(assets.map((a) => [a.id, a.name])), [assets])
  const customerServices = services
    .filter((s) => s.customerId === id)
    .sort((a, b) => b.date.localeCompare(a.date))
  const customerComplaints = complaints
    .filter((c) => c.customerId === id)
    .sort((a, b) => b.created.localeCompare(a.created))
  const customerPayments = payments.filter((p) => p.customerId === id)
  const action = retention.find((r) => r.customerId === id)

  const overview = useMemo(() => {
    const completed = customerServices.filter((s) => s.status === 'Completed')
    const rated = completed.filter((s) => s.rating !== null)
    const avgRating = rated.length ? (rated.reduce((sum, s) => sum + (s.rating ?? 0), 0) / rated.length).toFixed(1) : '—'
    const openComplaints = customerComplaints.filter((c) => c.status === 'Open' || c.status === 'In Progress').length
    const totalBilled = customerPayments.reduce((sum, p) => sum + p.amount, 0)
    const paid = customerPayments.filter((p) => p.status === 'Paid').reduce((sum, p) => sum + p.amount, 0)
    const pending = customerPayments.filter((p) => p.status === 'Pending' || p.status === 'Partially Paid').reduce((sum, p) => sum + p.amount, 0)
    const overdue = customerPayments.filter((p) => p.status === 'Overdue').reduce((sum, p) => sum + p.amount, 0)
    return { completed: completed.length, avgRating, openComplaints, totalBilled, paid, pending, overdue }
  }, [customerServices, customerComplaints, customerPayments])

  const timeline = useMemo(() => {
    const events: Array<{ date: string; label: string; detail: string; tone: string }> = []
    customerServices
      .filter((s) => s.status === 'Completed')
      .forEach((s) => events.push({ date: s.date, label: 'Service completed', detail: s.serviceType, tone: 'bg-emerald-50 text-emerald-600' }))
    customerComplaints.forEach((c) =>
      events.push({
        date: c.created,
        label: c.status === 'Resolved' || c.status === 'Closed' ? 'Complaint resolved' : 'Complaint opened',
        detail: `${c.id} · ${c.category}`,
        tone: 'bg-red-50 text-red-600',
      }),
    )
    customerPayments
      .filter((p) => p.paidDate)
      .forEach((p) => events.push({ date: p.paidDate!, label: 'Payment received', detail: p.invoice, tone: 'bg-emerald-50 text-emerald-600' }))
    return events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
  }, [customerServices, customerComplaints, customerPayments])

  if (loading) {
    return (
      <div>
        <Link to="/customers" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> All customers
        </Link>
        <DetailSkeleton />
      </div>
    )
  }

  if (!customer) {
    return (
      <div>
        <Link to="/customers" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> All customers
        </Link>
        <Card className="flex justify-center p-10">
          <EmptyState title="Customer not found" description="This customer may have been removed. Go back to the customer list." />
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> All customers
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Avatar name={customer.name} size="xl" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
                <Badge tone={customer.type === 'Business' ? 'brand' : 'neutral'}>
                  {customer.type === 'Business' ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
                  {customer.type}
                </Badge>
              </div>
              {customer.company !== customer.name && <p className="text-sm text-slate-500">{customer.company}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {customer.email}</span>
                <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {customer.phone}</span>
                <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {customer.city}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge kind="risk" value={customer.health.level} />
                {customer.serviceTypes.map((s) => <Badge key={s} tone="brand">{s}</Badge>)}
                {primaryAmc && (
                  <Badge tone={daysUntil(primaryAmc.endDate) <= 30 ? 'warning' : 'success'}>
                    AMC {daysUntil(primaryAmc.endDate) > 0 ? `expires in ${daysUntil(primaryAmc.endDate)} days` : 'expired'}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="text-slate-400">Customer since</p>
            <p className="font-medium text-slate-800">{formatDate(customer.joined)}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <HealthScoreCard health={customer.health} />
          <Card title="Health Score Breakdown" description="How the score was calculated">
            <ScoreBreakdown health={customer.health} />
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-2">
          {action && <RetentionRecommendation customer={customer} action={action} amc={primaryAmc} />}

          <div className="grid gap-4 sm:grid-cols-3">
            <Card title="AMC">
              {primaryAmc ? (
                <div className="space-y-1.5 text-sm">
                  <p className="flex justify-between"><span className="text-slate-500">Service</span><span className="font-medium">{primaryAmc.serviceType}</span></p>
                  <p className="flex justify-between"><span className="text-slate-500">Start</span><span>{formatDate(primaryAmc.startDate)}</span></p>
                  <p className="flex justify-between"><span className="text-slate-500">End</span><span>{formatDate(primaryAmc.endDate)}</span></p>
                  <p className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-semibold">{formatINR(primaryAmc.amount)}</span></p>
                  <p className="flex justify-between"><span className="text-slate-500">Status</span><StatusBadge kind="amc" value={primaryAmc.status} /></p>
                  <Link to={`/amc-contracts/${primaryAmc.id}`} className="mt-2 inline-block text-xs font-medium text-brand-600 hover:text-brand-700">
                    View contract →
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-slate-400">No active AMC.</p>
              )}
            </Card>
            <Card title="Service Performance">
              <div className="space-y-1.5 text-sm">
                <p className="flex justify-between"><span className="text-slate-500">Completed</span><span className="font-medium">{overview.completed}</span></p>
                <p className="flex justify-between"><span className="text-slate-500">Avg rating</span><span className="font-medium">{overview.avgRating}{overview.avgRating !== '—' ? ' / 5' : ''}</span></p>
                <p className="flex justify-between"><span className="text-slate-500">Open complaints</span><span className="font-medium">{overview.openComplaints}</span></p>
              </div>
            </Card>
            <Card title="Payment Health">
              <div className="space-y-1.5 text-sm">
                <p className="flex justify-between"><span className="text-slate-500">Total billed</span><span className="font-medium">{formatINR(overview.totalBilled)}</span></p>
                <p className="flex justify-between"><span className="text-emerald-600">Paid</span><span className="font-medium">{formatINR(overview.paid)}</span></p>
                <p className="flex justify-between"><span className="text-amber-600">Pending</span><span className="font-medium">{formatINR(overview.pending)}</span></p>
                <p className="flex justify-between"><span className="text-red-600">Overdue</span><span className="font-medium">{formatINR(overview.overdue)}</span></p>
              </div>
            </Card>
          </div>

          <Card title="Timeline" description="Recent interactions">
            {timeline.length === 0 ? (
              <p className="text-sm text-slate-400">No recent activity.</p>
            ) : (
              <ol className="space-y-3">
                {timeline.map((event, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${event.tone}`}>{formatShortDate(event.date)}</span>
                    <div>
                      <p className="font-medium text-slate-800">{event.label}</p>
                      <p className="text-xs text-slate-500">{event.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <AssetFormModal open={assetOpen} onClose={() => setAssetOpen(false)} customerId={customer.id} />

      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="px-5 pt-4">
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
        </div>
        <div className="p-5">
          {tab === 'overview' && <OverviewContent customer={customer} primaryAmc={primaryAmc} />}
          {tab === 'amc' && <AmcTab amcs={customerAmcs} assetLabels={assetLabels} />}
          {tab === 'assets' && (
            <AssetsTab
              assets={customerAssets}
              amcs={customerAmcs}
              services={customerServices}
              complaints={customerComplaints}
              onAdd={() => setAssetOpen(true)}
            />
          )}
          {tab === 'services' && <ServicesTab services={customerServices} />}
          {tab === 'complaints' && <ComplaintsTab complaints={customerComplaints} />}
          {tab === 'payments' && <PaymentsTab payments={customerPayments} />}
          {tab === 'invoices' && (
            <>
              <TaxIdentityCard customer={customer} />
              <InvoicesTab customerId={customer.id} />
            </>
          )}
          {tab === 'comms' && <CommsTab customerId={customer.id} customerName={customer.name} />}
          {tab === 'retention' && <RetentionTab action={action} customer={customer} onGoRetention={() => navigate('/retention')} />}
        </div>
      </div>
    </div>
  )
}

function OverviewContent({ customer, primaryAmc }: { customer: Customer; primaryAmc?: AMCContract }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Account Information">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Company</dt><dd className="font-medium">{customer.company}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Type</dt><dd className="font-medium">{customer.type}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Services</dt><dd className="flex flex-wrap justify-end gap-1">{customer.serviceTypes.map((s) => <Badge key={s} tone="brand">{s}</Badge>)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">City</dt><dd className="font-medium">{customer.city}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Address</dt><dd className="max-w-[60%] text-right">{customer.address}</dd></div>
        </dl>
      </Card>
      <Card title="Contract Summary">
        {primaryAmc ? (
          <>
            <div className="rounded-lg border border-slate-200 p-4 text-sm">
              <p className="flex justify-between"><span className="text-slate-500">Contract</span><span className="font-medium">{primaryAmc.id}</span></p>
              <p className="mt-1.5 flex justify-between"><span className="text-slate-500">Period</span><span>{formatDate(primaryAmc.startDate)} → {formatDate(primaryAmc.endDate)}</span></p>
              <p className="mt-1.5 flex justify-between"><span className="text-slate-500">Value</span><span className="font-semibold">{formatINR(primaryAmc.amount)}</span></p>
              <p className="mt-1.5 flex justify-between"><span className="text-slate-500">Renewal status</span><StatusBadge kind="amc" value={primaryAmc.status} /></p>
            </div>
            <p className="mt-2 text-xs text-slate-400">Renewal revenue exposure for this contract: {formatINR(primaryAmc.amount)}</p>
          </>
        ) : (
          <p className="text-sm text-slate-400">No contract on record.</p>
        )}
      </Card>
    </div>
  )
}

function AssetsTab({
  assets,
  amcs,
  services,
  complaints,
  onAdd,
}: {
  assets: EquipmentAsset[]
  amcs: AMCContract[]
  services: ServiceRecord[]
  complaints: Complaint[]
  onAdd: () => void
}) {
  const visitCount = (id: string) => services.filter((s) => s.assetId === id).length
  const openComplaints = (id: string) => complaints.filter((c) => c.assetId === id && c.status !== 'Resolved').length

  const columns: Array<Column<EquipmentAsset>> = [
    {
      key: 'name',
      header: 'Machine',
      render: (a) => (
        <div className="min-w-0">
          <span className="block truncate font-medium text-slate-900">{a.name}</span>
          <span className="block truncate text-xs text-slate-500">{[a.capacity, a.model, a.serialNo].filter(Boolean).join(' · ') || '—'}</span>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (a) => <Badge tone="info">{a.category}</Badge> },
    { key: 'location', header: 'Location', render: (a) => (a.locationNote ? <span className="text-slate-600">{a.locationNote}</span> : <span className="text-slate-300">—</span>) },
    {
      key: 'warranty',
      header: 'Warranty',
      render: (a) => {
        if (!a.warrantyUntil) return <span className="text-slate-300">—</span>
        const days = daysUntil(a.warrantyUntil)
        if (days < 0) return <span className="text-xs text-slate-400">Expired</span>
        if (days <= 60) return <Badge tone="warning">{days}d left</Badge>
        return <span className="text-slate-600">{formatDate(a.warrantyUntil)}</span>
      },
    },
    {
      key: 'amc',
      header: 'Contract',
      render: (a) => {
        const linked = amcs.find((c) => c.assetId === a.id)
        if (linked) return <Badge tone={linked.status === 'Active' ? 'success' : 'warning'}>{linked.status}</Badge>
        return <span className="text-xs text-amber-600">No contract</span>
      },
    },
    { key: 'visits', header: 'Visits', align: 'right', render: (a) => <span className="text-slate-600">{visitCount(a.id)}</span> },
    {
      key: 'open',
      header: 'Open Complaints',
      align: 'right',
      render: (a) => {
        const n = openComplaints(a.id)
        return n === 0 ? <span className="text-slate-300">0</span> : <Badge tone="danger">{n}</Badge>
      },
    },
    { key: 'status', header: 'Status', render: (a) => <Badge tone={a.status === 'Active' ? 'success' : 'neutral'}>{a.status}</Badge> },
  ]

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={assets}
        rowKey={(a) => a.id}
        empty={
          <EmptyState
            title="No machines on file"
            description="Add the equipment at this site so contracts and visits can point at the exact unit."
            action={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>Add the first machine</Button>}
          />
        }
      />
      {assets.length > 0 && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>
            Add Machine
          </Button>
        </div>
      )}
    </div>
  )
}

function AmcTab({ amcs, assetLabels }: { amcs: AMCContract[]; assetLabels: Map<string, string> }) {
  const columns: Array<Column<AMCContract>> = [
    { key: 'id', header: 'AMC ID', render: (a) => <span className="font-medium text-slate-900">{a.id}</span> },
    { key: 'service', header: 'Service', render: (a) => <Badge tone="brand">{a.serviceType}</Badge> },
    { key: 'start', header: 'Start Date', render: (a) => formatDate(a.startDate) },
    { key: 'end', header: 'End Date', render: (a) => formatDate(a.endDate) },
    { key: 'amount', header: 'Amount', align: 'right', render: (a) => <span className="font-medium">{formatINR(a.amount)}</span> },
    {
      key: 'machine',
      header: 'Machine',
      render: (a) => (a.assetId ? <span className="text-slate-600">{assetLabels.get(a.assetId) ?? a.assetId}</span> : <span className="text-slate-300">Site-wide</span>),
    },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge kind="amc" value={a.status} /> },
    { key: 'renewal', header: 'Renewal', render: (a) => <Badge tone={a.renewalStatus === 'Done' ? 'success' : a.renewalStatus === 'Pending' || a.renewalStatus === 'Started' ? 'warning' : 'neutral'}>{a.renewalStatus}</Badge> },
  ]
  return <DataTable columns={columns} data={amcs} rowKey={(a) => a.id} />
}

function ServicesTab({ services }: { services: ServiceRecord[] }) {
  const columns: Array<Column<ServiceRecord>> = [
    { key: 'date', header: 'Date', render: (s) => formatDate(s.date) },
    { key: 'service', header: 'Service', render: (s) => s.serviceType },
    { key: 'technician', header: 'Technician', render: (s) => s.technician },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge kind="service" value={s.status} /> },
    { key: 'rating', header: 'Rating', render: (s) => (s.rating ? <Badge tone="success">{s.rating} / 5</Badge> : <span className="text-slate-300">—</span>) },
  ]
  return <DataTable columns={columns} data={services} rowKey={(s) => s.id} />
}

function ComplaintsTab({ complaints }: { complaints: Complaint[] }) {
  const columns: Array<Column<Complaint>> = [
    { key: 'id', header: 'Complaint', render: (c) => <span className="font-medium text-slate-900">{c.id}</span> },
    { key: 'category', header: 'Category', render: (c) => c.category },
    { key: 'severity', header: 'Severity', render: (c) => <Badge tone={c.severity === 'High' || c.severity === 'Critical' ? 'danger' : 'neutral'}>{c.severity}</Badge> },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge kind="complaint" value={c.status} /> },
    { key: 'created', header: 'Created', render: (c) => formatDate(c.created) },
  ]
  return <DataTable columns={columns} data={complaints} rowKey={(c) => c.id} />
}

function PaymentsTab({ payments }: { payments: Payment[] }) {
  const columns: Array<Column<Payment>> = [
    { key: 'invoice', header: 'Invoice', render: (p) => <span className="font-medium text-slate-900">{p.invoice}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => <span className="font-medium">{formatINR(p.amount)}</span> },
    { key: 'due', header: 'Due Date', render: (p) => formatDate(p.dueDate) },
    { key: 'paid', header: 'Paid Date', render: (p) => (p.paidDate ? formatDate(p.paidDate) : <span className="text-slate-300">—</span>) },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge kind="payment" value={p.status} /> },
    { key: 'method', header: 'Method', render: (p) => p.method },
  ]
  return <DataTable columns={columns} data={payments} rowKey={(p) => p.id} />
}

function RetentionTab({ action, customer, onGoRetention }: { action?: RetentionAction; customer: Customer; onGoRetention: () => void }) {
  if (!action) {
    return <EmptyState title="No retention action" description="This customer does not currently have a recommended retention action." /> as JSX.Element
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <div><p className="text-slate-400">Primary Risk</p><p className="font-semibold">{action.primaryRisk}</p></div>
        <div><p className="text-slate-400">Recommended Action</p><p className="font-semibold">{action.recommendedAction}</p></div>
        <div><p className="text-slate-400">Revenue at Risk</p><p className="font-semibold">₹{action.revenueAtRisk.toLocaleString('en-IN')}</p></div>
        <div><p className="text-slate-400">Status</p><StatusBadge kind="retention" value={action.status} /></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Why</p>
          <p className="mt-1 text-sm text-slate-600">{action.reason}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Steps</p>
          <ul className="mt-1 space-y-1 text-sm text-slate-600">
            {action.steps.map((step: string) => <li key={step}>• {step}</li>)}
          </ul>
        </div>
      </div>
      <AIEmailGenerator action={action} customer={customer} />
      <div>
        <Button variant="outline" onClick={onGoRetention}>Open Retention Center</Button>
      </div>
    </div>
  )
}

/**
 * The customer's GST registration and state.
 *
 * Editable here rather than buried in a settings screen because the two are only
 * ever needed at the moment an invoice is raised, and the person raising it is
 * looking at the customer. A missing GSTIN is a legitimate state for a B2C
 * customer, so the field is optional and says so rather than looking unfinished.
 */
function TaxIdentityCard({ customer }: { customer: Customer }) {
  const { updateCustomer } = useAppStore()
  const { toast } = useToast()
  const [gstin, setGstin] = useState(customer.gstin ?? '')
  // Resolved on read as well as written: this column has been written as both a
  // name and a code, and the select needs a code to match an option against or
  // it renders as blank while the record is perfectly fine.
  const [state, setState] = useState(resolveStateCode(customer.state))

  const save = () => {
    // Validated here as well as by the database, because a rejected write is a
    // worse experience than a message saying what is wrong with the number.
    const trimmed = gstin.trim().toUpperCase()
    if (trimmed && !/^[0-9]{2}[A-Z0-9]{10}Z[0-9A-Z]$/.test(trimmed)) {
      toast('A GSTIN is 15 characters: 2 state digits, 10 letters or digits, then Z and a check character.', 'error')
      return
    }
    updateCustomer(customer.id, { gstin: trimmed || null, state: resolveStateCode(state) || null })
    toast('Tax details saved.')
  }

  return (
    <Card title="Tax details" description="Used when an invoice is raised. GSTIN is optional — a customer without one is billed as B2C.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="GSTIN">
          <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27AAAAA0000A1Z5" maxLength={15} />
        </Field>
        <Field label="GST state" hint="Decides whether the invoice carries CGST + SGST or IGST.">
          <Select
            value={state}
            onChange={(e) => setState(e.target.value)}
            options={[{ value: '', label: 'Not stated' }, ...GST_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))]}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Button onClick={save}>Save tax details</Button>
      </div>
    </Card>
  )
}

function InvoicesTab({ customerId }: { customerId: string }) {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadInvoices(customerId).then((rows) => {
      setInvoices(rows)
      setLoading(false)
    })
  }, [customerId])

  if (loading) return <TableSkeleton rows={3} columns={5} />
  if (!invoices.length) {
    return (
      <EmptyState
        title="No invoices raised"
        description="Raise one from a payment, or from a completed visit's parts."
      />
    )
  }

  const columns: Array<Column<Invoice>> = [
    {
      key: 'number',
      header: 'Invoice',
      render: (i) => (
        <button className="font-medium text-brand-700 hover:underline" onClick={() => navigate(`/invoices/${i.id}`)}>{i.number}</button>
      ),
    },
    { key: 'issued', header: 'Issued', render: (i) => formatDate(i.issuedOn) },
    { key: 'tax', header: 'Tax', render: (i) => <Badge tone={i.interState ? 'info' : 'brand'}>{i.interState ? 'IGST' : 'CGST + SGST'}</Badge> },
    { key: 'total', header: 'Total', align: 'right', render: (i) => <span className="font-semibold">{formatINRExact(toRupees(i.totalPaise))}</span> },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (i) => {
        const due = i.totalPaise - i.amountPaidPaise
        return due > 0 ? <span className="font-medium text-amber-700">{formatINRExact(toRupees(due))}</span> : <Badge tone="success">Paid</Badge>
      },
    },
  ]
  return <DataTable columns={columns} data={invoices} rowKey={(i) => i.id} />
}

/**
 * Everything that has been said to this customer.
 *
 * Emails are attributed to a customer by the backfill in migration 004, and
 * calls are not attributable at all — they carry only a display name, and
 * several technicians share one. Rather than guess, unattributed items are
 * counted and the gap is stated. A history that confidently files a call under
 * the wrong account is worse than one that admits it does not know.
 */
function CommsTab({ customerId, customerName }: { customerId: string; customerName: string }) {
  const { emails, calls, complaints } = useAppStore()

  // Migration 004 adds customer_id to both outbox tables and backfills the
  // emails by matching the recipient address. Calls are left null on purpose,
  // so before the migration this tab is empty rather than wrong, and after it
  // the email list is attributed while the call gap is stated below.
  const attributed = emails.filter((e) => e.customerId === customerId)
  const attributedCalls = calls.filter((c) => c.customerId === customerId)
  const unlinkedCalls = calls.filter((c) => !c.customerId).length

  const items: Array<{ id: string; kind: 'Email' | 'Call'; when: string; summary: string; detail: string }> = [
    ...attributed.map((e) => ({ id: e.id, kind: 'Email' as const, when: e.sentAt, summary: e.subject, detail: e.body })),
    ...attributedCalls.map((c) => ({ id: c.id, kind: 'Call' as const, when: c.createdAt, summary: `Call to ${c.toName}`, detail: c.message })),
  ].sort((a, b) => (a.when < b.when ? 1 : -1))
  const relatedComplaints = complaints.filter((c) => c.customerId === customerId).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div><p className="text-xs text-slate-400">Emails</p><p className="text-lg font-semibold text-slate-900">{attributed.length}</p></div>
        <div><p className="text-xs text-slate-400">Calls</p><p className="text-lg font-semibold text-slate-900">{attributedCalls.length}</p></div>
        <div><p className="text-xs text-slate-400">Complaints</p><p className="text-lg font-semibold text-slate-900">{relatedComplaints}</p></div>
        <div><p className="text-xs text-slate-400">Complaint-linked</p><p className="text-lg font-semibold text-slate-900">{items.filter((i) => i.kind === 'Call').length}</p></div>
      </div>

      {unlinkedCalls > 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {unlinkedCalls} call{unlinkedCalls > 1 ? 's' : ''} cannot be attributed to {customerName}. A call
          record carries only a display name, and several technicians share one, so migration 004
          leaves them unattributed rather than guessing.
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState title="Nothing recorded yet" description="Emails and calls sent to this customer will appear here." />
      ) : (
        <ol className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <Badge tone={i.kind === 'Email' ? 'info' : 'neutral'}>{i.kind}</Badge>
                <span className="text-xs text-slate-400">{formatDate(i.when)}</span>
                <span className="text-sm font-medium text-slate-800">{i.summary}</span>
              </div>
              {i.detail && <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-xs text-slate-500">{i.detail}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
