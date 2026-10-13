import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, HeartHandshake } from 'lucide-react'
import type { RetentionStatus, RenewalOffer } from '../types'
import { useAppStore } from '../store/AppStore'
import { Card } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { DetailSkeleton } from '../components/ui/Skeleton'
import { ApprovalModal } from '../components/retention/ApprovalModal'
import { AIEmailGenerator } from '../components/retention/AIEmailGenerator'
import { HealthScoreCard } from '../components/customers/HealthScoreCard'
import { useToast } from '../components/ui/Toast'
import { useLoading } from '../hooks/useDebounce'
import { formatINR } from '../utils/format'
import { formatDate, daysUntil } from '../utils/dates'
import { Modal } from '../components/ui/Modal'
import { Input, Textarea } from '../components/ui/Field'

const steps: RetentionStatus[] = ['Pending', 'Approved', 'In Progress', 'Completed']

export function RetentionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { retention, customers, amcs, setRetentionStatus, setRetentionOffer } = useAppStore()
  const { toast } = useToast()
  const [approveOpen, setApproveOpen] = useState(false)
  const [offerOpen, setOfferOpen] = useState(false)
  const [offerTitle, setOfferTitle] = useState('')
  const [offerDiscount, setOfferDiscount] = useState('10')
  const [offerBenefits, setOfferBenefits] = useState('')
  const loading = useLoading(400)

  const action = retention.find((a) => a.id === id)
  const customer = action ? customers.find((c) => c.id === action.customerId) : undefined
  const amc = action ? amcs.find((a) => a.customerId === action.customerId && a.status !== 'Renewed') : undefined
  const offer = action?.renewalOffer

  const openOfferEditor = () => {
    setOfferTitle(offer?.status === 'Approved' ? offer.title : '')
    setOfferDiscount(String(offer?.status === 'Approved' ? offer.discountPercent : ''))
    setOfferBenefits(offer?.status === 'Approved' ? offer.benefits.join('\n') : '')
    setOfferOpen(true)
  }

  const saveOffer = () => {
    if (!action || !amc || !offerTitle.trim()) return
    const discountPercent = Math.max(0, Math.min(100, Number(offerDiscount) || 0))
    const benefits = offerBenefits.split('\n').map((benefit) => benefit.trim()).filter(Boolean)
    const nextOffer: RenewalOffer = { title: offerTitle.trim(), discountPercent, benefits, status: 'Approved' }
    setRetentionOffer(action.id, nextOffer)
    setOfferOpen(false)
    toast('Renewal offer approved and ready to share with the customer.')
  }

  const declineOffer = () => {
    if (!action) return
    setRetentionOffer(action.id, { title: 'No renewal offer', discountPercent: 0, benefits: [], status: 'Declined' })
    toast('Renewal offer declined. The action can continue without a discount.')
  }

  if (loading) return <DetailSkeleton />

  if (!action || !customer) {
    return (
      <div>
        <Link to="/retention" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Retention Center
        </Link>
        <Card className="p-10"><EmptyState title="Retention action not found" /></Card>
      </div>
    )
  }

  const stepIndex = action.status === 'Rejected' ? -1 : steps.indexOf(action.status)
  const statusFlow = (status: RetentionStatus) => {
    setRetentionStatus(action.id, status)
    if (status === 'Approved') return
    toast(
      status === 'In Progress'
        ? 'Retention action started.'
        : status === 'Completed'
          ? 'Retention action completed.'
          : 'Retention action rejected.',
    )
  }

  return (
    <div>
      <Link to="/retention" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Retention Center
      </Link>

      <div className="mb-5 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
            <StatusBadge kind="risk" value={customer.health.level} />
            <StatusBadge kind="retention" value={action.status} />
            <Badge tone="brand">Priority #{action.priority}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{action.primaryRisk} · Recommended: {action.recommendedAction}</p>
        </div>
        <Link to={`/customers/${customer.id}`}>
          <Button variant="outline">Customer Profile</Button>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <HealthScoreCard health={customer.health} />
          <Card title="Action Workflow">
            {action.status === 'Rejected' ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                This action was rejected by the owner.
              </div>
            ) : (
              <ol className="space-y-3">
                {steps.map((step, i) => {
                  const done = i < stepIndex
                  const current = i === stepIndex
                  return (
                    <li key={step} className="flex items-center gap-3">
                      <span
                        className={
                          done
                            ? 'flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white'
                            : current
                              ? 'flex h-6 w-6 items-center justify-center rounded-full border-2 border-brand-600 bg-white'
                              : 'flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-200 bg-white'
                        }
                      >
                        {done && <Check className="h-3.5 w-3.5" aria-hidden />}
                        {current && <span className="h-2 w-2 rounded-full bg-brand-600" aria-hidden />}
                      </span>
                      <span className={done || current ? 'font-medium text-slate-800' : 'text-slate-400'}>{step}</span>
                    </li>
                  )
                })}
              </ol>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {action.status === 'Pending' && (
                <>
                  <Button onClick={() => setApproveOpen(true)}>Approve Action</Button>
                  <Button variant="outline" onClick={() => statusFlow('Rejected')}>Reject</Button>
                </>
              )}
              {action.status === 'Approved' && (
                <>
                  <Button onClick={() => statusFlow('In Progress')}>Mark In Progress</Button>
                  <Button variant="ghost" onClick={() => statusFlow('Rejected')}>Reject</Button>
                </>
              )}
              {action.status === 'In Progress' && <Button onClick={() => statusFlow('Completed')}>Mark Completed</Button>}
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card title="Retention Details">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <div><dt className="text-slate-400">Health Score</dt><dd className="text-lg font-bold text-slate-900">{customer.health.score} / 100</dd></div>
              <div><dt className="text-slate-400">Risk Level</dt><dd><StatusBadge kind="risk" value={customer.health.level} /></dd></div>
              <div><dt className="text-slate-400">AMC Expiry</dt><dd className="font-medium">{amc ? `${formatDate(amc.endDate)} (${daysUntil(amc.endDate) > 0 ? `${daysUntil(amc.endDate)} days` : 'expired'})` : '—'}</dd></div>
              <div><dt className="text-slate-400">Revenue at Risk</dt><dd className="font-semibold text-slate-900">{formatINR(action.revenueAtRisk)}</dd></div>
              <div><dt className="text-slate-400">Primary Reason</dt><dd><Badge tone={action.primaryRisk === 'Service Quality' ? 'danger' : action.primaryRisk === 'Payment' ? 'warning' : 'info'}>{action.primaryRisk}</Badge></dd></div>
              <div><dt className="text-slate-400">Owner</dt><dd className="font-medium">{action.owner}</dd></div>
            </dl>
          </Card>

          <Card title="Risk Factors">
            <ul className="space-y-2">
              {customer.health.factors.map((f, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{f.label}</span>
                  <Badge tone={f.points >= 0 ? 'success' : 'danger'}>
                    {f.points >= 0 ? '+' : ''}{f.points}
                  </Badge>
                </li>
              ))}
              {customer.health.factors.length === 0 && <li className="text-sm text-slate-400">No negative signals.</li>}
            </ul>
          </Card>

          <Card title="Recommended Action">
            <p className="text-lg font-semibold text-slate-900">{action.recommendedAction}</p>
            <p className="mt-2 text-sm text-slate-500">{action.reason}</p>
            <ul className="mt-3 space-y-1.5">
              {action.steps.map((step) => (
                <li key={step} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                  {step}
                </li>
              ))}
            </ul>
            {action.requiresApproval && (
              <p className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <HeartHandshake className="h-4 w-4" aria-hidden />
                Owner approval required before this offer can be extended to the customer.
              </p>
            )}
          </Card>

          {amc && (
            <Card
              title="Owner Renewal Offer Decision"
              description="The owner decides whether this customer receives a renewal offer."
              actions={offer?.status === 'Approved' ? <Button size="sm" variant="outline" onClick={openOfferEditor}>Edit Offer</Button> : undefined}
            >
              {offer?.status === 'Declined' ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-800">No renewal offer will be given</p>
                  <p className="mt-1 text-sm text-slate-500">The team will focus on service recovery and the standard renewal conversation.</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={openOfferEditor}>Give an offer instead</Button>
                </div>
              ) : offer?.status === 'Approved' ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-900">{offer.title}</p>
                  <p className="mt-1 text-sm font-medium text-emerald-700">
                    {offer.discountPercent}% discount · renewal price {formatINR(amc.amount * (1 - offer.discountPercent / 100))}
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {offer.benefits.map((detail) => (
                      <li key={detail} className="flex items-start gap-2 text-sm text-emerald-900">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-800">No offer decision has been made</p>
                  <p className="mt-1 text-sm text-slate-500">The owner can give a custom offer or continue without one.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={openOfferEditor}>Give Renewal Offer</Button>
                    <Button size="sm" variant="outline" onClick={declineOffer}>Do Not Give Offer</Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          <Card title="AI Renewal Assistant" description="Generate a personalized draft for this customer.">
            <AIEmailGenerator action={action} customer={customer} trigger="Generate Renewal Email" />
          </Card>
        </div>
      </div>

      <ApprovalModal
        action={action}
        customer={customer}
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onApprove={() => statusFlow('Approved')}
      />
      <Modal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        title="Create renewal offer"
        description="The owner defines the offer to share after service recovery."
        footer={
          <>
            <Button variant="outline" onClick={() => setOfferOpen(false)}>Cancel</Button>
            <Button onClick={saveOffer}>Approve Offer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Offer title" value={offerTitle} onChange={(event) => setOfferTitle(event.target.value)} placeholder="e.g. Service recovery renewal offer" />
          <Input label="Discount percentage" type="number" min="0" max="100" value={offerDiscount} onChange={(event) => setOfferDiscount(event.target.value)} />
          <Textarea label="Benefits (one per line)" value={offerBenefits} onChange={(event) => setOfferBenefits(event.target.value)} placeholder="Complimentary inspection&#10;One free preventive visit" />
        </div>
      </Modal>
    </div>
  )
}
