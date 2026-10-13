import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Users } from 'lucide-react'
import type { Customer } from '../types'
import { useAppStore } from '../store/AppStore'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { StatCard } from '../components/ui/StatCard'
import { SearchInput } from '../components/ui/SearchInput'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Pagination } from '../components/ui/Pagination'
import { Select } from '../components/ui/Field'
import { Avatar } from '../components/ui/Avatar'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { TableSkeleton } from '../components/ui/Skeleton'
import { FilterBar } from '../components/ui/FilterBar'
import { CustomerFormModal } from '../components/customers/CustomerFormModal'
import { HealthRing } from '../components/customers/HealthRing'
import { formatDate, daysUntil } from '../utils/dates'
import { useDebouncedValue, useLoading } from '../hooks/useDebounce'

const PER_PAGE = 10

export function CustomersPage() {
  const { customers, amcs, services, deleteCustomer } = useAppStore()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [amcFilter, setAmcFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [removing, setRemoving] = useState<Customer | null>(null)
  const loading = useLoading(450)
  const debouncedQuery = useDebouncedValue(query)

  const doRemove = () => {
    if (!removing) return
    void deleteCustomer(removing.id)
    toast(`${removing.name} was removed (customer profile and tied records deleted).`)
    setRemoving(null)
  }

  const enrichment = useMemo(() => {
    const map = new Map<string, { amcStatus?: string; expiry?: string; days?: number; lastService?: string; company: string; name: string }>()
    customers.forEach((c) => {
      const amc = amcs.find((a) => a.customerId === c.id && a.status !== 'Renewed')
      const lastSvc = services
        .filter((s) => s.customerId === c.id && s.status === 'Completed')
        .sort((a, b) => b.date.localeCompare(a.date))[0]
      map.set(c.id, {
        amcStatus: amc?.status,
        expiry: amc?.endDate,
        days: amc ? daysUntil(amc.endDate) : undefined,
        lastService: lastSvc?.date,
        company: c.company,
        name: c.name,
      })
    })
    return map
  }, [customers, amcs, services])

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    const list = customers.filter((c) => {
      const info = enrichment.get(c.id)
      if (q && !c.name.toLowerCase().includes(q) && !c.company.toLowerCase().includes(q)) return false
      if (typeFilter && c.type !== typeFilter) return false
      if (serviceFilter && !c.serviceTypes.includes(serviceFilter as Customer['serviceTypes'][number])) return false
      if (riskFilter && c.health.level !== riskFilter) return false
      if (amcFilter && info?.amcStatus !== amcFilter) return false
      return true
    })
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'health':
          return b.health.score - a.health.score
        case 'expiry': {
          const da = enrichment.get(a.id)?.days ?? Infinity
          const db = enrichment.get(b.id)?.days ?? Infinity
          return da - db
        }
        default:
          return a.name.localeCompare(b.name)
      }
    })
  }, [customers, enrichment, debouncedQuery, typeFilter, serviceFilter, riskFilter, amcFilter, sortBy])

  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const applied = [typeFilter, serviceFilter, riskFilter, amcFilter, debouncedQuery].filter(Boolean).length

  const resetFilters = () => {
    setTypeFilter('')
    setServiceFilter('')
    setRiskFilter('')
    setAmcFilter('')
    setQuery('')
    setPage(1)
  }

  const totals = useMemo(
    () => ({
      total: customers.length,
      healthy: customers.filter((c) => c.health.level === 'Healthy').length,
      atRisk: customers.filter((c) => c.health.level === 'At Risk').length,
      critical: customers.filter((c) => c.health.level === 'Critical').length,
    }),
    [customers],
  )

  const columns: Array<Column<Customer>> = [
    {
      key: 'customer',
      header: 'Customer',
      render: (c) => (
        <span className="flex items-center gap-3">
          <Avatar name={c.name} size="sm" />
          <span>
            <span className="block font-medium text-slate-900">{c.name}</span>
            <span className="block text-xs text-slate-400">{c.type === 'Business' ? c.company : 'Individual'}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (c) => (
        <span>
          <span className="block text-slate-600">{c.email}</span>
          <span className="block text-xs text-slate-400">{c.phone}</span>
        </span>
      ),
    },
    { key: 'service', header: 'Services', render: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.serviceTypes.slice(0, 2).map((s) => <Badge key={s} tone="brand">{s}</Badge>)}
          {c.serviceTypes.length > 2 && <Badge tone="neutral">+{c.serviceTypes.length - 2}</Badge>}
        </span>
      ) },
    {
      key: 'amc',
      header: 'AMC Status',
      render: (c) => {
        const status = enrichment.get(c.id)?.amcStatus as Customer['health']['level'] | undefined
        if (!status) return <span className="text-slate-300">—</span>
        return <StatusBadge kind="amc" value={status as never} />
      },
    },
    {
      key: 'expiry',
      header: 'AMC Expiry',
      render: (c) => {
        const expiry = enrichment.get(c.id)?.expiry
        if (!expiry) return <span className="text-slate-300">—</span>
        return (
          <span>
            <span className="block text-slate-600">{formatDate(expiry)}</span>
            <span className="block text-xs text-slate-400">{enrichment.get(c.id)?.days} days left</span>
          </span>
        )
      },
    },
    {
      key: 'health',
      header: 'Health',
      render: (c) => (
        <span className="flex items-center gap-1.5">
          <HealthRing score={c.health.score} level={c.health.level} size={30} showLabel={false} />
          <span className="font-semibold text-slate-800">{c.health.score}</span>
        </span>
      ),
    },
    { key: 'risk', header: 'Risk', render: (c) => <StatusBadge kind="risk" value={c.health.level} /> },
    {
      key: 'lastService',
      header: 'Last Service',
      render: (c) => {
        const date = enrichment.get(c.id)?.lastService
        return <span className="text-slate-600">{date ? formatDate(date) : '—'}</span>
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <span className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/customers/${c.id}`) }}>
            View
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:bg-red-50"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={(e) => { e.stopPropagation(); setRemoving(c) }}
          >
            Remove
          </Button>
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Manage customer relationships and understand account health."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
            Add Customer
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Customers" value={totals.total} icon={Users} tone="brand" />
        <StatCard label="Healthy" value={totals.healthy} sub="80–100 score" tone="success" />
        <StatCard label="At Risk" value={totals.atRisk} sub="40–59 score" tone="danger" />
        <StatCard label="Critical" value={totals.critical} sub="0–39 score" tone="danger" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3">
            <SearchInput
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
              placeholder="Search by customer or company..."
              className="max-w-md"
            />
            <FilterBar applied={applied} onReset={resetFilters}>
              <Select aria-label="Type" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Types' }, { value: 'Business', label: 'Business' }, { value: 'Individual', label: 'Individual' }]} className="w-40" />
              <Select aria-label="Service" value={serviceFilter} onChange={(e) => { setServiceFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Services' }, ...['AC Service', 'Refrigeration', 'HVAC', 'Elevator', 'Generator', 'Water Purification'].map((s) => ({ value: s, label: s }))]} className="w-44" />
              <Select aria-label="Risk" value={riskFilter} onChange={(e) => { setRiskFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Risk' }, { value: 'Healthy', label: 'Healthy' }, { value: 'Watch', label: 'Watch' }, { value: 'At Risk', label: 'At Risk' }, { value: 'Critical', label: 'Critical' }]} className="w-36" />
              <Select aria-label="AMC status" value={amcFilter} onChange={(e) => { setAmcFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All AMC Status' }, { value: 'Active', label: 'Active' }, { value: 'Expiring Soon', label: 'Expiring Soon' }, { value: 'Expired', label: 'Expired' }]} className="w-44" />
              <div className="flex items-center gap-1.5 text-sm">
                <label htmlFor="sort" className="text-xs font-medium text-slate-500">Sort</label>
                <Select id="sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} options={[{ value: 'name', label: 'Name' }, { value: 'health', label: 'Health score' }, { value: 'expiry', label: 'AMC expiry' }]} className="w-36" />
              </div>
            </FilterBar>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={8} columns={8} />
        ) : (
          <DataTable
            columns={columns}
            data={pageRows}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/customers/${c.id}`)}
            empty={
              <EmptyState
                title="No customers found"
                description="There are no customers matching your current filters."
                action={<Button variant="outline" size="sm" onClick={resetFilters}>Clear Filters</Button>}
              />
            }
          />
        )}

        {!loading && filtered.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={page} perPage={PER_PAGE} total={filtered.length} onChange={setPage} />
          </div>
        )}
      </div>

      <CustomerFormModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        description="This permanently deletes the customer, their AMC contracts, services, complaints, payments, retention actions and sign-in account. This cannot be undone."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={doRemove}>Remove permanently</Button>
          </div>
        }
      >
        <p className="text-sm text-slate-500">
          Deleting <span className="font-medium text-slate-700">{removing?.name}</span> will also remove any linked sign-in account, so the customer will no longer be able to access the portal.
        </p>
      </Modal>
    </div>
  )
}