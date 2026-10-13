import { useState } from 'react'
import { CheckCircle2, Clock, MapPin, Navigation, Phone } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { useAppStore } from '../../store/AppStore'
import { LocationMap } from '../maps/LocationMap'
import {
  complaintWorkMin,
  complaintCycleMin,
  formatDuration,
  haversineKm,
  distanceLabel,
  navigateUrl,
  serviceDurationMin,
} from '../../utils/geo'
import { formatDate } from '../../utils/dates'
import type { Complaint, ServiceRecord } from '../../types'

// Admin-only work timeline: assignment → arrival → work start → work complete
// → resolution, with the arrival-to-customer proximity note. Technicians never
// see this card.
export function ComplaintWorkTimeline({ complaint }: { complaint: Complaint }) {
  const steps: Array<{ label: string; at?: string | null }> = [
    { label: 'Assigned to technician', at: complaint.assignedAt },
    { label: 'Technician reached location', at: complaint.arrivedAt },
    { label: 'Work started', at: complaint.workStartedAt },
    { label: 'Work completed', at: complaint.workCompletedAt },
    { label: 'Complaint resolved', at: complaint.resolvedAt },
  ]
  const recorded = steps.filter((s) => s.at)

  const work = complaintWorkMin(complaint)
  const cycle = complaintCycleMin(complaint)
  const arrivalDistance =
    complaint.arrivalLat != null && complaint.arrivalLng != null && complaint.latitude != null && complaint.longitude != null
      ? haversineKm(
          { lat: complaint.arrivalLat, lng: complaint.arrivalLng },
          { lat: complaint.latitude, lng: complaint.longitude },
        )
      : null

  return (
    <Card title="Work timeline" description="Internal · visible to admin only">
      {recorded.length === 0 ? (
        <p className="text-sm text-slate-400">No timeline recorded yet — steps appear as the technician works the complaint.</p>
      ) : (
        <ol className="space-y-3">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  s.at ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-300'
                }`}
              >
                {s.at ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full bg-current" />}
              </span>
              <div>
                <p className={`text-sm ${s.at ? 'font-medium text-slate-800' : 'text-slate-400'}`}>{s.label}</p>
                {s.at && <p className="text-xs text-slate-400">{formatDateTime(s.at)}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {(work != null || cycle != null) && (
        <dl className="mt-4 grid grid-cols-2 gap-3">
          {work != null && (
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-xs text-slate-400">On-site work time</dt>
              <dd className="text-sm font-semibold text-slate-800">{formatDuration(work)}</dd>
            </div>
          )}
          {cycle != null && (
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-xs text-slate-400">Assigned → completed</dt>
              <dd className="text-sm font-semibold text-slate-800">{formatDuration(cycle)}</dd>
            </div>
          )}
        </dl>
      )}

      {arrivalDistance != null && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Technician arrived {distanceLabel(arrivalDistance)} from the customer pin.
        </p>
      )}
    </Card>
  )
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${formatDate(iso)} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

// Customer-shared location card for the admin complaint view: pin, address, map,
// a one-click route link, and the arrival-proximity note.
export function ComplaintLocationCard({ complaint }: { complaint: Complaint }) {
  const { customers } = useAppStore()
  const [showMap, setShowMap] = useState(true)
  const customer = customers.find((c) => c.id === complaint.customerId)
  const hasLocation = complaint.latitude != null && complaint.longitude != null

  if (!hasLocation) {
    return (
      <Card title="Service location">
        <p className="text-sm text-slate-500">
          {customer ? `${customer.name} did not share an exact location for this complaint.` : 'No exact location shared for this complaint.'}
          {customer && (
            <span className="mt-1 block text-xs text-slate-400">
              {customer.address}, {customer.city}
            </span>
          )}
        </p>
      </Card>
    )
  }

  return (
    <Card
      title="Customer location"
      description="Shared at complaint creation"
      actions={
        <Button size="sm" variant="outline" onClick={() => setShowMap((v) => !v)}>
          {showMap ? 'Hide map' : 'Show map'}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-slate-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          {complaint.locationAddress || `${complaint.latitude!.toFixed(6)}, ${complaint.longitude!.toFixed(6)}`}
        </p>
        {showMap && <LocationMap points={[{ lat: complaint.latitude!, lng: complaint.longitude! }]} className="h-56" />}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={navigateUrl(complaint.latitude!, complaint.longitude!)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
          >
            <Navigation className="h-4 w-4" aria-hidden /> Get Route
          </a>
          {customer && customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Phone className="h-4 w-4" aria-hidden /> Call customer
            </a>
          )}
        </div>
      </div>
    </Card>
  )
}

export function TechnicianServiceTotal({ visits }: { visits: ServiceRecord[] }) {
  const total = visits.reduce((sum, v) => sum + (serviceDurationMin(v) ?? 0), 0)
  if (total === 0) return null
  return (
    <p className="flex items-center gap-1.5 text-xs text-slate-400">
      <Clock className="h-3.5 w-3.5" aria-hidden /> {formatDuration(total)} total on-site
    </p>
  )
}
