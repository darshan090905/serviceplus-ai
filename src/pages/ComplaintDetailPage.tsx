import { useState, useMemo, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Star, Send, ShieldCheck, MailCheck } from 'lucide-react'
import { useAppStore } from '../store/AppStore'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { Textarea } from '../components/ui/Field'
import { EmptyState } from '../components/ui/EmptyState'
import { DetailSkeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { AIAnalysisPanel } from '../components/complaints/AIAnalysisPanel'
import { ComplaintChat } from '../components/complaints/ComplaintChat'
import { ComplaintWorkTimeline, ComplaintLocationCard } from '../components/complaints/ComplaintWorkTimeline'
import { SlaBadge } from '../components/complaints/SlaBadge'
import { useToast } from '../components/ui/Toast'
import { useLoading } from '../hooks/useDebounce'
import { activeTechnicians } from '../utils/technicians'
import { formatDate } from '../utils/dates'

export function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { complaints, customers, accounts, assets, resolveComplaint, assignComplaint } = useAppStore()
  const { toast } = useToast()
  const [resolution, setResolution] = useState('')
  const [selectedTech, setSelectedTech] = useState<string>('')
  const [verificationModal, setVerificationModal] = useState<{
    open: boolean
    techName: string
    techEmail: string
    subject: string
    body: string
  } | null>(null)
  const loading = useLoading(350)

  const complaint = complaints.find((c) => c.id === id)
  const customer = complaint ? customers.find((c) => c.id === complaint.customerId) : undefined
  const technicians = useMemo(() => activeTechnicians(accounts), [accounts])

  useEffect(() => {
    if (complaint) setSelectedTech(complaint.assignedTo)
  }, [complaint?.assignedTo])

  if (loading) return <DetailSkeleton />

  if (!complaint || !customer) {
    return (
      <div>
        <Link to="/complaints" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> All complaints
        </Link>
        <Card className="p-10"><EmptyState title="Complaint not found" /></Card>
      </div>
    )
  }

  const isOpen = complaint.status === 'Open' || complaint.status === 'In Progress'
  const hoursOld = Math.round((Date.now() - new Date(complaint.created).getTime()) / 3_600_000)

  const markResolved = () => {
    if (!resolution.trim()) return
    resolveComplaint(complaint.id, resolution.trim())
    toast('Complaint marked as resolved — an email has been sent to the customer.')
  }

  const handleAssignAndSend = () => {
    const targetName = selectedTech || complaint.assignedTo
    const tech = technicians.find((t) => t.name === targetName || t.technicianId === targetName)
    // No invented address: a technician without an email on file simply gets the
    // in-app call + notification, so no email is ever sent to a fake recipient.
    const email = tech?.email ?? ''

    assignComplaint(complaint.id, targetName, email || undefined)

    const subject = `New problem assigned to you — ${complaint.id}`
    const body = `Hi ${targetName},\n\n${customer.name} reported a ${complaint.severity.toLowerCase()} ${complaint.category.toLowerCase()} issue:\n"${complaint.description}"\n\nPlease begin work today.`

    setVerificationModal({
      open: true,
      techName: targetName,
      techEmail: email,
      subject,
      body,
    })

    toast(
      email
        ? `Assigned to ${targetName} — notification & email dispatched!`
        : `Assigned to ${targetName} — no email on file, so only the in-app call was dispatched.`,
      email ? 'success' : 'info',
    )
  }

  return (
    <div>
      <Link to="/complaints" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> All complaints
      </Link>

      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">{complaint.id}</span>
          <StatusBadge kind="complaint" value={complaint.status} />
          <Badge tone={complaint.severity === 'Critical' ? 'critical' : complaint.severity === 'High' ? 'danger' : 'warning'}>{complaint.severity} severity</Badge>
          {isOpen && hoursOld > 48 && <Badge tone="danger">{hoursOld}h open</Badge>}
        </div>
        <Link to={`/customers/${customer.id}`}>
          <Button variant="outline">Open Customer Profile</Button>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Complaint Details">
            <div className="mb-4 space-y-2 text-sm">
              <div className="rounded-lg bg-slate-50 p-4 text-slate-700">“{complaint.description}”</div>
              <p className="text-xs text-slate-400">Reported by {customer.name} · {customer.company}</p>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div><dt className="text-slate-400">Category</dt><dd className="font-medium">{complaint.category}</dd></div>
              {complaint.serviceType && <div><dt className="text-slate-400">Service</dt><dd className="font-medium">{complaint.serviceType}</dd></div>}
              <div><dt className="text-slate-400">Machine</dt><dd className="font-medium">{complaint.assetId ? assets.find((a) => a.id === complaint.assetId)?.name ?? complaint.assetId : <span className="text-slate-400">Not specified</span>}</dd></div>
              <div><dt className="text-slate-400">Created</dt><dd className="font-medium">{formatDate(complaint.created)}</dd></div>
              <div><dt className="text-slate-400">Current Technician</dt><dd className="font-semibold text-brand-700">{complaint.assignedTo}</dd></div>
              <div><dt className="text-slate-400">Status</dt><dd><StatusBadge kind="complaint" value={complaint.status} /></dd></div>
              <div><dt className="text-slate-400">Severity</dt><dd className="font-medium">{complaint.severity}</dd></div>
            </dl>

            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">SLA</p>
              <SlaBadge complaint={complaint} variant="full" />
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-slate-400">Respond by</dt>
                  <dd className="font-medium text-slate-700">
                    {complaint.slaRespondBy ? formatDate(complaint.slaRespondBy) : <span className="text-slate-400">Not tracked</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">First response</dt>
                  <dd className="font-medium text-slate-700">
                    {complaint.respondedAt ? formatDate(complaint.respondedAt) : <span className="text-amber-700">Awaiting assignment</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Resolve by</dt>
                  <dd className="font-medium text-slate-700">
                    {complaint.slaResolveBy ? formatDate(complaint.slaResolveBy) : <span className="text-slate-400">Not tracked</span>}
                  </dd>
                </div>
              </dl>
            </div>

            {isOpen && technicians.length > 0 && (
              <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-brand-900">
                      Assign Technician & Dispatch Email
                    </label>
                    <p className="text-xs text-brand-700">
                      Select technician and click the button to confirm assignment and send notification email.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Assign technician"
                      value={selectedTech}
                      onChange={(e) => setSelectedTech(e.target.value)}
                      className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="" disabled>Select Technician</option>
                      {technicians.map((t) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Send className="h-3.5 w-3.5" />}
                      onClick={handleAssignAndSend}
                    >
                      Confirm & Send Email
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card title="Resolution">
            {complaint.resolution ? (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <div className="flex-1">
                  <p className="text-sm font-medium text-emerald-800">Resolved</p>
                  <p className="mt-1 text-sm text-emerald-700">{complaint.resolution}</p>
                  {complaint.satisfaction && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                      Customer rated satisfaction {complaint.satisfaction}/5
                    </p>
                  )}
                  {complaint.feedback && (
                    <p className="mt-2 rounded-lg bg-white/70 p-3 text-sm italic text-slate-700">“{complaint.feedback}”</p>
                  )}
                </div>
              </div>
            ) : isOpen ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Record how this complaint was resolved for the customer.</p>
                <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Describe the resolution..." />
                <Button icon={<CheckCircle2 className="h-4 w-4" />} disabled={!resolution.trim()} onClick={markResolved}>
                  Mark Resolved
                </Button>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No resolution recorded for this complaint.</p>
            )}
          </Card>

          <ComplaintChat complaintId={complaint.id} />
        </div>

        <div className="space-y-4">
          <ComplaintWorkTimeline complaint={complaint} />
          <ComplaintLocationCard complaint={complaint} />
          <AIAnalysisPanel complaint={complaint} />
        </div>
      </div>

      {verificationModal && (
        <Modal
          open={verificationModal.open}
          onClose={() => setVerificationModal(null)}
          title="Assignment & Email Verification"
          description={
            verificationModal.techEmail
              ? 'The complaint has been assigned and an automated email alert was dispatched.'
              : 'The complaint has been assigned. This technician has no email on file, so no email was sent.'
          }
          footer={
            <Button variant="primary" onClick={() => setVerificationModal(null)}>
              Done & Verified
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <ShieldCheck className="h-7 w-7 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">Assignment Confirmed!</p>
                <p className="text-xs text-emerald-700">Complaint {complaint.id} is now assigned to {verificationModal.techName}.</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Assigned Technician:</span>
                <span className="font-semibold text-slate-900">{verificationModal.techName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Recipient Email:</span>
                {verificationModal.techEmail ? (
                  <span className="font-mono text-xs text-brand-700">{verificationModal.techEmail}</span>
                ) : (
                  <span className="text-xs font-medium text-amber-700">No email on file — add one on the Technicians page to enable email alerts.</span>
                )}
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Delivery Status:</span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <MailCheck className="h-3.5 w-3.5" /> Dispatched to Technician Inbox & Outbox
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {verificationModal.techEmail ? 'Email Dispatched' : 'Email Skipped — No Recipient Address'}
              </p>
              <p className="text-sm font-semibold text-slate-800">{verificationModal.subject}</p>
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700 font-mono">
                {verificationModal.body}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}