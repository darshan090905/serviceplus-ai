import { useState } from 'react'
import { Sparkles, RefreshCw, Pencil, Send, Check } from 'lucide-react'
import type { Customer, RenewalEmail, RetentionAction } from '../../types'
import { generateRenewalEmail } from '../../services/aiService'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'
import { Badge } from '../ui/Badge'
import { formatDate, formatINR } from '../../utils'

interface Props {
  action: RetentionAction
  customer: Customer
  trigger?: React.ReactNode
}

export function AIEmailGenerator({ action, customer, trigger }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [email, setEmail] = useState<RenewalEmail | null>(null)
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sent, setSent] = useState(false)
  const { toast } = useToast()

  const amcValue = action.revenueAtRisk
  const amcEndDate = new Date().toISOString().slice(0, 10)

  const generate = async () => {
    setLoading(true)
    setError(false)
    try {
      const result = await generateRenewalEmail({
        customer,
        retentionAction: action,
        amcValue,
        amcExpiry: formatDate(amcEndDate),
      })
      setEmail(result)
      setSubject(result.subject)
      setBody(result.body)
      setEditing(false)
      setSent(false)
      toast('Renewal email generated.', 'info')
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const approve = () => {
    setSent(true)
    toast('Email approved. Sending will be connected during backend integration.', 'success')
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true)
          if (!email && !loading) generate()
        }}
        className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100"
      >
        <Sparkles className="mr-2 h-4 w-4" aria-hidden />
        {trigger ?? 'Generate Renewal Email'}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="AI Renewal Assistant"
        description="Generate a personalized renewal email draft."
        size="lg"
        footer={
          email && !sent ? (
            <>
              <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={generate} loading={loading}>
                Regenerate
              </Button>
              <Button variant={editing ? 'secondary' : 'outline'} icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing((v) => !v)}>
                {editing ? 'Done Editing' : 'Edit'}
              </Button>
              <Button icon={<Send className="h-4 w-4" />} onClick={approve}>
                Approve & Send
              </Button>
            </>
          ) : sent ? undefined : undefined
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Context</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
              <div>
                <p className="text-slate-400">Customer</p>
                <p className="font-medium text-slate-800">{customer.name}</p>
              </div>
              <div>
                <p className="text-slate-400">AMC</p>
                <p className="font-medium text-slate-800">{customer.serviceTypes.join(', ')} · {formatINR(amcValue)}</p>
              </div>
              <div>
                <p className="text-slate-400">Risk</p>
                <Badge tone={customer.health.level === 'Healthy' ? 'success' : customer.health.level === 'At Risk' || customer.health.level === 'Critical' ? 'danger' : 'warning'}>
                  {customer.health.level}
                </Badge>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <p className="text-slate-400">Primary Risk</p>
                <p className="font-medium text-slate-800">{action.primaryRisk}</p>
              </div>
            </div>
          </div>

          {loading && (
            <div className="flex flex-col items-center gap-3 py-6 text-sm text-slate-500">
              <Sparkles className="h-5 w-5 animate-pulse text-brand-600" aria-hidden />
              Generating personalized renewal email...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              AI generation is temporarily unavailable. Please try again.
            </div>
          )}

          {email && !loading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  AI-generated draft — review before sending.
                </span>
                {sent ? (
                  <span className="flex items-center gap-1 font-medium text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Email approved
                  </span>
                ) : (
                  <span>Draft ready</span>
                )}
              </div>

              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="email-subject" className="block text-xs font-medium text-slate-600">Subject</label>
                    <input
                      id="email-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="email-body" className="block text-xs font-medium text-slate-600">Body</label>
                    <textarea
                      id="email-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={12}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">{subject}</p>
                  <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{body}</pre>
                </div>
              )}

              {sent && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <p className="font-medium">Email approved</p>
                  <p className="mt-0.5 text-xs">Email sending will be connected during backend integration.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}