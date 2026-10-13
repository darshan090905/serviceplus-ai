import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../../store/AppStore'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { formatDate } from '../../utils/dates'
import { currentCoords } from '../../utils/geo'
import { Wrench, FileText, LocateFixed, CheckCircle2, X, Star } from 'lucide-react'
import type { ServiceRecord, AMCContract } from '../../types'
import { cn } from '../../utils/cn'

// A completed visit with no rating yet gets the same 5-star picker the
// complaint CSAT screen uses, so satisfaction is captured on the service record
// itself instead of only living on complaints.
function RateVisit({ service, onRate }: { service: ServiceRecord; onRate: (rating: number) => void }) {
  const [selected, setSelected] = useState(0)
  const [hovered, setHovered] = useState(0)
  return (
    <span className="flex items-center gap-1" data-testid={`rate-${service.id}`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => {
            setSelected(s)
            onRate(s)
          }}
          className="rounded p-0.5 transition-transform hover:scale-110"
          aria-label={`Rate visit ${service.id} ${s} out of 5`}
          aria-pressed={selected === s}
        >
          <Star className={cn('h-5 w-5', (hovered || selected) >= s ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} aria-hidden />
        </button>
      ))}
    </span>
  )
}

interface SvcRow {
  key: string
  kind: 'amc' | 'visit'
  amc?: AMCContract
  service?: ServiceRecord
}

export function PortalServicesPage() {
  const { session, services, amcs, updateService, rateService } = useAppStore()
  const { toast } = useToast()
  const [sharing, setSharing] = useState<string | null>(null)
  const customerId = session?.customerId

  const myAmcs = useMemo(
    () => (customerId ? amcs.filter((a) => a.customerId === customerId) : []),
    [amcs, customerId],
  )

  const rows = useMemo<SvcRow[]>(() => {
    const visits: SvcRow[] = services
      .filter((s) => s.customerId === customerId)
      .map((service) => ({ key: `v-${service.id}`, kind: 'visit', service }))
    const contracts: SvcRow[] = myAmcs.map((amc) => ({ key: `a-${amc.id}`, kind: 'amc', amc }))
    return [...contracts, ...visits].sort((a, b) => {
      const da = a.amc?.startDate ?? a.service?.date ?? ''
      const db = b.amc?.startDate ?? b.service?.date ?? ''
      return db.localeCompare(da)
    })
  }, [services, myAmcs, customerId])

  const completedVisits = rows.filter((r) => r.kind === 'visit' && r.service?.status === 'Completed')
  const ratedVisits = completedVisits.filter((r) => r.service?.rating !== null)
  const avgRating = ratedVisits.length
    ? (ratedVisits.reduce((sum, r) => sum + (r.service?.rating ?? 0), 0) / ratedVisits.length).toFixed(1)
    : '—'

  const shareLocation = async (service: ServiceRecord) => {
    setSharing(service.id)
    const pos = await currentCoords()
    if (!pos) {
      setSharing(null)
      toast('Location access was not granted. Allow location in your browser so the technician can navigate to you.', 'error')
      return
    }
    updateService(service.id, {
      customerLat: pos.lat,
      customerLng: pos.lng,
      locationSharedAt: new Date().toISOString(),
    })
    setSharing(null)
    toast('Exact location shared — your technician can now navigate straight to you.')
  }

  const removeLocation = (service: ServiceRecord) => {
    updateService(service.id, { customerLat: null, customerLng: null, locationSharedAt: null })
    toast('Shared location removed.')
  }

  const columns: Array<Column<SvcRow>> = [
    {
      key: 'date',
      header: 'Date',
      render: (r) => formatDate(r.amc?.startDate ?? r.service?.date ?? ''),
    },
    {
      key: 'service',
      header: 'Service',
      render: (r) => (
        <span>
          <span className="block font-medium text-slate-800">{r.amc?.serviceType ?? r.service?.serviceType}</span>
          <Badge tone={r.kind === 'amc' ? 'brand' : 'neutral'}>{r.kind === 'amc' ? 'Contract' : 'Visit'}</Badge>
        </span>
      ),
    },
    {
      key: 'record',
      header: 'Record',
      // Only visits have a record to open. Leads to photos, parts fitted and
      // the sign-off, which is the part of a service visit a customer actually
      // wants to look at.
      render: (r) =>
        r.kind === 'visit' && r.service ? (
          <Link to={`/portal/visits/${r.service.id}`} className="text-xs font-medium text-brand-700 hover:underline">
            View visit record
          </Link>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    { key: 'technician', header: 'Technician', render: (r) => (r.service ? r.service.technician : <span className="text-slate-400">On schedule</span>) },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (r.amc ? <StatusBadge kind="amc" value={r.amc.status} /> : <StatusBadge kind="service" value={r.service?.status ?? 'Scheduled'} />),
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (r) => {
        if (!r.service) return <span className="text-slate-300">—</span>
        if (r.service.rating) {
          return (
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
              <Badge tone="success">{r.service.rating} / 5</Badge>
            </span>
          )
        }
        if (r.service.status !== 'Completed') return <span className="text-slate-300">—</span>
        return <RateVisit service={r.service} onRate={(n) => { rateService(r.service!.id, n); toast('Thanks — your satisfaction rating was recorded.') }} />
      },
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (r) => (
        <span className="block max-w-[220px] truncate text-xs text-slate-500">
          {r.amc ? `AMC renews ${formatDate(r.amc.endDate)} · ₹${r.amc.amount.toLocaleString('en-IN')}` : (r.service?.notes || '—')}
        </span>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (r) => {
        if (r.kind !== 'visit' || !r.service) return <span className="text-slate-300">—</span>
        const active = r.service.status === 'Scheduled' || r.service.status === 'In Progress'
        const shared = r.service.customerLat != null && r.service.customerLng != null
        if (!active) return <span className="text-slate-300">—</span>
        if (shared) {
          return (
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Location shared
              </span>
              <button
                onClick={() => removeLocation(r.service!)}
                className="inline-flex items-center gap-0.5 text-xs text-slate-400 hover:text-red-600"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            </span>
          )
        }
        return (
          <Button
            size="sm"
            variant="outline"
            icon={<LocateFixed className="h-3.5 w-3.5" />}
            loading={sharing === r.service.id}
            onClick={() => shareLocation(r.service!)}
          >
            Share exact location
          </Button>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="My Services"
        subtitle="Your maintenance contracts and the service visits scheduled for them."
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active Contracts" value={myAmcs.filter((a) => a.status === 'Active').length} sub="from your AMC" icon={FileText} tone="brand" />
        <StatCard label="Service Visits" value={rows.filter((r) => r.kind === 'visit').length} icon={Wrench} tone="brand" />
        <StatCard label="Average Rating" value={avgRating} sub="from rated visits" tone="brand" />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-card">
          <EmptyState title="No services" description="Your maintenance contracts and scheduled service visits will appear here." />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-card">
          <DataTable columns={columns} data={rows} rowKey={(r) => r.key} />
        </div>
      )}
    </div>
  )
}