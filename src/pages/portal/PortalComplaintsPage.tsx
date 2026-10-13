import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, MessageSquareWarning } from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDate } from '../../utils/dates'
import type { Complaint } from '../../types'

export function PortalComplaintsPage() {
  const { session, complaints } = useAppStore()

  const mine = useMemo(
    () =>
      complaints
        .filter((c) => c.customerId === session?.customerId)
        .sort((a, b) => b.created.localeCompare(a.created)),
    [complaints, session?.customerId],
  )

  const open = mine.filter((c) => c.status === 'Open' || c.status === 'In Progress').length
  const resolved = mine.filter((c) => c.status === 'Resolved' || c.status === 'Closed').length

  const cards: Array<{ label: string; value: string | number; tone: 'warning' | 'danger' | 'success' }> = [
    { label: 'Open Complaints', value: open, tone: 'warning' },
    { label: 'Resolved', value: `${resolved} / ${mine.length || 0}`, tone: 'success' },
    { label: 'CSAT Pending', value: mine.filter((c) => c.status === 'Resolved' || c.status === 'Closed').length > 0 ? mine.filter((c) => !c.satisfaction).length : 0, tone: 'danger' },
  ]

  return (
    <div>
      <PageHeader
        title="My Complaints"
        subtitle="Track the status of issues you have reported."
        actions={
          <Link
            to="/portal/complaints/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" aria-hidden /> Raise a Complaint
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open" value={open} sub="in progress" icon={MessageSquareWarning} tone={cards[0].tone} />
        <StatCard label="Resolved" value={cards[1].value} sub="all-time" tone="success" />
        <StatCard label="Awaiting Rating" value={cards[2].value} sub="tell us how we did" tone="danger" />
      </div>

      {mine.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-card">
          <EmptyState
            title="No complaints yet"
            description="Raise a complaint and our team will address it."
            action={
              <Link
                to="/portal/complaints/new"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" aria-hidden /> Raise a Complaint
              </Link>
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-card">
          <ul className="divide-y divide-slate-100">
            {mine.map((c: Complaint) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <Link to={`/portal/complaints/${c.id}`} className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-brand-700">
                    {c.id}
                    <Badge tone={c.severity === 'Critical' ? 'danger' : c.severity === 'High' ? 'warning' : c.severity === 'Medium' ? 'info' : 'neutral'}>{c.severity}</Badge>
                  </p>
                  <p className="mt-0.5 truncate text-sm text-slate-500">{c.description}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{c.category} · {formatDate(c.created)}</p>
                </Link>
                <StatusBadge kind="complaint" value={c.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}