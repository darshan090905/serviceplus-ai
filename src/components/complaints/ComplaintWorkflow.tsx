import { Footprints, PlayCircle, MapPin, Navigation, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'
import { currentCoords, navigateUrl } from '../../utils/geo'
import type { Complaint } from '../../types'

interface ComplaintWorkflowProps {
  complaint: Complaint
  onResolve: (c: Complaint) => void
}

// Technician-facing workflow: Reached location → Start work → Complete work.
// Deliberately shows no timings or durations — those are admin-only metrics.
export function ComplaintWorkflow({ complaint, onResolve }: ComplaintWorkflowProps) {
  const { updateComplaint } = useAppStore()
  const { toast } = useToast()

  const recordArrival = () => {
    void (async () => {
      const gps = await currentCoords()
      updateComplaint(complaint.id, {
        arrivedAt: new Date().toISOString(),
        arrivalLat: gps ? gps.lat : null,
        arrivalLng: gps ? gps.lng : null,
      })
      toast('Arrival recorded — you can now start work.', 'success')
    })()
  }

  const startWork = () => {
    updateComplaint(complaint.id, { status: 'In Progress', workStartedAt: new Date().toISOString() })
    toast(`Started work on ${complaint.id}.`, 'success')
  }

  const reached = complaint.arrivedAt != null
  const started = complaint.workStartedAt != null

  if (complaint.status === 'Open' || complaint.status === 'In Progress') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {complaint.latitude != null && complaint.longitude != null && (
          <a
            href={navigateUrl(complaint.latitude, complaint.longitude)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Navigation className="h-4 w-4 text-brand-600" aria-hidden /> Get Route
          </a>
        )}
        {!reached && (
          <Button variant="outline" icon={<Footprints className="h-4 w-4" />} onClick={recordArrival}>
            I've reached location
          </Button>
        )}
        {reached && !started && (
          <Button variant="outline" icon={<PlayCircle className="h-4 w-4" />} onClick={startWork}>
            Start work
          </Button>
        )}
        {started && (
          <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => onResolve(complaint)}>
            Complete work
          </Button>
        )}
      </div>
    )
  }

  return null
}

// Compact status chips used in list rows: whether the customer shared a
// location, and whether the technician has arrived / started / completed.
export function ComplaintLocationChips({ complaint }: { complaint: Complaint }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {complaint.latitude != null && complaint.longitude != null && (
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
          <MapPin className="h-3 w-3" aria-hidden /> Location shared
        </span>
      )}
      {complaint.arrivedAt != null && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          <Footprints className="h-3 w-3" aria-hidden /> Reached location
        </span>
      )}
      {complaint.workStartedAt != null && complaint.status !== 'Resolved' && complaint.status !== 'Closed' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          <PlayCircle className="h-3 w-3" aria-hidden /> Work in progress
        </span>
      )}
    </div>
  )
}