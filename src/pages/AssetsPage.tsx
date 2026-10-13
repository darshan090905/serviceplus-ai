import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Cpu, Pencil, Trash2, ShieldCheck, Wrench } from 'lucide-react'
import type { EquipmentAsset } from '../types'
import { useAppStore } from '../store/AppStore'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { StatCard } from '../components/ui/StatCard'
import { SearchInput } from '../components/ui/SearchInput'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Pagination } from '../components/ui/Pagination'
import { Select } from '../components/ui/Field'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { TableSkeleton } from '../components/ui/Skeleton'
import { FilterBar } from '../components/ui/FilterBar'
import { AssetFormModal } from '../components/assets/AssetFormModal'
import { DeleteAssetModal } from '../components/assets/DeleteAssetModal'
import { useToast } from '../components/ui/Toast'
import { formatDate, daysUntil } from '../utils/dates'
import { useDebouncedValue, useLoading } from '../hooks/useDebounce'

const PER_PAGE = 10

export function AssetsPage() {
  const { assets, customers, amcs, services, complaints, deleteAsset } = useAppStore()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<EquipmentAsset | null>(null)
  const [deleting, setDeleting] = useState<EquipmentAsset | null>(null)
  const loading = useLoading(400)
  const debounced = useDebouncedValue(query)

  const customerNames = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers])
  const categories = useMemo(() => Array.from(new Set(assets.map((a) => a.category))).sort(), [assets])

  const usage = useMemo(() => {
    const map = new Map<string, { amcs: number; services: number; complaints: number }>()
    const bump = (id: string | null | undefined) => {
      if (!id) return
      const entry = map.get(id) ?? { amcs: 0, services: 0, complaints: 0 }
      entry.amcs += 1
      map.set(id, entry)
    }
    const bumpOne = (id: string | null | undefined, key: 'services' | 'complaints') => {
      if (!id) return
      const entry = map.get(id) ?? { amcs: 0, services: 0, complaints: 0 }
      entry[key] += 1
      map.set(id, entry)
    }
    amcs.forEach((a) => bump(a.assetId))
    services.forEach((s) => bumpOne(s.assetId, 'services'))
    complaints.forEach((c) => bumpOne(c.assetId, 'complaints'))
    return map
  }, [amcs, services, complaints])

  const kpis = useMemo(() => {
    const active = assets.filter((a) => a.status === 'Active')
    const inWarranty = active.filter((a) => a.warrantyUntil && daysUntil(a.warrantyUntil) >= 0)
    const expiringWarranty = active.filter((a) => {
      const days = a.warrantyUntil ? daysUntil(a.warrantyUntil) : null
      return days !== null && days >= 0 && days <= 60
    })
    const covered = new Set(assets.filter((a) => a.status === 'Active').map((a) => a.id))
    const contracts = amcs.filter((a) => a.assetId && covered.has(a.assetId) && a.status !== 'Expired' && a.status !== 'Renewed')
    return {
      total: active.length,
      retired: assets.length - active.length,
      inWarranty: inWarranty.length,
      expiringWarranty: expiringWarranty.length,
      // Machines on site with no live contract against them — the gap that
      // quietly costs money every quarter.
      uncovered: active.filter((a) => !contracts.some((c) => c.assetId === a.id)).length,
    }
  }, [assets, amcs])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return assets
      .filter((a) => {
        const customer = customerNames.get(a.customerId)
        if (q) {
          const haystack = [a.name, a.model, a.serialNo, a.capacity, a.locationNote, customer?.name]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(q)) return false
        }
        if (customerFilter && a.customerId !== customerFilter) return false
        if (categoryFilter && a.category !== categoryFilter) return false
        if (statusFilter && a.status !== statusFilter) return false
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [assets, debounced, customerFilter, categoryFilter, statusFilter, customerNames])

  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const applied = [debounced, customerFilter, categoryFilter, statusFilter].filter(Boolean).length
  const reset = () => {
    setQuery(''); setCustomerFilter(''); setCategoryFilter(''); setStatusFilter(''); setPage(1)
  }

  const openAdd = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (asset: EquipmentAsset) => { setEditing(asset); setModalOpen(true) }

  const remove = async (asset: EquipmentAsset) => {
    const ok = await deleteAsset(asset.id)
    setDeleting(null)
    if (ok) toast(`${asset.name} removed from the register.`, 'info')
    else toast(`Could not remove ${asset.name} — the database rejected the delete.`, 'error')
  }

  const columns: Array<Column<EquipmentAsset>> = [
    {
      key: 'name',
      header: 'Machine',
      render: (a) => (
        <div className="min-w-0">
          <span className="block truncate font-medium text-slate-900">{a.name}</span>
          <span className="block truncate text-xs text-slate-500">
            {[a.capacity, a.model].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (a) => (
        <button
          className="text-left font-medium text-slate-800 hover:text-brand-700"
          onClick={(e) => { e.stopPropagation(); navigate(`/customers/${a.customerId}`) }}
        >
          {customerNames.get(a.customerId)?.name ?? a.customerId}
        </button>
      ),
    },
    { key: 'category', header: 'Category', render: (a) => <Badge tone="info">{a.category}</Badge> },
    { key: 'serial', header: 'Serial', render: (a) => (a.serialNo ? <span className="text-slate-600">{a.serialNo}</span> : <span className="text-slate-300">—</span>) },
    {
      key: 'warranty',
      header: 'Warranty',
      render: (a) => {
        if (!a.warrantyUntil) return <span className="text-slate-300">—</span>
        const days = daysUntil(a.warrantyUntil)
        if (days < 0) return <span className="text-xs text-slate-400">Expired {formatDate(a.warrantyUntil)}</span>
        if (days <= 60) return <Badge tone="warning">{days}d left</Badge>
        return <span className="text-slate-600">{formatDate(a.warrantyUntil)}</span>
      },
    },
    {
      key: 'usage',
      header: 'Covered By',
      render: (a) => {
        const u = usage.get(a.id)
        if (!u || (u.amcs === 0 && u.services === 0)) return <span className="text-xs text-amber-600">No contract</span>
        return (
          <span className="text-xs text-slate-600">
            {u.amcs > 0 ? `${u.amcs} AMC${u.amcs === 1 ? '' : 's'}` : null}
            {u.amcs > 0 && u.services > 0 ? ' · ' : null}
            {u.services > 0 ? `${u.services} visit${u.services === 1 ? '' : 's'}` : null}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => <Badge tone={a.status === 'Active' ? 'success' : 'neutral'}>{a.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) => (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={(e) => { e.stopPropagation(); openEdit(a) }}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-slate-500 hover:text-red-600 hover:border-red-200"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={(e) => { e.stopPropagation(); setDeleting(a) }}
          >
            Remove
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Equipment Register"
        subtitle="Every machine on a customer's site, with the contract that covers it."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
            Add Machine
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Machines" value={kpis.total} sub={`${kpis.retired} retired`} icon={Cpu} tone="brand" />
        <StatCard
          label="Under Warranty"
          value={kpis.inWarranty}
          sub={kpis.expiringWarranty ? `${kpis.expiringWarranty} expiring within 60 days` : 'none expiring soon'}
          icon={ShieldCheck}
          tone="success"
          subTone={kpis.expiringWarranty ? 'negative' : 'default'}
        />
        <StatCard
          label="No Live Contract"
          value={kpis.uncovered}
          sub="machines with no active AMC"
          icon={Wrench}
          tone={kpis.uncovered > 0 ? 'warning' : 'default'}
          subTone={kpis.uncovered > 0 ? 'negative' : 'default'}
        />
        <StatCard label="Registered Customers" value={new Set(assets.map((a) => a.customerId)).size} sub="have machines on file" icon={Cpu} tone="default" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3">
            <SearchInput value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search machine, model, serial or customer..." className="max-w-md" />
            <FilterBar applied={applied} onReset={reset}>
              <Select value={customerFilter} onChange={(e) => { setCustomerFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Customers' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]} className="w-48" />
              <Select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Categories' }, ...categories.map((c) => ({ value: c, label: c }))]} className="w-44" />
              <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Status' }, { value: 'Active', label: 'Active' }, { value: 'Retired', label: 'Retired' }]} className="w-36" />
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
            empty={
              assets.length === 0 ? (
                <EmptyState
                  title="No machines registered yet"
                  description="Add the equipment on your customers' sites so contracts and visits can point at the exact unit."
                  action={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>Add the first machine</Button>}
                />
              ) : (
                <EmptyState title="No machines found" description="Try adjusting your filters." action={<Button variant="outline" size="sm" onClick={reset}>Clear Filters</Button>} />
              )
            }
          />
        )}
        {!loading && filtered.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={page} perPage={PER_PAGE} total={filtered.length} onChange={setPage} />
          </div>
        )}
      </div>

      <AssetFormModal open={modalOpen} onClose={() => setModalOpen(false)} asset={editing} />
      <DeleteAssetModal asset={deleting} onClose={() => setDeleting(null)} onConfirm={remove} />
    </div>
  )
}
