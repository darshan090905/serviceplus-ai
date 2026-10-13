import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, PlayCircle, ArrowRight } from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Textarea } from '../../components/ui/Field'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { ComplaintWorkflow, ComplaintLocationChips } from '../../components/complaints/ComplaintWorkflow'
import { formatShortDate } from '../../utils/dates'
import type { Complaint } from '../../types'

export function TechComplaintsPage() {
  const { session, complaints, customers, resolveComplaint } = useAppStore()
  const { toast } = useToast()
  const me = session?.technicianId ?? ''
  const myName = session?.name ?? ''
  const [resolving, setResolving] = useState<Complaint | null>(null)
  const [resolution, setResolution] = useState('')

  const mine = useMemo(
    () => {
      const isMine = (assigned: string) =>
        assigned === myName ||
        assigned === me ||
        assigned.toLowerCase() === myName.toLowerCase()

      return complaints
        .filter((c) => isMine(c.assignedTo))
        .sort(
          (a, b) =>
            Number(b.severity === 'Critical') - Number(a.severity === 'Critical') ||
            Number(b.severity === 'High') - Number(a.severity === 'High') ||
            b.created.localeCompare(a.created),
        )
    },
    [complaints, me, myName],
  )

  const open = mine.filter((c) => c.status === 'Open' || c.status === 'In Progress')
  const resolved = mine.filter((c) => c.status === 'Resolved' || c.status === 'Closed')

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? id

  const severityBadge = (c: Complaint) => (
    <Badge tone={c.severity === 'Critical' ? 'critical' : c.severity === 'High' ? 'danger' : c.severity === 'Medium' ? 'warning' : 'neutral'}>
      {c.severity}
    </Badge>
  )

  const resolve = () => {
    if (!resolving || !resolution.trim()) return
    resolveComplaint(resolving.id, resolution.trim())
    toast(`Complaint ${resolving.id} resolved — the customer has been notified by email.`)
    setResolving(null)
    setResolution('')
  }

  const completeWork = (c: Complaint) => {
    setResolution('')
    setResolving(c)
  }

  return (
    <div>
      <PageHeader title="Assigned Complaints" subtitle="Complaints routed to your team. Start work on them and record resolutions." />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open" value={open.length} sub="assigned to you" icon={PlayCircle} tone="danger" />
        <StatCard label="Resolved" value={resolved.length} sub="by your team" icon={CheckCircle2} tone="success" />
      </div>

      <Card bodyClassName="p-0">
        {mine.length === 0 ? (
          <EmptyState title="No complaints assigned" description="Complaints assigned to you will appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {mine.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{c.id}</span>
                    {severityBadge(c)}
                    <StatusBadge kind="complaint" value={c.status} />
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-700">{customerName(c.customerId)} — {c.description}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {c.category} · raised {formatShortDate(c.created)}
                    {c.status === 'Resolved' || c.status === 'Closed' ? ' · resolved with satisfaction ' : ''}
                    {(c.status === 'Resolved' || c.status === 'Closed') && c.satisfaction ? `${c.satisfaction}/5` : ''}
                  </p>
                  <ComplaintLocationChips complaint={c} />
                  {c.resolution && <p className="mt-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{c.resolution}</p>}
                  {c.feedback && (
                    <p className="mt-1 rounded-lg bg-slate-50 px-3 py-1.5 text-xs italic text-slate-600">Customer feedback: “{c.feedback}”</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ComplaintWorkflow complaint={c} onResolve={completeWork} />
                  <Link to={`/tech/complaints/${c.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                    View <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title={`Resolve ${resolving?.id ?? ''}`}
        description={resolving ? `${customerName(resolving.customerId)} · ${resolving.category}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setResolving(null)}>Cancel</Button>
            <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} disabled={!resolution.trim()} onClick={resolve}>
              Confirm resolution
            </Button>
          </>
        }
      >
        <Textarea
          label="Resolution summary"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="Describe what was fixed and how..."
        />
        <p className="mt-2 text-xs text-slate-400">The customer is notified by email and can rate their satisfaction afterwards.</p>
      </Modal>
    </div>
  )
}