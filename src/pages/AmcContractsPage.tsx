import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Trash2, Pencil } from 'lucide-react'
import type { AMCContract } from '../types'
import { useAppStore } from '../store/AppStore'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { StatCard } from '../components/ui/StatCard'
import { SearchInput } from '../components/ui/SearchInput'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Pagination } from '../components/ui/Pagination'
import { Select } from '../components/ui/Field'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { TableSkeleton } from '../components/ui/Skeleton'
import { FilterBar } from '../components/ui/FilterBar'
import { AmcFormModal } from '../components/amc/AmcFormModal'
import { DeleteAmcModal } from '../components/amc/DeleteAmcModal'
import { formatDate, daysUntil } from '../utils/dates'
import { formatINR } from '../utils/format'
import { useDebouncedValue, useLoading } from '../hooks/useDebounce'

const PER_PAGE = 10
const statuses = ['Active', 'Expiring Soon', 'Renewal Pending', 'Renewed', 'Expired'] as const

export function AmcContractsPage() {
  const { amcs, customers } = useAppStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [expiryFilter, setExpiryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AMCContract | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AMCContract | null>(null)
  const loading = useLoading(400)
  const debounced = useDebouncedValue(query)

  const customerNames = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return amcs
      .filter((a) => {
        const customer = customerNames.get(a.customerId)
        if (q && !customer?.name.toLowerCase().includes(q) && !a.id.toLowerCase().includes(q)) return false
        if (statusFilter && a.status !== statusFilter) return false
        if (serviceFilter && a.serviceType !== serviceFilter) return false
        if (expiryFilter === '30' && daysUntil(a.endDate) > 30) return false
        return true
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
  }, [amcs, debounced, customerNames, statusFilter, serviceFilter, expiryFilter])

  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const applied = [query, statusFilter, serviceFilter, expiryFilter].filter(Boolean).length

  const reset = () => {
    setQuery('')
    setStatusFilter('')
    setServiceFilter('')
    setExpiryFilter('')
    setPage(1)
  }

  const kpis = useMemo(
    () => ({
      active: amcs.filter((a) => a.status === 'Active').length,
      expiring: amcs.filter((a) => a.status === 'Expiring Soon').length,
      pending: amcs.filter((a) => a.status === 'Renewal Pending').length,
      expired: amcs.filter((a) => a.status === 'Expired').length,
    }),
    [amcs],
  )

  const columns: Array<Column<AMCContract>> = [
    { key: 'id', header: 'AMC ID', render: (a) => <span className="font-medium text-slate-900">{a.id}</span> },
    {
      key: 'customer',
      header: 'Customer',
      render: (a) => {
        const customer = customerNames.get(a.customerId)
        return (
          <span className="font-medium text-slate-800">
            {customer?.name}
            <span className="block text-xs font-normal text-slate-400">{customer?.company}</span>
          </span>
        )
      },
    },
    { key: 'service', header: 'Service', render: (a) => <Badge tone="brand">{a.serviceType}</Badge> },
    { key: 'start', header: 'Start Date', render: (a) => formatDate(a.startDate) },
    { key: 'end', header: 'End Date', render: (a) => formatDate(a.endDate) },
    { key: 'amount', header: 'Amount', align: 'right', render: (a) => <span className="font-medium">{formatINR(a.amount)}</span> },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge kind="amc" value={a.status} /> },
    { key: 'renewal', header: 'Renewal', render: (a) => <Badge tone={a.renewalStatus === 'Done' ? 'success' : a.renewalStatus === 'Pending' || a.renewalStatus === 'Started' ? 'warning' : 'neutral'}>{a.renewalStatus}</Badge> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) => (
        <span className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/amc-contracts/${a.id}`) }}>
            View
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Edit contract ${a.id}`}
            title="Edit contract"
            onClick={(e) => { e.stopPropagation(); setEditTarget(a) }}
          >
            <Pencil className="h-4 w-4 text-slate-600" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Delete contract ${a.id}`}
            title="Delete contract"
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(a) }}
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="AMC Contracts"
        subtitle="Manage service contracts, expiry dates and renewals."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
            Add AMC
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active AMCs" value={kpis.active} icon={FileText} tone="success" />
        <StatCard label="Expiring Soon" value={kpis.expiring} sub="within 60 days" tone="warning" />
        <StatCard label="Renewal Pending" value={kpis.pending} sub="to be closed" tone="brand" />
        <StatCard label="Expired" value={kpis.expired} sub="past contracts" tone="default" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3">
            <SearchInput value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search AMC ID or customer..." className="max-w-md" />
            <FilterBar applied={applied} onReset={reset}>
              <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Status' }, ...statuses.map((s) => ({ value: s, label: s }))]} className="w-44" />
              <Select value={serviceFilter} onChange={(e) => { setServiceFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Services' }, ...['AC Service', 'Refrigeration', 'HVAC', 'Elevator', 'Generator', 'Water Purification'].map((s) => ({ value: s, label: s }))]} className="w-44" />
              <Select value={expiryFilter} onChange={(e) => { setExpiryFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'Expiry (any)' }, { value: '30', label: 'Within 30 days' }]} className="w-40" />
            </FilterBar>
          </div>
        </div>
        {loading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : (
          <DataTable
            columns={columns}
            data={pageRows}
            rowKey={(a) => a.id}
            onRowClick={(a) => navigate(`/amc-contracts/${a.id}`)}
            empty={<EmptyState title="No AMC contracts found" description="Try adjusting your filters." action={<Button variant="outline" size="sm" onClick={reset}>Clear Filters</Button>} />}
          />
        )}
        {!loading && filtered.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={page} perPage={PER_PAGE} total={filtered.length} onChange={setPage} />
          </div>
        )}
      </div>

      <AmcFormModal key="amc-new" open={modalOpen} onClose={() => setModalOpen(false)} />
      <AmcFormModal
        key={editTarget ? `amc-edit-${editTarget.id}` : 'amc-edit-none'}
        open={Boolean(editTarget)}
        amc={editTarget ?? undefined}
        onClose={() => setEditTarget(null)}
      />
      <DeleteAmcModal amc={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}