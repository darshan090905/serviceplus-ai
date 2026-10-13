import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, PenLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/AppStore'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { DetailSkeleton } from '../../components/ui/Skeleton'
import { ProofOfWorkPanel } from '../../components/jobs/ProofOfWork'
import { useLoading } from '../../hooks/useDebounce'
import { formatDate, formatDateTime } from '../../utils/dates'
import { formatINRExact } from '../../utils/format'
import { partsTotalPaise, toRupees } from '../../utils/money'
import { loadEvidence } from '../../services/jobService'
import type { Evidence } from '../../services/jobService'

/**
 * A customer's own view of one visit: what was done, what was fitted, and who
 * signed for it.
 *
 * Read-only, and deliberately showing only what was charged. The parts *cost*
 * to the business is fetched by loadEvidence but never rendered here — a
 * customer seeing our margin is a different conversation from a customer seeing
 * their bill, and the panel omits that column.
 */
export function PortalVisitPage() {
  const { id } = useParams<{ id: string }>()
  const { services, customers, session } = useAppStore()
  const loading = useLoading(350)

  const [evidence, setEvidence] = useState<Evidence | null>(null)
  useEffect(() => {
    if (!id) return
    void loadEvidence(id).then(setEvidence)
  }, [id])

  if (loading) return <DetailSkeleton />

  const service = services.find((s) => s.id === id)
  const customer = service ? customers.find((c) => c.id === service.customerId) : undefined

  // The route is reachable by typing any id, so the visit has to be confirmed as
  // this customer's own before it renders. Returning a 404 rather than the
  // visit is what stops one customer reading another's job sheet.
  // Same reasoning as the invoice page: no fallback to `customer.id`, because
  // comparing the visit's customer against itself is always true and would let
  // anyone open any visit by id.
  const isOwnVisit =
    session?.role === 'admin' || (session?.customerId != null && service?.customerId === session.customerId)
  if (!service || !customer || !isOwnVisit) {
    return (
      <div>
        <BackLink />
        <Card className="p-10"><EmptyState title="Visit not found" /></Card>
      </div>
    )
  }

  const charged = toRupees(partsTotalPaise(evidence?.parts ?? []))

  return (
    <div>
      <BackLink />

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-slate-900">Visit on {formatDate(service.date)}</h1>
          <StatusBadge kind="service" value={service.status} />
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          {service.serviceType}
          {service.technician ? ` · ${service.technician}` : ''}
        </p>
      </div>

      {service.notes && (
        <Card title="Work carried out" className="mb-5">
          <p className="text-sm text-slate-600">{service.notes}</p>
        </Card>
      )}

      <div className="mb-5">
        <ProofOfWorkPanel serviceId={service.id} readOnly />
      </div>

      {evidence && evidence.parts.length > 0 && (
        <Card title="Charges for this visit" className="mb-5">
          <dl className="space-y-2 text-sm">
            {evidence.parts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3">
                <dt className="text-slate-600">
                  {p.name} <span className="text-slate-400">× {p.quantity}</span>
                </dt>
                <dd className="font-medium text-slate-800">{formatINRExact(p.unitPrice * p.quantity)}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
              <dt className="font-medium text-slate-700">Total</dt>
              <dd className="font-semibold text-slate-900">{formatINRExact(charged)}</dd>
            </div>
          </dl>
        </Card>
      )}

      {evidence?.signature ? (
        <Card title="Signed off">
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <PenLine className="h-4 w-4 text-slate-400" />
            Signed by <span className="font-medium text-slate-900">{evidence.signature.signedBy}</span>
            {evidence.signature.roleNote ? `, ${evidence.signature.roleNote}` : ''} on {formatDateTime(evidence.signature.createdAt)}.
          </p>
        </Card>
      ) : service.status === 'Completed' && (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          This visit has not been signed off. Photos and the sign-off appear here once your
          technician records them.
        </p>
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/portal/services" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
      <ArrowLeft className="h-4 w-4" /> My services
    </Link>
  )
}
