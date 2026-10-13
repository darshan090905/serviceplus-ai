import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Star, Clock, UserCheck, Briefcase, Wrench, CheckCircle2, MapPin } from 'lucide-react'
import { useAppStore } from '../store/AppStore'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { Badge } from '../components/ui/Badge'
import { StatusBadge } from '../components/ui/StatusBadge'
import { DataTable, type Column } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { formatDate } from '../utils/dates'
import {
  formatDuration,
  serviceDurationMin,
  complaintWorkMin,
  complaintCycleMin,
  haversineKm,
  distanceLabel,
  navigateUrl,
} from '../utils/geo'
import type { Complaint, ServiceRecord } from '../types'

const T = (s: string | null | undefined) => (s ? formatDate(s) : '—')

export function TechnicianDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { services, complaints, customers, accounts } = useAppStore()
  const key = id.toLowerCase()

  const profile = useMemo(() => {
    const account = accounts.find(
      (a) => a.role === 'technician' && (a.technicianId ?? a.name).toLowerCase() === key,
    )
    const fromServices = services.find((s) => s.technician.toLowerCase() === key)
    const fromComplaints = complaints.find((c) => (c.assignedTo ?? '').toLowerCase() === key)
    const name = account?.technicianId ?? account?.name ?? fromServices?.technician ?? fromComplaints?.assignedTo ?? id
    return {
      name,
      email: account?.email,
      city: account?.city,
      status: account?.status ?? 'active',
    }
  }, [accounts, services, complaints, key, id])

  const visits = useMemo(
    () => services.filter((s) => s.technician.toLowerCase() === key),
    [services, key],
  )
  const techComplaints = useMemo(
    () =>
      complaints
        .filter((c) => (c.assignedTo ?? '').toLowerCase() === key)
        .sort((a, b) => b.created.localeCompare(a.created)),
    [complaints, key],
  )

  const metrics = useMemo(() => {
    const completed = visits.filter((s) => s.status === 'Completed')
    const serviceMinutes = visits.map(serviceDurationMin).filter((d): d is number => d != null)
    const workMinutes = techComplaints.map(complaintWorkMin).filter((d): d is number => d != null)
    const cycleMinutes = techComplaints.map(complaintCycleMin).filter((d): d is number => d != null)
    const ratedServices = completed.filter((s) => s.rating != null)
    const ratedComplaints = techComplaints.filter(
      (c) => c.satisfaction != null && (c.status === 'Resolved' || c.status === 'Closed'),
    )
    const ratingCount = ratedServices.length + ratedComplaints.length
    const avg = ratingCount
      ? (ratedServices.reduce((sum, s) => sum + (s.rating ?? 0), 0) +
          ratedComplaints.reduce((sum, c) => sum + (c.satisfaction ?? 0), 0)) /
        ratingCount
      : null
    const mean = (xs: number[]) => (xs.length ? xs.reduce((sum, d) => sum + d, 0) / xs.length : null)
    return {
      completed: completed.length,
      avgService: mean(serviceMinutes),
      avgComplaint: mean(cycleMinutes),
      totalService: serviceMinutes.reduce((sum, d) => sum + d, 0) + workMinutes.reduce((sum, d) => sum + d, 0),
      avgRating: avg,
    }
  }, [visits, techComplaints])

  const customerName = (cid: string) => customers.find((c) => c.id === cid)?.name ?? cid

  const complaintColumns: Array<Column<Complaint>> = [
    {
      key: 'id',
      header: 'Complaint',
      render: (c) => (
        <span>
          <Link to={`/complaints/${c.id}`} className="block font-medium text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
            {c.id}
          </Link>
          <span className="text-xs text-slate-400">{c.category}</span>
        </span>
      ),
    },
    { key: 'customer', header: 'Customer', render: (c) => customerName(c.customerId) },
    {
      key: 'location',
      header: 'Location',
      render: (c) =>
        c.latitude != null && c.longitude != null ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-brand-600" aria-hidden />
            <a
              href={navigateUrl(c.latitude, c.longitude)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="max-w-[180px] truncate text-xs font-medium text-brand-700 hover:underline"
              title={c.locationAddress ?? undefined}
            >
              {c.locationAddress || `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`}
            </a>
          </span>
        ) : (
          <span className="text-xs text-slate-300">Not shared</span>
        ),
    },
    { key: 'assigned', header: 'Assigned', render: (c) => T(c.assignedAt) },
    { key: 'arrived', header: 'Reached', render: (c) => T(c.arrivedAt) },
    { key: 'started', header: 'Started', render: (c) => T(c.workStartedAt) },
    { key: 'completed', header: 'Completed', render: (c) => T(c.workCompletedAt) },
    {
      key: 'work',
      header: 'Work time',
      render: (c) => {
        const d = complaintWorkMin(c)
        return d != null ? <span className="text-xs font-medium text-slate-600">{formatDuration(d)}</span> : <span className="text-slate-300">—</span>
      },
    },
    {
      key: 'arrival',
      header: 'Arrival vs pin',
      render: (c) => {
        if (c.arrivalLat == null || c.arrivalLng == null || c.latitude == null || c.longitude == null) {
          return <span className="text-slate-300">—</span>
        }
        const km = haversineKm({ lat: c.arrivalLat, lng: c.arrivalLng }, { lat: c.latitude, lng: c.longitude })
        return <span className="text-xs font-medium text-slate-600">{distanceLabel(km)}</span>
      },
    },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge kind="complaint" value={c.status} /> },
    {
      key: 'satisfaction',
      header: 'Satisfaction',
      render: (c) =>
        c.satisfaction != null ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
            {c.satisfaction}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
  ]

  const visitColumns: Array<Column<ServiceRecord>> = [
    { key: 'date', header: 'Date', render: (s) => formatDate(s.date) },
    { key: 'customer', header: 'Customer', render: (s) => customerName(s.customerId) },
    { key: 'service', header: 'Service', render: (s) => <Badge tone="brand">{s.serviceType}</Badge> },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge kind="service" value={s.status} /> },
    {
      key: 'duration',
      header: 'On-site',
      render: (s) => {
        const d = serviceDurationMin(s)
        return d != null ? <span className="text-xs font-medium text-slate-600">{formatDuration(d)}</span> : <span className="text-slate-300">—</span>
      },
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (s) =>
        s.rating ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
            {s.rating}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    { key: 'notes', header: 'Notes', render: (s) => <span className="block max-w-[220px] truncate text-slate-500">{s.notes}</span> },
  ]

  return (
    <div>
      <Link to="/services" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Back to services
      </Link>

      <PageHeader
        title={profile.name}
        subtitle="Technician performance, complaint history and service visits."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={profile.status === 'active' ? 'success' : 'neutral'}>{profile.status}</Badge>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-600">
        {profile.email && (
          <a href={`mailto:${profile.email}`} className="font-medium text-brand-700 hover:underline">
            {profile.email}
          </a>
        )}
        {profile.city && <span>{profile.city}</span>}
        <span className="text-xs text-slate-400">
          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-500" aria-hidden />
          {visits.length} service visits · {techComplaints.length} complaints
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Services" value={visits.length} sub={`${metrics.completed} completed`} icon={Wrench} tone="brand" />
        <StatCard
          label="Avg Rating"
          value={metrics.avgRating != null ? metrics.avgRating.toFixed(1) : '—'}
          sub="services + complaints"
          icon={Star}
          tone="default"
        />
        <StatCard
          label="Avg time / service visit"
          value={metrics.avgService != null ? formatDuration(metrics.avgService) : '—'}
          sub="on-site duration"
          icon={Clock}
          tone="default"
        />
        <StatCard
          label="Avg time / complaint"
          value={metrics.avgComplaint != null ? formatDuration(metrics.avgComplaint) : '—'}
          sub="assigned → completed"
          icon={Briefcase}
          tone="default"
        />
      </div>

      <div className="mb-5 rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-sm text-brand-900">
        <span className="font-semibold">Total service time:</span>{' '}
        {metrics.totalService > 0 ? formatDuration(metrics.totalService) : '—'} across completed service visits and complaint work
        (all time).
      </div>

      <div className="mb-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Complaint history</h2>
        <div className="rounded-xl border border-slate-200 bg-white shadow-card">
          <DataTable
            columns={complaintColumns}
            data={techComplaints}
            rowKey={(c) => c.id}
            empty={<EmptyState title="No complaints" description="Complaints assigned to this technician will appear here." />}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <UserCheck className="h-4 w-4" aria-hidden /> Service visits
        </h2>
        <div className="rounded-xl border border-slate-200 bg-white shadow-card">
          <DataTable
            columns={visitColumns}
            data={[...visits].sort((a, b) => b.date.localeCompare(a.date))}
            rowKey={(s) => s.id}
            empty={<EmptyState title="No service visits" description="Scheduled visits for this technician will appear here." />}
          />
        </div>
      </div>
    </div>
  )
}