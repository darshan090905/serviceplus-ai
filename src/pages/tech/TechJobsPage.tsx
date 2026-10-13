import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, ExternalLink, LocateFixed, MapPin, MessageSquare, Navigation, PenLine } from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { Card } from '../../components/ui/Card'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Textarea } from '../../components/ui/Field'
import { EmptyState } from '../../components/ui/EmptyState'
import { ProofOfWorkPanel } from '../../components/jobs/ProofOfWork'
import { useToast } from '../../components/ui/Toast'
import { isAssignedTo } from '../../utils/technicians'
import { formatShortDate } from '../../utils/dates'
import { currentCoords, distanceLabel, formatDuration, geocode, haversineKm, mapsUrl, serviceDurationMin, type GeoPoint } from '../../utils/geo'
import type { ServiceRecord, Complaint, Customer } from '../../types'

interface JobRow {
  key: string
  kind: 'service' | 'complaint'
  service?: ServiceRecord
  complaint?: Complaint
}

export function TechJobsPage() {
  const { session, services, complaints, customers, updateService, updateComplaint } = useAppStore()
  const { toast } = useToast()
  const myName = session?.name ?? ''
  const me = session?.technicianId ?? ''
  const [completing, setCompleting] = useState<ServiceRecord | null>(null)
  const [proofFor, setProofFor] = useState<ServiceRecord | null>(null)
  const [resolving, setResolving] = useState<Complaint | null>(null)
  const [notes, setNotes] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const [siteGeo, setSiteGeo] = useState<GeoPoint | null>(null)
  const [techPos, setTechPos] = useState<GeoPoint | null>(null)

  // Repaint the live "on site" timer every 30s.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const meIdentity = { technicianId: me, name: myName }
  const isMine = (assigned: string | null | undefined) => isAssignedTo(assigned, meIdentity)

  const jobs = useMemo<JobRow[]>(() => {
    const serviceJobs: JobRow[] = services
      .filter((s) => isMine(s.technicianId ?? s.technician))
      .map((service) => ({ key: `svc-${service.id}`, kind: 'service', service }))
    const complaintJobs: JobRow[] = complaints
      .filter((c) => isMine(c.assignedToId ?? c.assignedTo))
      .map((complaint) => ({ key: `cmp-${complaint.id}`, kind: 'complaint', complaint }))
    return [...serviceJobs, ...complaintJobs].sort((a, b) => {
      const da = a.service?.date ?? a.complaint?.created ?? ''
      const db = b.service?.date ?? b.complaint?.created ?? ''
      return db.localeCompare(da)
    })
  }, [services, complaints, myName, me])

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers])
  const customerFor = (id: string): Customer | undefined => customerById.get(id)

  // Historical average on-site time per (customer, service type) so scheduled
  // visits can estimate how long the technician will stay.
  const avgDuration = useMemo(() => {
    const buckets = new Map<string, number[]>()
    for (const s of services) {
      if (s.status !== 'Completed') continue
      const min = serviceDurationMin(s)
      if (min == null) continue
      const key = `${s.customerId}|${s.serviceType}`
      const list = buckets.get(key)
      if (list) list.push(min)
      else buckets.set(key, [min])
    }
    const out = new Map<string, number>()
    for (const [key, list] of buckets) out.set(key, list.reduce((a, b) => a + b, 0) / list.length)
    return out
  }, [services])

  const estimateFor = (customerId: string, serviceType: string): number | null =>
    avgDuration.get(`${customerId}|${serviceType}`) ?? null

  const pending = useMemo(
    () =>
      jobs.filter((j) =>
        j.kind === 'service'
          ? j.service?.status === 'Scheduled' || j.service?.status === 'In Progress'
          : j.complaint?.status === 'Open' || j.complaint?.status === 'In Progress',
      ).length,
    [jobs],
  )
  const completed = useMemo(
    () =>
      jobs.filter((j) =>
        j.kind === 'service'
          ? j.service?.status === 'Completed'
          : j.complaint?.status === 'Resolved' || j.complaint?.status === 'Closed',
      ).length,
    [jobs],
  )

  const customerName = (id: string) => customerFor(id)?.name ?? id

  const checkIn = async (job: ServiceRecord) => {
    const pos = await currentCoords()
    const now = new Date().toISOString()
    const patch: Partial<ServiceRecord> = {
      status: 'In Progress',
      date: now.slice(0, 10),
      checkInAt: now,
    }
    if (pos) {
      patch.arrivedLat = pos.lat
      patch.arrivedLng = pos.lng
    }
    updateService(job.id, patch)
    toast(pos ? 'Checked in — your on-site location was recorded.' : 'Checked in (location denied — time only).')
  }

  const completeJob = () => {
    if (!completing) return
    const now = new Date().toISOString()
    updateService(completing.id, {
      status: 'Completed',
      notes: notes.trim() || completing.notes,
      date: now.slice(0, 10),
      checkOutAt: completing.checkInAt ? now : completing.checkOutAt,
    })
    toast('Service marked as completed. The customer has been notified.')
    setCompleting(null)
    setNotes('')
  }

  const resolveComplaint = () => {
    if (!resolving) return
    updateComplaint(resolving.id, { status: 'Resolved', resolution: notes.trim() || 'Resolved by technician.' })
    toast('Complaint marked as resolved.')
    setResolving(null)
    setNotes('')
  }

  const focus = useMemo(() => jobs.find((j) => j.key === focusId) ?? null, [jobs, focusId])
  const focusService = focus?.kind === 'service' ? focus.service : undefined
  const focusCustomer = focusService ? customerFor(focusService.customerId) : undefined

  // When a job is focused, geocode the site address and grab the technician's
  // live position so we can show distance to the site / pinned location.
  useEffect(() => {
    setSiteGeo(null)
    setTechPos(null)
    if (!focusService) return
    let cancelled = false
    const resolve = async () => {
      const cust = customerById.get(focusService.customerId)
      if (cust) {
        const g = await geocode(`${cust.address}, ${cust.city}`)
        if (!cancelled) setSiteGeo(g)
      }
      const pos = await currentCoords()
      if (!cancelled) setTechPos(pos)
    }
    void resolve()
    return () => {
      cancelled = true
    }
    // Re-run only when the focused job changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, customerById])

  const focusPin: GeoPoint | null =
    focusService && focusService.customerLat != null && focusService.customerLng != null
      ? { lat: focusService.customerLat, lng: focusService.customerLng }
      : null
  const focusSite = focusPin ?? siteGeo
  const focusDistKm = techPos && focusSite ? haversineKm(techPos, focusSite) : null
  const focusElapsed = focusService
    ? focusService.status === 'In Progress' && focusService.checkInAt
      ? (Date.now() - Date.parse(focusService.checkInAt)) / 60000
      : serviceDurationMin(focusService)
    : null
  const focusEstimate = focusService ? estimateFor(focusService.customerId, focusService.serviceType) : null

  const refreshPosition = async () => {
    const pos = await currentCoords()
    setTechPos(pos)
    toast(pos ? 'Your live position was updated.' : 'Location could not be read. Check browser permission.')
  }

  const columns: Array<Column<JobRow>> = [
    {
      key: 'id',
      header: 'Job',
      render: (j) => (
        <span>
          <span className="block font-medium text-slate-900">{j.service?.id ?? j.complaint?.id}</span>
          <Badge tone={j.kind === 'service' ? (j.service?.status === 'In Progress' ? 'warning' : 'brand') : 'warning'}>
            {j.kind === 'service' ? (j.service?.status === 'In Progress' ? 'On site' : 'Visit') : 'Complaint'}
          </Badge>
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (j) => (
        <span>
          <span className="block font-medium text-slate-800">{customerName(j.service?.customerId ?? j.complaint?.customerId ?? '')}</span>
          <span className="block text-xs text-slate-400">{j.service?.serviceType ?? j.complaint?.category}</span>
        </span>
      ),
    },
    { key: 'date', header: 'Date', render: (j) => formatShortDate(j.service?.date ?? j.complaint?.created ?? '') },
    {
      key: 'location',
      header: 'Location',
      render: (j) => {
        if (j.kind !== 'service' || !j.service) return <span className="text-slate-300">—</span>
        const cust = customerFor(j.service.customerId)
        if (!cust) return <span className="text-slate-300">—</span>
        const pinned = j.service.customerLat != null && j.service.customerLng != null
        const href = pinned
          ? mapsUrl(`${j.service.customerLat},${j.service.customerLng}`)
          : mapsUrl(`${cust.address}, ${cust.city}`)
        return (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-600" />
            <span className="max-w-[150px] truncate text-slate-600">{pinned ? 'Pinned location' : `${cust.city}`}</span>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex text-xs text-brand-700 hover:underline"
            >
              Maps <ExternalLink className="ml-0.5 h-3 w-3" />
            </a>
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (j) =>
        j.kind === 'service' ? (
          <StatusBadge kind="service" value={j.service?.status ?? 'Scheduled'} />
        ) : (
          <StatusBadge kind="complaint" value={j.complaint?.status ?? 'Open'} />
        ),
    },
    {
      key: 'time',
      header: 'Time',
      render: (j) => {
        if (j.kind !== 'service' || !j.service) return <span className="text-slate-300">—</span>
        if (j.service.status === 'Scheduled') {
          const est = estimateFor(j.service.customerId, j.service.serviceType)
          return est != null ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              <Clock className="h-3 w-3" /> Est. {formatDuration(est)}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )
        }
        if (j.service.status === 'In Progress' && j.service.checkInAt) {
          const min = (Date.now() - Date.parse(j.service.checkInAt)) / 60000
          return <span className="text-xs font-semibold text-amber-600">{formatDuration(Number.isFinite(min) ? min : 0)}</span>
        }
        const d = serviceDurationMin(j.service)
        return d != null ? <span className="text-slate-600">{formatDuration(d)}</span> : <span className="text-slate-300">—</span>
      },
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (j) =>
        j.service && j.service.status === 'Completed' && j.service.rating ? (
          <span className="text-amber-500">{'★'.repeat(j.service.rating)}{'☆'.repeat(5 - j.service.rating)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'notes',
      header: 'Notes',
      className: 'max-w-[220px]',
      render: (j) => (
        <span className="block truncate text-xs text-slate-500">{j.service?.notes || j.complaint?.description}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (j) => {
        if (j.kind === 'service') {
          const s = j.service
          if (!s) return null
          return (
            <span className="flex items-center justify-end gap-2">
              {s.status === 'Completed' ? (
                <span className="text-xs text-emerald-600">Done</span>
              ) : (
                <>
                  {s.status === 'Scheduled' && (
                    <Button size="sm" variant="outline" icon={<LocateFixed className="h-3.5 w-3.5" />} onClick={() => checkIn(s)}>
                      Check In
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="success"
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setNotes('')
                      setCompleting(s)
                    }}
                  >
                    Complete
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" icon={<PenLine className="h-3.5 w-3.5" />} onClick={() => setProofFor(s)}>
                Proof
              </Button>
            </span>
          )
        }
        const c = j.complaint
        if (!c) return null
        // The View link used to be dropped along with the Resolve button once a
        // complaint was resolved, so the only way to open a complaint was to be
        // the person who resolved it — and afterwards nobody could: not the
        // technician who did the work, not the admin, not the customer replying
        // in the thread. The row still said "Done", which read as "nothing to
        // see here" rather than "this is finished, here is the record". Only the
        // action that can no longer be taken is hidden; reading the complaint,
        // its evidence and its message history never stops being valid.
        const settled = c.status === 'Resolved' || c.status === 'Closed'
        return (
          <span className="flex items-center justify-end gap-2">
            {settled && <span className="text-xs text-emerald-600">Done</span>}
            <Link to={`/tech/complaints/${c.id}`} className="text-sm text-brand-700 hover:underline">
              View
            </Link>
            {!settled && (
              <Button size="sm" variant="outline" icon={<MessageSquare className="h-3.5 w-3.5" />} onClick={() => { setNotes(''); setResolving(c) }}>
                Resolve
              </Button>
            )}
          </span>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader title="My Jobs" subtitle="Service visits and complaints assigned to you. Check in at the site, work and complete them." />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Pending" value={pending} sub="to check in or start" icon={Clock} tone="warning" />
        <StatCard label="Completed" value={completed} sub="all time" icon={CheckCircle2} tone="success" />
      </div>

      {focus && focusService && (
        <Card className="mb-5 border-brand-200 bg-brand-50/40" bodyClassName="p-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  {focusService.id} · <span className="text-brand-700">{customerName(focusService.customerId)}</span>
                </h3>
                <StatusBadge kind="service" value={focusService.status} />
              </div>
              <p className="text-xs text-slate-500">{focusService.serviceType} · {formatShortDate(focusService.date)}</p>
              {focusCustomer && (
                <p className="mt-3 text-sm text-slate-600">
                  {focusCustomer.address}, {focusCustomer.city}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {focusService.status === 'Scheduled' && (
                  <Button size="sm" variant="outline" icon={<LocateFixed className="h-4 w-4" />} onClick={() => checkIn(focusService)}>
                    Check In
                  </Button>
                )}
                {focusService.status !== 'Completed' && (
                  <Button
                    size="sm"
                    variant="success"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={() => {
                      setNotes('')
                      setCompleting(focusService)
                    }}
                  >
                    Complete
                  </Button>
                )}
                <Button size="sm" variant="outline" icon={<PenLine className="h-4 w-4" />} onClick={() => setProofFor(focusService)}>
                  Proof of work
                </Button>
                <a
                  href={focusPin ? mapsUrl(`${focusPin.lat},${focusPin.lng}`) : focusCustomer ? mapsUrl(`${focusCustomer.address}, ${focusCustomer.city}`) : '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Navigation className="h-4 w-4 text-brand-600" /> Open in Maps
                </a>
              </div>
            </div>

            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <MapPin className="h-3.5 w-3.5" /> Location
              </h4>
              {focusPin ? (
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2 text-emerald-700">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                    Customer pinned location shared
                  </p>
                  <p className="text-xs text-slate-500">
                    {focusPin.lat.toFixed(5)}, {focusPin.lng.toFixed(5)}
                  </p>
                  {focusDistKm != null ? (
                    <p className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Navigation className="h-3.5 w-3.5 text-brand-600" /> You are {distanceLabel(focusDistKm)} away
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400">
                      <button onClick={refreshPosition} className="underline hover:text-brand-700">
                        Allow location
                      </button>{' '}
                      to see your distance to the site.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2 text-sm text-slate-600">
                  <p>Customer hasn't shared their exact location yet.</p>
                  <p className="text-xs text-slate-400">
                    Suggest they tap “Share my exact location” on their Services page — you'll get a live pin here.
                  </p>
                  {focusCustomer && (
                    <p className="text-xs text-slate-500">Site address: {focusCustomer.address}, {focusCustomer.city}</p>
                  )}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Clock className="h-3.5 w-3.5" /> On-site time
              </h4>
              {focusService.status === 'In Progress' && focusElapsed != null ? (
                <div>
                  <p className="text-2xl font-bold text-amber-600">{formatDuration(focusElapsed)}</p>
                  <p className="text-xs text-slate-500">on site · checked in {new Date(focusService.checkInAt ?? '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              ) : focusService.status === 'Completed' && focusElapsed != null ? (
                <div>
                  <p className="text-2xl font-bold text-slate-900">{formatDuration(focusElapsed)}</p>
                  <p className="text-xs text-slate-500">total on-site time for this visit</p>
                </div>
              ) : (
                <div>
                  {focusEstimate != null ? (
                    <>
                      <p className="text-2xl font-bold text-slate-900">Est. {formatDuration(focusEstimate)}</p>
                      <p className="text-xs text-slate-500">average for this customer + {focusService.serviceType} from past visits</p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">No estimate yet — it appears once past visits are timed.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card bodyClassName="p-0">
        {jobs.length === 0 ? (
          <EmptyState title="No jobs assigned" description="Service visits and complaints assigned to you will appear here." />
        ) : (
          <DataTable columns={columns} data={jobs} rowKey={(j) => j.key} onRowClick={(j) => setFocusId((cur) => (cur === j.key ? null : j.key))} dense />
        )}
      </Card>

      <Modal
        open={completing !== null}
        onClose={() => setCompleting(null)}
        title="Mark service as complete"
        size="lg"
        description={completing ? `${completing.id} · ${customerName(completing.customerId)} · ${formatShortDate(completing.date)}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setCompleting(null)}>Cancel</Button>
            <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={completeJob}>Mark Completed</Button>
          </>
        }
      >
        {completing?.checkInAt && (
          <p className="mb-3 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800">
            On-site duration: {formatDuration(serviceDurationMin({ checkInAt: completing.checkInAt, checkOutAt: new Date().toISOString() }))}
          </p>
        )}
        <Textarea
          label="Work notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What was fixed / inspected?"
        />

        {completing && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Proof of work</p>
            <p className="mb-3 text-xs text-slate-400">
              Photos, parts and the customer's signature. Optional — a job can be closed without
              them, but a visit with evidence is one nobody can argue with later.
            </p>
            <ProofOfWorkPanel serviceId={completing.id} takenBy={completing.technician} compact />
          </div>
        )}

        <p className="mt-3 text-xs text-slate-400">Completing a job lets the customer rate the visit afterwards.</p>
      </Modal>

      {/*
        Reachable after the visit is closed, which the completion modal is not.
        Both of its entry points are wrapped in a `status !== 'Completed'`
        check, so once a job was completed the panel had no route back: the
        button disappeared along with the modal that was the only place it was
        mounted. Photos are often taken as the van is being packed up, or the
        phone dies on the site, and the customer's copy of the visit was then
        permanently missing its evidence with no way to add it. So this is a
        separate modal with no status gate, opened from the job card and the
        focused service alike.
      */}
      <Modal
        open={proofFor !== null}
        onClose={() => setProofFor(null)}
        title="Proof of work"
        size="lg"
        description={proofFor ? `${proofFor.id} · ${customerName(proofFor.customerId)} · ${formatShortDate(proofFor.date)}` : undefined}
        footer={<Button variant="outline" onClick={() => setProofFor(null)}>Close</Button>}
      >
        <p className="mb-3 text-xs text-slate-400">
          Photos, parts and the customer's signature. You can add or correct these at any point on
          the visit, before or after it is marked complete.
        </p>
        {proofFor && <ProofOfWorkPanel serviceId={proofFor.id} takenBy={proofFor.technician} />}
      </Modal>
      <Modal
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title="Resolve complaint"
        description={resolving ? `${resolving.id} · ${customerName(resolving.customerId)} · ${resolving.category}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setResolving(null)}>Cancel</Button>
            <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={resolveComplaint}>Mark Resolved</Button>
          </>
        }
      >
        <Textarea
          label="Resolution notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What was the fix?"
        />
        <p className="mt-2 text-xs text-slate-400">The customer will see the resolution on the portal.</p>
      </Modal>
    </div>
  )
}