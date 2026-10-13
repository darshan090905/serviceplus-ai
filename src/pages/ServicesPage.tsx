import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Wrench, Star, UserCheck, Briefcase, Clock } from 'lucide-react'
import type { ServiceRecord } from '../types'
import { useAppStore } from '../store/AppStore'
import { findTechnician, technicianKey } from '../utils/technicians'
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
import { ServiceFormModal } from '../components/services/ServiceFormModal'
import { formatDate } from '../utils/dates'
import { formatDuration, serviceDurationMin, complaintWorkMin } from '../utils/geo'
import { useDebouncedValue, useLoading } from '../hooks/useDebounce'

const PER_PAGE = 10
const SERVICE_FILTERS = ['AC Service', 'Refrigeration', 'HVAC', 'Elevator', 'Generator', 'Water Purification']

interface TechRow {
  id: string
  name: string
  email?: string
  city?: string
  status: string
  services: number
  completed: number
  complaints: number
  resolved: number
  avg: number | null
  avgTimeMin: number | null
  totalServiceMin: number | null
}

type Tab = 'techs' | 'visits'

export function ServicesPage() {
  const { services, customers, complaints, accounts, assets } = useAppStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('techs')
  const [query, setQuery] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [technicianFilter, setTechnicianFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const loading = useLoading(400)
  const debounced = useDebouncedValue(query)

  const customerNames = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers])

  const kpis = useMemo(() => {
    const thisMonth = services.filter((s) => s.date.startsWith(new Date().toISOString().slice(0, 7)))
    const completed = services.filter((s) => s.status === 'Completed')
    const rated = completed.filter((s) => s.rating !== null)
    const avg = rated.length ? (rated.reduce((sum, s) => sum + (s.rating ?? 0), 0) / rated.length) : 0
    return {
      month: thisMonth.length,
      completed: completed.length,
      pending: services.filter((s) => s.status === 'Scheduled' || s.status === 'In Progress').length,
      // No ratings yet must read as "—", never as a fabricated 0.0.
      avg: rated.length ? avg.toFixed(1) : '—',
      unrated: completed.length - rated.length,
    }
  }, [services])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return services
      .filter((s) => {
        const customer = customerNames.get(s.customerId)
        if (q && !customer?.name.toLowerCase().includes(q) && !s.technician.toLowerCase().includes(q)) return false
        if (serviceFilter && s.serviceType !== serviceFilter) return false
        if (technicianFilter && s.technician !== technicianFilter) return false
        if (statusFilter && s.status !== statusFilter) return false
        return true
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [services, debounced, customerNames, serviceFilter, technicianFilter, statusFilter])

  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const applied = [debounced, serviceFilter, technicianFilter, statusFilter].filter(Boolean).length

  const reset = () => {
    setQuery('')
    setServiceFilter('')
    setTechnicianFilter('')
    setStatusFilter('')
    setPage(1)
  }

  const technicians = useMemo(() => [...new Set(services.map((s) => s.technician))], [services])

  const techRows = useMemo<TechRow[]>(() => {
    const known = new Map<string, { name: string; status: string; email?: string; city?: string }>()
    for (const a of accounts.filter((x) => x.role === 'technician')) {
      const key = technicianKey(a.technicianId ?? a.name)
      if (!key) continue
      const existing = known.get(key)
      if (!existing || a.status === 'active') {
        known.set(key, { name: a.technicianId ?? a.name, status: a.status, email: a.email, city: a.city })
      }
    }
    for (const svc of services) {
      const key = technicianKey(svc.technicianId ?? svc.technician)
      if (!key) continue
      if (!known.has(key)) {
        const t = findTechnician(svc.technician, accounts)
        known.set(key, { name: t?.technicianId ?? t?.name ?? svc.technician, status: t?.status ?? 'active', email: t?.email, city: t?.city })
      }
    }
    for (const c of complaints) {
      const key = technicianKey(c.assignedToId ?? c.assignedTo)
      if (!key) continue
      if (!known.has(key)) {
        const t = findTechnician(c.assignedTo, accounts)
        known.set(key, { name: t?.technicianId ?? t?.name ?? c.assignedTo, status: t?.status ?? 'active', email: t?.email, city: t?.city })
      }
    }
    const rows: TechRow[] = []
    for (const [key, meta] of known) {
      const mine = services.filter((s) => s.technician.toLowerCase() === key)
      const mineComplaints = complaints.filter((c) => c.assignedTo.toLowerCase() === key)
      const completed = mine.filter((s) => s.status === 'Completed')
      const timed = completed
        .map(serviceDurationMin)
        .filter((d): d is number => d != null)
      const avgTimeMin = timed.length ? timed.reduce((sum, d) => sum + d, 0) / timed.length : null
      const workTimes = mineComplaints
        .map(complaintWorkMin)
        .filter((d): d is number => d != null)
      const totalServiceMin =
        timed.reduce((sum, d) => sum + d, 0) + workTimes.reduce((sum, d) => sum + d, 0) || null
      const ratedServices = completed.filter((s) => s.rating !== null)
      const ratedComplaints = mineComplaints.filter((c) => c.satisfaction !== null && (c.status === 'Resolved' || c.status === 'Closed'))
      const ratedCount = ratedServices.length + ratedComplaints.length
      const avg = ratedCount
        ? (ratedServices.reduce((sum, s) => sum + (s.rating ?? 0), 0) + ratedComplaints.reduce((sum, c) => sum + (c.satisfaction ?? 0), 0)) / ratedCount
        : null
      rows.push({
        id: key,
        name: meta.name,
        email: meta.email,
        city: meta.city,
        status: meta.status,
        services: mine.length,
        completed: completed.length,
        complaints: mineComplaints.length,
        resolved: mineComplaints.filter((c) => c.status === 'Resolved' || c.status === 'Closed').length,
        avg,
        avgTimeMin,
        totalServiceMin,
      })
    }
    return rows.sort((a, b) => b.services - a.services)
  }, [services, complaints, accounts])

  const techKpis = useMemo(() => {
    const active = techRows.filter((t) => t.status === 'active').length
    const rated = techRows.filter((t) => t.avg !== null)
    const avg = rated.length ? (rated.reduce((sum, t) => sum + (t.avg ?? 0), 0) / rated.length) : 0
    return {
      total: techRows.length,
      active,
      avg: rated.length ? avg.toFixed(1) : '—',
      jobs: techRows.reduce((sum, t) => sum + t.completed + t.resolved, 0),
    }
  }, [techRows])

  const techColumns: Array<Column<TechRow>> = [
    {
      key: 'name',
      header: 'Technician',
      render: (t) => (
        <span>
          <span className="block font-medium text-slate-900">{t.name}</span>
          <Badge tone={t.status === 'active' ? 'success' : 'neutral'}>{t.status}</Badge>
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (t) =>
        t.email ? (
          <span>
            <span className="block text-xs text-slate-600">{t.email}</span>
            {t.city && <span className="block text-xs text-slate-400">{t.city}</span>}
          </span>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        ),
    },
    { key: 'services', header: 'Services', render: (t) => t.services },
    { key: 'completed', header: 'Completed', render: (t) => <span className="text-slate-600">{t.completed}</span> },
    { key: 'complaints', header: 'Complaints', render: (t) => t.complaints },
    { key: 'resolved', header: 'Resolved', render: (t) => <span className="text-emerald-600">{t.resolved}</span> },
    {
      key: 'avg',
      header: 'Avg Rating',
      render: (t) =>
        t.avg !== null ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
            {t.avg.toFixed(1)}
          </span>
        ) : (
          <span className="text-xs text-slate-400" title="No rated work yet">No ratings yet</span>
        ),
    },
    {
      key: 'avgTime',
      header: 'Avg On-site',
      render: (t) =>
        t.avgTimeMin !== null ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
            <Clock className="h-3.5 w-3.5 text-brand-600" aria-hidden />
            {formatDuration(t.avgTimeMin)}
          </span>
        ) : (
          <span className="text-xs text-slate-400" title="No timed visits yet">No data</span>
        ),
    },
    {
      key: 'totalTime',
      header: 'Total Service Time',
      render: (t) =>
        t.totalServiceMin !== null ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600" title="Service visits + complaint work, all time">
            <Clock className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            {formatDuration(t.totalServiceMin)}
          </span>
        ) : (
          <span className="text-xs text-slate-400" title="No timed work yet">No data</span>
        ),
    },
  ]

  const columns: Array<Column<ServiceRecord>> = [
    {
      key: 'visit',
      header: 'Visit',
      render: (s) => (
        <button
          className="text-left font-medium text-brand-700 hover:underline"
          onClick={(e) => { e.stopPropagation(); navigate(`/services/${s.id}`) }}
          title="Open visit record, photos and sign-off"
        >
          {s.id}
        </button>
      ),
    },
    { key: 'date', header: 'Date', render: (s) => formatDate(s.date) },
    {
      key: 'customer',
      header: 'Customer',
      render: (s) => (
        <button className="text-left font-medium text-brand-700 hover:underline" onClick={(e) => { e.stopPropagation(); navigate(`/customers/${s.customerId}`) }}>
          {customerNames.get(s.customerId)?.name}
        </button>
      ),
    },
    { key: 'service', header: 'Service', render: (s) => <Badge tone="brand">{s.serviceType}</Badge> },
    {
      key: 'machine',
      header: 'Machine',
      render: (s) => (s.assetId ? <span className="text-slate-600">{assets.find((a) => a.id === s.assetId)?.name ?? s.assetId}</span> : <span className="text-slate-300">—</span>),
    },
    { key: 'technician', header: 'Technician', render: (s) => s.technician },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge kind="service" value={s.status} /> },
    {
      key: 'duration',
      header: 'Duration',
      render: (s) => {
        const d = serviceDurationMin(s)
        return d != null ? <span className="text-xs font-medium text-slate-600">{formatDuration(d)}</span> : <span className="text-slate-300">—</span>
      },
    },
    {
      key: 'rating',
      header: 'Satisfaction',
      render: (s) =>
        s.rating ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
            {s.rating}
          </span>
        ) : s.status === 'Completed' ? (
          <span className="text-xs text-slate-400">Awaiting customer rating</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    { key: 'notes', header: 'Notes', render: (s) => <span className="block max-w-[220px] truncate text-slate-500">{s.notes}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Services"
        subtitle="Technician directory, service activity and customer experience."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
            Add Service
          </Button>
        }
      />

      <div className="mb-5 flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        <button
          type="button"
          onClick={() => { setTab('techs'); setPage(1) }}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === 'techs' ? 'bg-white text-slate-900 shadow-card' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Technicians
        </button>
        <button
          type="button"
          onClick={() => { setTab('visits'); setPage(1) }}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === 'visits' ? 'bg-white text-slate-900 shadow-card' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Service History
        </button>
      </div>

      {tab === 'techs' ? (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Technicians" value={techKpis.total} icon={UserCheck} tone="brand" />
            <StatCard label="Active" value={techKpis.active} sub="approved accounts" tone="success" />
            <StatCard label="Avg Technician Rating" value={techKpis.avg} sub="rated work" icon={Star} tone="default" />
            <StatCard label="Jobs Completed" value={techKpis.jobs} sub="services + complaints" icon={Briefcase} tone="default" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white shadow-card">
            <DataTable
              columns={techColumns}
              data={techRows}
              rowKey={(t) => t.id}
              onRowClick={(t) => navigate(`/services/technicians/${t.id}`)}
              empty={<EmptyState title="No technicians yet" description="Technician accounts approved on the Accounts page will appear here." />}
            />
          </div>
        </>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Services This Month" value={kpis.month} icon={Wrench} tone="brand" />
            <StatCard label="Completed" value={kpis.completed} sub="all time" tone="success" />
            <StatCard label="Pending" value={kpis.pending} sub="scheduled or in progress" tone="warning" />
            <StatCard label="Average Rating" value={kpis.avg} sub="out of 5" icon={Star} tone="default" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white shadow-card">
            <div className="border-b border-slate-100 p-4">
              <div className="flex flex-col gap-3">
                <SearchInput value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search customer or technician..." className="max-w-md" />
                <FilterBar applied={applied} onReset={reset}>
                  <Select value={serviceFilter} onChange={(e) => { setServiceFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Services' }, ...SERVICE_FILTERS.map((s) => ({ value: s, label: s }))]} className="w-44" />
                  <Select value={technicianFilter} onChange={(e) => { setTechnicianFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Technicians' }, ...technicians.map((t) => ({ value: t, label: t }))]} className="w-44" />
                  <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Status' }, ...['Scheduled', 'In Progress', 'Completed', 'Cancelled'].map((s) => ({ value: s, label: s }))]} className="w-40" />
                </FilterBar>
              </div>
            </div>
            {loading ? (
              <TableSkeleton rows={6} columns={8} />
            ) : (
              <DataTable
                columns={columns}
                data={pageRows}
                rowKey={(s) => s.id}
                empty={<EmptyState title="No services found" description="Try adjusting your filters." action={<Button variant="outline" size="sm" onClick={reset}>Clear Filters</Button>} />}
              />
            )}
            {!loading && filtered.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-3">
                <Pagination page={page} perPage={PER_PAGE} total={filtered.length} onChange={setPage} />
              </div>
            )}
          </div>
        </>
      )}

      <ServiceFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}