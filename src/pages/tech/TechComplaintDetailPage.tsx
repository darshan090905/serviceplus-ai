import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, CheckCircle2, MapPin, Navigation } from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Textarea } from '../../components/ui/Field'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { LocationMap } from '../../components/maps/LocationMap'
import { AIAnalysisPanel } from '../../components/complaints/AIAnalysisPanel'
import { ComplaintChat } from '../../components/complaints/ComplaintChat'
import { ComplaintWorkflow } from '../../components/complaints/ComplaintWorkflow'
import { ProofOfWorkPanel } from '../../components/jobs/ProofOfWork'
import { formatDate } from '../../utils/dates'
import { navigateUrl } from '../../utils/geo'
import type { Complaint } from '../../types'

export function TechComplaintDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { session, complaints, customers, resolveComplaint, ensureComplaintVisit } = useAppStore()
  const { toast } = useToast()
  const [resolving, setResolving] = useState<Complaint | null>(null)
  const [resolution, setResolution] = useState('')
  const [visitId, setVisitId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [visitError, setVisitError] = useState<string | null>(null)
  const complaint = complaints.find((c) => c.id === id)

  // The store's copy is the source of truth, but a visit created a moment ago
  // should not have to wait for a hydration round trip to reveal its panel.
  useEffect(() => {
    setVisitId(complaint?.serviceId ?? null)
  }, [complaint?.serviceId])

  const startVisit = async () => {
    if (!complaint) return
    setStarting(true)
    setVisitError(null)
    try {
      const created = await ensureComplaintVisit(complaint.id)
      if (created) {
        setVisitId(created)
        toast(`Visit ${created} opened — add photos, parts and sign-off below.`)
      } else {
        setVisitError('This complaint has no customer on it, so there is no visit to attach evidence to.')
      }
    } catch {
      setVisitError('Could not open a visit record. Check your connection and try again.')
    } finally {
      setStarting(false)
    }
  }

  const mine =
    complaint &&
    !!session &&
    (complaint.assignedTo === session.name ||
      complaint.assignedTo === session.technicianId ||
      complaint.assignedTo?.toLowerCase() === session.name?.toLowerCase())

  if (!complaint || !mine) {
    return (
      <div>
        <Link to="/tech/complaints" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Back to assigned complaints
        </Link>
        <Card className="p-10">
          <EmptyState title="Complaint not found" description="This complaint is not assigned to you." />
        </Card>
      </div>
    )
  }

  const resolved = complaint.status === 'Resolved' || complaint.status === 'Closed'
  const customerName = customers.find((c) => c.id === complaint.customerId)?.name ?? complaint.customerId
  const hasLocation = complaint.latitude != null && complaint.longitude != null

  const confirmResolve = () => {
    if (!resolving || !resolution.trim()) return
    resolveComplaint(resolving.id, resolution.trim())
    toast(`Complaint ${resolving.id} resolved — the customer has been notified by email.`)
    setResolving(null)
    setResolution('')
  }

  return (
    <div>
      <Link to="/tech/complaints" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Back to assigned complaints
      </Link>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">{complaint.id}</span>
          <StatusBadge kind="complaint" value={complaint.status} />
          <Badge tone={complaint.severity === 'Critical' ? 'danger' : complaint.severity === 'High' ? 'warning' : 'info'}>
            {complaint.severity} severity
          </Badge>
          {resolved && (
            <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Resolved
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400">Customer {customerName} · Assigned to you</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Complaint">
            <div className="rounded-lg bg-slate-50 p-4 text-slate-700">“{complaint.description}”</div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div><dt className="text-slate-400">Category</dt><dd className="font-medium">{complaint.category}</dd></div>
              {complaint.serviceType && <div><dt className="text-slate-400">Service</dt><dd className="font-medium">{complaint.serviceType}</dd></div>}
              <div><dt className="text-slate-400">Severity</dt><dd className="font-medium">{complaint.severity}</dd></div>
              <div><dt className="text-slate-400">Created</dt><dd className="font-medium">{formatDate(complaint.created)}</dd></div>
              <div><dt className="text-slate-400">Status</dt><dd><StatusBadge kind="complaint" value={complaint.status} /></dd></div>
            </dl>
          </Card>

          <Card title="Service location">
            {hasLocation ? (
              <div className="space-y-3">
                <p className="flex items-start gap-2 text-sm text-slate-600">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                  {complaint.locationAddress || `Customer shared the pin at ${complaint.latitude!.toFixed(6)}, ${complaint.longitude!.toFixed(6)}.`}
                </p>
                <LocationMap points={[{ lat: complaint.latitude!, lng: complaint.longitude! }]} className="h-56" />
                <a
                  href={navigateUrl(complaint.latitude!, complaint.longitude!)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
                >
                  <Navigation className="h-4 w-4" aria-hidden /> Get Route on Google Maps
                </a>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                The customer did not share an exact location for this complaint. Reach out to them for the address.
              </p>
            )}
          </Card>

          <Card title="Resolution">
            {complaint.resolution ? (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-emerald-800">Resolved</p>
                  <p className="mt-1 text-sm text-emerald-700">{complaint.resolution}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No resolution recorded yet for this complaint.</p>
            )}
          </Card>

          {complaint.feedback && (
            <Card title="Customer feedback">
              <p className="rounded-lg bg-slate-50 p-3 text-sm italic text-slate-600">“{complaint.feedback}”</p>
            </Card>
          )}

          {/* Evidence is reachable from the complaint itself, not only from the
              scheduled visit. A complaint is where a technician actually is when
              the job is done: making them navigate back to the schedule to find
              the row meant the proof was often never taken at all. */}
          <Card
            title="Proof of work"
            actions={
              visitId ? (
                <Link
                  to={`/tech/jobs?service=${visitId}`}
                  className="text-xs font-medium text-brand-700 hover:underline"
                >
                  View on schedule
                </Link>
              ) : null
            }
          >
            {visitId ? (
              <ProofOfWorkPanel serviceId={visitId} takenBy={complaint.assignedTo ?? ''} />
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-500">
                  Photos, parts and the customer's signature for this complaint. A visit record
                  will be opened for it the first time you add something here.
                </p>
                <Button icon={<Camera className="h-4 w-4" />} disabled={starting} onClick={startVisit}>
                  {starting ? 'Opening visit…' : 'Add proof of work'}
                </Button>
                {visitError && <p className="mt-2 text-xs text-red-600">{visitError}</p>}
              </>
            )}
          </Card>

          <ComplaintChat complaintId={complaint.id} />
        </div>

        <div className="space-y-4">
          <Card title="Actions">
            <ComplaintWorkflow
              complaint={complaint}
              onResolve={(c) => {
                setResolution('')
                setResolving(c)
              }}
            />
            <p className="mt-3 text-xs text-slate-400">
              Record your arrival, start work, then complete the complaint once the job is done.
            </p>
          </Card>
          <AIAnalysisPanel complaint={complaint} />
        </div>
      </div>

      <Modal
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title={`Complete ${resolving?.id ?? ''}`}
        description={resolving ? `${customerName} · ${resolving.category}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setResolving(null)}>Cancel</Button>
            <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} disabled={!resolution.trim()} onClick={confirmResolve}>
              Confirm completion
            </Button>
          </>
        }
      >
        <Textarea
          label="Work summary"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="Describe what was fixed and how..."
        />
        <p className="mt-2 text-xs text-slate-400">The customer is notified by email and can rate their satisfaction afterwards.</p>
      </Modal>
    </div>
  )
}