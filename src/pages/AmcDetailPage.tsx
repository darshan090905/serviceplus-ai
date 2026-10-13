import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '../store/AppStore'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { DetailSkeleton } from '../components/ui/Skeleton'
import { Avatar } from '../components/ui/Avatar'
import { DeleteAmcModal } from '../components/amc/DeleteAmcModal'
import { AmcFormModal } from '../components/amc/AmcFormModal'
import { useLoading } from '../hooks/useDebounce'
import { formatDate, daysUntil, today } from '../utils/dates'
import { visitIntervalDays, nextVisitAfter, toDateValue } from '../utils/preventive'
import { formatINR } from '../utils/format'
import { formatShortDate } from '../utils/dates'

export function AmcDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { amcs, customers, payments, assets } = useAppStore()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const loading = useLoading(350)

  const amc = amcs.find((a) => a.id === id)
  const customer = amc ? customers.find((c) => c.id === amc.customerId) : undefined
  const amcPayments = amc ? payments.filter((p) => p.amcId === amc.id) : []

  if (loading) return <DetailSkeleton />

  if (!amc || !customer) {
    return (
      <div>
        <Link to="/amc-contracts" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> All AMC contracts
        </Link>
        <Card className="p-10"><EmptyState title="AMC contract not found" /></Card>
      </div>
    )
  }

  const days = daysUntil(amc.endDate)
  const visitIsDue = !!amc.nextVisitOn && amc.nextVisitOn <= toDateValue(today())
  // Only meaningful when there is a booked visit to advance from; without a
  // cadence the contract is on-call only and there is nothing to project.
  const projectedVisits =
    amc.visitsPerYear != null && amc.nextVisitOn
      ? Math.max(0, Math.floor(daysUntil(amc.endDate) / (visitIntervalDays(amc.visitsPerYear) ?? 365)))
      : 0

  return (
    <div>
      <Link to="/amc-contracts" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> All AMC contracts
      </Link>

      <div className="mb-5 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={customer.name} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">{amc.id}</h1>
              <StatusBadge kind="amc" value={amc.status} />
              <Badge tone={days > 0 && days <= 30 ? 'warning' : days <= 0 ? 'neutral' : 'success'}>
                {days > 0 ? `${days} days left` : `${Math.abs(days)} days overdue`}
              </Badge>
            </div>
            <Link to={`/customers/${customer.id}`} className="text-sm text-brand-600 hover:text-brand-700">
              {customer.name} — {customer.company}
            </Link>
          </div>
        </div>
        <span className="flex items-center gap-2">
          <Link to={`/customers/${customer.id}`}>
            <Button variant="outline">Open Customer</Button>
          </Link>
          <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Contract Details">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Service</dt><dd className="font-medium">{amc.serviceType}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Machine</dt><dd className="font-medium">{amc.assetId ? assets.find((a) => a.id === amc.assetId)?.name ?? amc.assetId : <span className="text-slate-400">Site-wide</span>}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Period</dt><dd>{formatDate(amc.startDate)} → {formatDate(amc.endDate)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Amount</dt><dd className="text-base font-bold text-slate-900">{formatINR(amc.amount)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><StatusBadge kind="amc" value={amc.status} /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Renewal</dt><dd><Badge tone={amc.renewalStatus === 'Done' ? 'success' : amc.renewalStatus === 'Pending' || amc.renewalStatus === 'Started' ? 'warning' : 'neutral'}>{amc.renewalStatus}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Renewal Date</dt><dd>{amc.renewalDate ? formatDate(amc.renewalDate) : <span className="text-slate-400">Not scheduled</span>}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Preventive Visits</dt><dd>{amc.visitsPerYear != null ? <span className="font-medium">{amc.visitsPerYear} per year</span> : <span className="text-slate-400">On-call only</span>}</dd></div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Next Scheduled Visit</dt>
              <dd>
                {amc.nextVisitOn ? (
                  <span className={visitIsDue ? 'font-semibold text-amber-700' : 'font-medium'}>
                    {formatDate(amc.nextVisitOn)}
                    {visitIsDue && <span className="ml-1 text-xs font-normal text-amber-700">due for booking</span>}
                  </span>
                ) : (
                  <span className="text-slate-400">None scheduled</span>
                )}
              </dd>
            </div>
          </dl>
          <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-xs text-brand-800">
            {days > 0
              ? `This contract expires in ${days} days. Renewal revenue exposure: ${formatINR(amc.amount)}.`
              : `This contract has expired. Expiry is never a guaranteed loss — treat it as revenue exposure.`}
            {amc.visitsPerYear != null && (
              <p className="mt-2">
                {projectedVisits > 0
                  ? `About ${projectedVisits} more scheduled visit${projectedVisits === 1 ? '' : 's'} fit before expiry, then ${
                      amc.nextVisitOn ? formatDate(nextVisitAfter(amc.nextVisitOn, amc.visitsPerYear) ?? amc.nextVisitOn) : 'the next one'
                    }.`
                  : 'No further visits fit inside the remaining term — renew or extend the contract to keep the cadence going.'}
              </p>
            )}
          </div>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          <Card title="Payments against this contract">
            {amcPayments.length === 0 ? (
              <p className="text-sm text-slate-400">No payments recorded against this contract.</p>
            ) : (
              <ul className="space-y-3">
                {amcPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-800">{p.invoice}</p>
                      <p className="text-xs text-slate-400">due {formatDate(p.dueDate)} {p.paidDate ? `· paid ${formatDate(p.paidDate)}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatINR(p.amount)}</p>
                      <StatusBadge kind="payment" value={p.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Contract Timeline">
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              <li className="relative">
                <span className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden />
                <p className="text-sm font-medium text-slate-800">Contract started</p>
                <p className="text-xs text-slate-400">{formatShortDate(amc.startDate)}</p>
              </li>
              <li className="relative">
                <span className={`absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full ${days > 0 ? 'bg-brand-500' : 'bg-red-500'}`} aria-hidden />
                <p className="text-sm font-medium text-slate-800">{days > 0 ? 'Contract expires' : 'Contract expired'}</p>
                <p className="text-xs text-slate-400">{formatShortDate(amc.endDate)}</p>
              </li>
            </ol>
          </Card>
        </div>
      </div>

      <AmcFormModal
        key={`amc-detail-edit-${amc.id}`}
        open={editing}
        amc={amc}
        onClose={() => setEditing(false)}
      />
      <DeleteAmcModal
        amc={confirmDelete ? amc : null}
        onClose={() => setConfirmDelete(false)}
        onDeleted={() => navigate('/amc-contracts')}
      />
    </div>
  )
}