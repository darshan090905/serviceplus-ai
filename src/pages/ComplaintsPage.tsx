import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessagesSquare, MessageSquareWarning, Trash2 } from 'lucide-react'
import type { Complaint } from '../types'
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
import { SlaBadge } from '../components/complaints/SlaBadge'
import { activeTechnicians } from '../utils/technicians'
import { slaStateOf } from '../utils/sla'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { TableSkeleton } from '../components/ui/Skeleton'
import { FilterBar } from '../components/ui/FilterBar'
import { formatDate } from '../utils/dates'
import { useDebouncedValue, useLoading } from '../hooks/useDebounce'
import { cn } from '../utils/cn'

const PER_PAGE = 10

export function ComplaintsPage() {
  const { complaints, customers, accounts, messages, assignComplaint, deleteComplaint } = useAppStore()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [slaFilter, setSlaFilter] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const loading = useLoading(400)
  const debounced = useDebouncedValue(query)

  useEffect(() => {
    setSelected(new Set())
  }, [query, severityFilter, statusFilter, categoryFilter, slaFilter])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === pageRows.length ? new Set() : new Set(pageRows.map((c) => c.id)),
    )

  const doDelete = async () => {
    const ids = [...selected]
    setConfirming(false)
    await Promise.all(ids.map((id) => deleteComplaint(id)))
    setSelected(new Set())
    toast(
      `Deleted ${ids.length} complaint${ids.length === 1 ? '' : 's'} — removed across admin, technician and customer portals.`,
      'success',
    )
  }

  const technicians = useMemo(() => activeTechnicians(accounts), [accounts])

  const customerNames = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers])

  const messageCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of messages) map.set(m.complaintId, (map.get(m.complaintId) ?? 0) + 1)
    return map
  }, [messages])

  const kpis = useMemo(() => {
    const open = complaints.filter((c) => c.status === 'Open').length
    const highSeverity = complaints.filter((c) => c.severity === 'High' || c.severity === 'Critical').length
    const inProgress = complaints.filter((c) => c.status === 'In Progress').length
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
    const resolvedWeek = complaints.filter((c) => (c.status === 'Resolved') && c.created >= weekAgo).length
    return { open, highSeverity, inProgress, resolvedWeek }
  }, [complaints])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return complaints
      .filter((c) => {
        const customer = customerNames.get(c.customerId)
        if (q && !c.id.toLowerCase().includes(q) && !customer?.name.toLowerCase().includes(q)) return false
        if (severityFilter && c.severity !== severityFilter) return false
        if (statusFilter && c.status !== statusFilter) return false
        if (categoryFilter && c.category !== categoryFilter) return false
        if (slaFilter && slaStateOf(c) !== slaFilter) return false
        return true
      })
      // Breached work first, then whatever is closest to breaching, so the list
      // opens on the rows that actually need attention.
      .sort((a, b) => {
        const rank = (c: Complaint) => ({ breached: 0, atRisk: 1, met: 2, none: 3 })[slaStateOf(c)]
        const bySla = rank(a) - rank(b)
        return bySla !== 0 ? bySla : b.created.localeCompare(a.created)
      })
  }, [complaints, debounced, customerNames, severityFilter, statusFilter, categoryFilter, slaFilter])

  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const applied = [debounced, severityFilter, statusFilter, categoryFilter, slaFilter].filter(Boolean).length

  const reset = () => {
    setQuery(''); setSeverityFilter(''); setStatusFilter(''); setCategoryFilter(''); setSlaFilter(''); setPage(1)
  }

  const columns: Array<Column<Complaint>> = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          aria-label="Select all complaints on this page"
          checked={pageRows.length > 0 && pageRows.every((c) => selected.has(c.id))}
          onChange={toggleAll}
          className="h-4 w-4 rounded border-slate-300 accent-brand-600"
        />
      ),
      render: (c) => (
        <input
          type="checkbox"
          aria-label={`Select ${c.id}`}
          checked={selected.has(c.id)}
          onChange={() => toggle(c.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-slate-300 accent-brand-600"
        />
      ),
    },
    { key: 'id', header: 'Complaint ID', render: (c) => <span className="font-medium text-brand-700">{c.id}</span> },
    {
      key: 'customer',
      header: 'Customer',
      render: (c) => (
        <button className="text-left font-medium text-slate-800 hover:text-brand-700" onClick={(e) => { e.stopPropagation(); navigate(`/customers/${c.customerId}`) }}>
          {customerNames.get(c.customerId)?.name}
        </button>
      ),
    },
    { key: 'category', header: 'Category', render: (c) => <Badge tone="info">{c.category}</Badge> },
    { key: 'description', header: 'Description', render: (c) => <span className="block max-w-[240px] truncate text-slate-500">{c.description}</span> },
    { key: 'severity', header: 'Severity', render: (c) => <Badge tone={c.severity === 'Critical' ? 'critical' : c.severity === 'High' ? 'danger' : c.severity === 'Medium' ? 'warning' : 'neutral'}>{c.severity}</Badge> },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge kind="complaint" value={c.status} /> },
    { key: 'sla', header: 'SLA', render: (c) => <SlaBadge complaint={c} /> },
    { key: 'created', header: 'Created', render: (c) => formatDate(c.created) },
    { key: 'assigned', header: 'Assigned To', render: (c) => c.assignedTo },
    {
      key: 'chat',
      header: 'Chat',
      render: (c) => {
        const count = messageCounts.get(c.id) ?? 0
        return (
          <button
            title={count === 0 ? 'No messages yet' : `${count} message${count === 1 ? '' : 's'}`}
            aria-label={`Chat on ${c.id}`}
            onClick={(e) => { e.stopPropagation(); navigate(`/complaints/${c.id}`) }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-brand-50 hover:text-brand-700"
          >
            <MessagesSquare className={cn('h-3.5 w-3.5', count > 0 ? 'text-brand-600' : 'text-slate-400')} aria-hidden />
            {count > 0 ? count : null}
          </button>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => {
        const isOpen = c.status === 'Open' || c.status === 'In Progress'
        return (
          <div className="flex items-center justify-end gap-2">
            {isOpen && technicians.length > 0 && (
              <select
                aria-label={`Assign technician for ${c.id}`}
                value={c.assignedTo}
                onChange={(e) => {
                  e.stopPropagation()
                  const name = e.target.value
                  const tech = technicians.find((t) => t.technicianId === name || t.name === name)
                  assignComplaint(c.id, name, tech?.email)
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              >
                <option value="" disabled>Select Technician</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            )}
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/complaints/${c.id}`) }}>
              View
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="Complaints"
        subtitle="Track, prioritize and resolve customer issues."
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open Complaints" value={kpis.open} icon={MessageSquareWarning} tone="danger" />
        <StatCard label="High Severity" value={kpis.highSeverity} sub="needs priority" tone="danger" />
        <StatCard label="In Progress" value={kpis.inProgress} sub="being addressed" tone="warning" />
        <StatCard label="Resolved This Week" value={kpis.resolvedWeek} sub="closed cases" tone="success" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3">
            <SearchInput value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search complaint ID or customer..." className="max-w-md" />
            <FilterBar applied={applied} onReset={reset}>
              <Select value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Severity' }, ...['Low', 'Medium', 'High', 'Critical'].map((s) => ({ value: s, label: s }))]} className="w-40" />
              <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Status' }, ...['Open', 'In Progress', 'Resolved', 'Closed'].map((s) => ({ value: s, label: s }))]} className="w-40" />
              <Select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All Categories' }, ...['Service Quality', 'Billing', 'Technician', 'Product', 'Other'].map((s) => ({ value: s, label: s }))]} className="w-44" />
              <Select value={slaFilter} onChange={(e) => { setSlaFilter(e.target.value); setPage(1) }} options={[{ value: '', label: 'All SLA States' }, { value: 'breached', label: 'Breached' }, { value: 'atRisk', label: 'At risk' }, { value: 'met', label: 'On track' }, { value: 'none', label: 'No SLA' }]} className="w-40" />
            </FilterBar>
            {selected.size > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-sm font-medium text-red-700">{selected.size} complaint{selected.size === 1 ? '' : 's'} selected</p>
                <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirming(true)}>
                  Delete selected
                </Button>
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : (
          <DataTable
            columns={columns}
            data={pageRows}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/complaints/${c.id}`)}
            empty={<EmptyState title="No complaints found" description="There are no complaints matching your current filters." action={<Button variant="outline" size="sm" onClick={reset}>Clear Filters</Button>} />}
          />
        )}
        {!loading && filtered.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={page} perPage={PER_PAGE} total={filtered.length} onChange={setPage} />
          </div>
        )}
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${selected.size} complaint${selected.size === 1 ? '' : 's'}?`}
        description="This permanently deletes the selected complaints together with their AI call log, notifications and dispatched assignment emails. This cannot be undone."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={doDelete}>Delete permanently</Button>
          </div>
        }
      >
        <p className="text-sm text-slate-500">
          The complaints will disappear immediately from the admin, technician and customer portals.
        </p>
      </Modal>
    </div>
  )
}