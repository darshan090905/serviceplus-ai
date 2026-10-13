import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Wrench } from 'lucide-react'
import { useAppStore } from '../store/AppStore'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { StatusBadge } from '../components/ui/StatusBadge'
import { EmptyState } from '../components/ui/EmptyState'
import { DetailSkeleton } from '../components/ui/Skeleton'
import { Avatar } from '../components/ui/Avatar'
import { ProofOfWorkPanel } from '../components/jobs/ProofOfWork'
import { useLoading } from '../hooks/useDebounce'
import { describe as describeAsset } from '../components/assets/AssetPicker'
import { describe as describeAmc } from '../components/amc/AmcPicker'
import { formatDate, formatDateTime } from '../utils/dates'
import { formatINRExact } from '../utils/format'
import { jobCost, toRupees } from '../utils/money'
import { useEffect, useState } from 'react'
import { loadEvidence } from '../services/jobService'
import type { Evidence } from '../services/jobService'

export function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { services, customers, amcs, assets } = useAppStore()
  const loading = useLoading(350)

  const service = services.find((s) => s.id === id)
  const customer = service ? customers.find((c) => c.id === service.customerId) : undefined

  // Loaded here purely for the costing sidebar. ProofOfWorkPanel has its own
  // copy; two reads of the same three small tables is cheaper than lifting the
  // state into the page and threading it through a component that is also used
  // inside a modal.
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  useEffect(() => {
    if (!id) return
    void loadEvidence(id).then(setEvidence)
  }, [id])

  if (loading) return <DetailSkeleton />

  if (!service || !customer) {
    return (
      <div>
        <BackLink />
        <Card className="p-10"><EmptyState title="Visit not found" /></Card>
      </div>
    )
  }

  const asset = service.assetId ? assets.find((a) => a.id === service.assetId) : undefined
  const amc = service.amcId ? amcs.find((a) => a.id === service.amcId) : undefined
  const cost = jobCost(evidence?.parts ?? [])

  return (
    <div>
      <BackLink />

      <div className="mb-5 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={customer.name} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Visit {service.id}</h1>
              <StatusBadge kind="service" value={service.status} />
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {service.serviceType} · {customer.name} · {formatDate(service.date)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {amc && <Badge tone="info">{describeAmc(amc)}</Badge>}
          {asset && <Badge tone="neutral">{describeAsset(asset)}</Badge>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProofOfWorkPanel serviceId={service.id} takenBy={service.technician} />
        </div>

        <div className="space-y-5">
          <Card title="Job costing">
            <dl className="space-y-2.5 text-sm">
              <Row label="Parts charged" value={formatINRExact(toRupees(cost.parts))} />
              <Row label="Parts cost" value={formatINRExact(toRupees(cost.cost))} muted />
              <div className="border-t border-slate-100 pt-2.5">
                <Row
                  label="Parts margin"
                  value={cost.marginPercent == null ? '—' : `${cost.marginPercent.toFixed(1)}%`}
                  muted={cost.marginPercent == null}
                />
              </div>
              <div className="border-t border-slate-100 pt-2.5">
                <Row label="Customer total" value={formatINRExact(toRupees(cost.total))} strong />
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-400">
              Margin covers parts only. Nothing in the product records what a technician's hour
              costs, so this is not a profit figure.
            </p>
          </Card>

          <Card title="Visit">
            <dl className="space-y-2.5 text-sm">
              <Row label="Status" value={<StatusBadge kind="service" value={service.status} />} />
              <Row label="Date" value={formatDate(service.date)} />
              <Row label="Technician" value={service.technician || '—'} muted={!service.technician} />
              <Row label="Contract" value={amc ? describeAmc(amc) : 'Ad-hoc'} muted={!amc} />
              <Row label="Machine" value={asset ? describeAsset(asset) : 'Site-wide'} muted={!asset} />
              {service.checkInAt && <Row label="Checked in" value={formatDateTime(service.checkInAt)} />}
              {service.checkOutAt && <Row label="Checked out" value={formatDateTime(service.checkOutAt)} />}
              {service.rating != null && <Row label="Rating" value={`${service.rating} / 5`} />}
            </dl>
            {service.notes && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Wrench className="h-3.5 w-3.5" /> Work notes
                </p>
                <p className="text-sm text-slate-600">{service.notes}</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/services" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
      <ArrowLeft className="h-4 w-4" /> All services
    </Link>
  )
}

function Row({ label, value, strong, muted }: { label: string; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={strong ? 'font-semibold text-slate-900' : muted ? 'text-slate-400' : 'text-slate-700'}>{value}</dd>
    </div>
  )
}
