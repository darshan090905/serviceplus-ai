import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Star, MapPin } from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { AIAnalysisPanel } from '../../components/complaints/AIAnalysisPanel'
import { ComplaintChat } from '../../components/complaints/ComplaintChat'
import { LocationMap } from '../../components/maps/LocationMap'
import { useToast } from '../../components/ui/Toast'
import { formatDate } from '../../utils/dates'
import { currentCoords, reverseGeocode } from '../../utils/geo'
import { cn } from '../../utils/cn'

export function PortalComplaintDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { session, complaints, rateComplaint, updateComplaint } = useAppStore()
  const { toast } = useToast()
  const complaint = complaints.find((c) => c.id === id)
  const isMine = complaint && complaint.customerId === session?.customerId

  const [hovered, setHovered] = useState(0)
  const [selected, setSelected] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [sharing, setSharing] = useState(false)

  if (!isMine) {
    return (
      <div>
        <Link to="/portal/complaints" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Back to my complaints
        </Link>
        <Card className="p-10"><EmptyState title="Complaint not found" description="This complaint is not on your account." /></Card>
      </div>
    )
  }

  const resolved = complaint.status === 'Resolved' || complaint.status === 'Closed'

  const submitRating = () => {
    rateComplaint(complaint.id, selected, feedback.trim() ? feedback.trim() : undefined)
    toast(`Thanks for your feedback (${selected}/5).`)
  }

  // Sharing had only ever been possible at complaint-creation time, and only if
  // the customer happened to tap "use GPS". Deny the permission, dismiss the
  // prompt, or raise the complaint from a desktop and the complaint is created
  // with no coordinates at all — and this page then said "you did not share an
  // exact location" while offering no way to fix it, so the technician's screen
  // showed "Not shared" and nobody could tell why. Sharing has to be available
  // after the fact, and re-shareable for a customer who has moved.
  const shareLocation = async () => {
    setSharing(true)
    const pos = await currentCoords()
    if (!pos) {
      setSharing(false)
      toast('Location permission denied or unavailable. Allow location for this site in your browser, then try again.', 'error')
      return
    }
    const address = await reverseGeocode(pos.lat, pos.lng)
    updateComplaint(complaint.id, {
      latitude: pos.lat,
      longitude: pos.lng,
      locationSharedAt: new Date().toISOString(),
      locationAddress: address || null,
    })
    setSharing(false)
    toast('Location shared — your technician can now navigate straight to you.')
  }

  return (
    <div>
      <Link to="/portal/complaints" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Back to my complaints
      </Link>

      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">{complaint.id}</span>
          <StatusBadge kind="complaint" value={complaint.status} />
          <Badge tone={complaint.severity === 'Critical' ? 'danger' : complaint.severity === 'High' ? 'warning' : 'info'}>{complaint.severity} severity</Badge>
          {resolved && (
            <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Resolved by our team
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400">Reported {formatDate(complaint.created)} · Assigned to {complaint.assignedTo}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Your Complaint">
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
            {complaint.latitude != null && complaint.longitude != null ? (
              <div className="space-y-3">
                <p className="flex items-start gap-2 text-sm text-slate-600">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                  {complaint.locationAddress || `${complaint.latitude.toFixed(6)}, ${complaint.longitude.toFixed(6)}`}
                </p>
                <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Location shared with the technician
                </p>
                <LocationMap points={[{ lat: complaint.latitude, lng: complaint.longitude }]} className="h-48" />
                <button
                  type="button"
                  onClick={shareLocation}
                  disabled={sharing}
                  className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline disabled:opacity-60"
                >
                  {sharing ? 'Sharing…' : 'Update my location'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">You did not share an exact location for this complaint.</p>
                <button
                  type="button"
                  onClick={shareLocation}
                  disabled={sharing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  <MapPin className="h-4 w-4" aria-hidden />
                  {sharing ? 'Sharing…' : 'Share my location'}
                </button>
              </div>
            )}
          </Card>

          <Card title="Resolution">
            {complaint.resolution ? (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-emerald-800">Resolved — this is what we did</p>
                  <p className="mt-1 text-sm text-emerald-700">{complaint.resolution}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Our team is working on it. You will be notified here the moment it is resolved.
              </p>
            )}
          </Card>

          <ComplaintChat complaintId={complaint.id} />

          {resolved && (
            <Card title="How satisfied are you with the resolution?" description="Your feedback helps us improve our service.">
              {complaint.satisfaction ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={cn('h-5 w-5', s <= (complaint.satisfaction ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-200')} aria-hidden />
                      ))}
                    </span>
                    <Badge tone="success">Rated {complaint.satisfaction}/5</Badge>
                  </div>
                  {complaint.feedback && (
                    <p className="rounded-lg bg-slate-50 p-3 text-sm italic text-slate-600">“{complaint.feedback}”</p>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onMouseEnter={() => setHovered(s)}
                        onMouseLeave={() => setHovered(0)}
                        onClick={() => setSelected(s)}
                        className="rounded p-0.5 transition-transform hover:scale-110"
                        aria-label={`Rate ${s} out of 5`}
                        aria-pressed={selected === s}
                      >
                        <Star
                          className={cn('h-7 w-7', (hovered || selected) >= s ? 'fill-amber-400 text-amber-400' : 'text-slate-300')}
                          aria-hidden
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Tell us what we could have done better (optional)..."
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                    rows={3}
                  />
                  <button
                    type="button"
                    onClick={submitRating}
                    disabled={selected === 0}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Star className="h-4 w-4" aria-hidden /> Submit rating
                  </button>
                  <p className="mt-2 text-xs text-slate-400">Select a star rating, then submit alongside your feedback.</p>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <AIAnalysisPanel complaint={complaint} />
          <Card title="What happens next">
            <ol className="space-y-2.5 text-sm text-slate-600">
              <li className="flex gap-2"><span className="font-semibold text-brand-600">1.</span> Our service desk reviews your complaint.</li>
              <li className="flex gap-2"><span className="font-semibold text-brand-600">2.</span> A technician is assigned and takes action.</li>
              <li className="flex gap-2"><span className="font-semibold text-brand-600">3.</span> You will see the resolution here and can rate it.</li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}