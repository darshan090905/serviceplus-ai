import { useMemo, useState } from 'react'
import { Mail, AlertTriangle, Flame, CalendarClock, Info, MailOpen, Inbox, ClipboardList, CreditCard, PhoneCall, PhoneMissed, PhoneOff, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { Card } from '../../components/ui/Card'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { timeAgo } from '../../utils/dates'
import { cn } from '../../utils/cn'
import type { EmailType, EmailRecord, CallRecord } from '../../types'

const typeMeta: Record<EmailType, { label: string; tone: BadgeTone; icon: typeof AlertTriangle }> = {
  'critical-assignment': { label: 'Urgent', tone: 'critical', icon: AlertTriangle },
  assignment: { label: 'New Job', tone: 'info', icon: ClipboardList },
  escalation: { label: 'Escalation', tone: 'danger', icon: Flame },
  resolution: { label: 'Resolution', tone: 'success', icon: Mail },
  reminder: { label: 'Reminder', tone: 'warning', icon: CalendarClock },
  system: { label: 'System', tone: 'info', icon: Info },
  'payment-reminder': { label: 'Payment', tone: 'warning', icon: CreditCard },
}

const callMeta: Record<CallRecord['status'], { label: string; tone: BadgeTone; icon: typeof Mail }> = {
  queued: { label: 'Ringing', tone: 'warning', icon: PhoneCall },
  ringing: { label: 'Ringing', tone: 'warning', icon: PhoneCall },
  answered: { label: 'Answered', tone: 'success', icon: PhoneCall },
  missed: { label: 'Missed', tone: 'danger', icon: PhoneMissed },
}

export function TechInboxPage() {
  const { session, emails, calls, markEmailRead, deleteEmail, deleteCall } = useAppStore()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [view, setView] = useState<'all' | 'unread'>('all')

  // Matching is name-agnostic: a queued message addressed to this technician
  // by name, technician id or email always surfaces, regardless of minor
  // case / whitespace differences in how it was recorded.
  const keys = useMemo(() => {
    const n = (v?: string) => (v ?? '').trim().toLowerCase()
    return new Set([n(session?.name), n(session?.technicianId), n(session?.email)].filter(Boolean))
  }, [session?.name, session?.technicianId, session?.email])

  const mine = useMemo(
    () =>
      emails
        .filter((e) => keys.has(e.to.trim().toLowerCase()) || keys.has(e.toEmail.trim().toLowerCase()))
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    [emails, keys],
  )

  const myCalls = useMemo(
    () =>
      calls
        .filter((c) => keys.has((c.toName ?? '').trim().toLowerCase()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [calls, keys],
  )

  const unread = mine.filter((e) => !e.read)
  const rows = view === 'unread' ? unread : mine

  const open = (e: EmailRecord) => {
    if (!e.read) markEmailRead(e.id)
    setExpanded((prev) => (prev === e.id ? null : e.id))
  }

  const removeEmail = (e: EmailRecord) => {
    deleteEmail(e.id)
    toast('Email deleted — removed from the server.')
  }

  const removeCall = (c: CallRecord) => {
    deleteCall(c.id)
    toast('Call removed from the log — deleted from the server.')
  }

  const clearMine = () => {
    toast(`Cleared ${mine.length} email${mine.length === 1 ? '' : 's'} — removed from the server.`)
    for (const e of mine) deleteEmail(e.id)
  }

  const clearMyCalls = () => {
    toast(`Cleared ${myCalls.length} call${myCalls.length === 1 ? '' : 's'} — removed from the server.`)
    for (const c of myCalls) deleteCall(c.id)
  }

  return (
    <div>
      <PageHeader title="Email Inbox" subtitle="System emails sent to you — urgent complaints, escalations and visit reminders." />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Unread" value={unread.length} sub="need review" icon={MailOpen} tone="warning" />
        <StatCard label="Total" value={mine.length} sub="emails received" icon={Mail} tone="brand" />
      </div>

      <Card bodyClassName="p-0">
        <div className="flex items-center gap-1 border-b border-slate-100 px-2 pt-2">
          {(['all', 'unread'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'border-b-2 px-3 py-2 text-sm font-medium capitalize transition-colors',
                view === v ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              {v} {v === 'unread' && unread.length > 0 && `(${unread.length})`}
            </button>
          ))}
          {rows.length > 0 && (
            <button
              type="button"
              onClick={clearMine}
              className="ml-auto mr-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:text-red-600"
              title="Delete all shown emails from the server"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear all
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <EmptyState title="Inbox zero" description="No emails here." icon={Inbox} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((e) => {
              const meta = typeMeta[e.type] ?? typeMeta.system
              const Icon = meta.icon
              const isOpen = expanded === e.id
              return (
                <li key={e.id} className="relative">
                  <button
                    onClick={() => open(e)}
                    className={cn('flex w-full items-start gap-3 px-5 py-3.5 pr-14 text-left transition-colors hover:bg-slate-50', !e.read && 'bg-brand-50/30')}
                  >
                    <span className={cn('mt-0.5 rounded-full p-2', !e.read ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-400')}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn('truncate text-sm', e.read ? 'text-slate-700' : 'font-semibold text-slate-900')}>{e.subject}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        To: {e.to} · {timeAgo(e.sentAt)}
                      </span>
                      {isOpen && (
                        <span
                          className={cn(
                            'mt-2 block rounded-lg border border-slate-100 bg-white px-3 py-2.5 whitespace-pre-line text-sm text-slate-600',
                            e.type === 'critical-assignment' && 'border-red-100 bg-red-50/40',
                            e.type === 'escalation' && 'border-orange-100 bg-orange-50/40',
                          )}
                        >
                          {e.body}
                        </span>
                      )}
                    </span>
                    {!e.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete email ${e.subject}`}
                    title="Delete email from server"
                    onClick={() => removeEmail(e)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <PhoneCall className="h-4 w-4 text-brand-600" aria-hidden />
          AI Call Log
          <span className="text-xs font-normal text-slate-400">In-app voice calls from ServicePulse</span>
        </h2>
        {myCalls.length > 0 && (
          <button
            type="button"
            onClick={clearMyCalls}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:border-red-200 hover:text-red-600"
            title="Delete all calls in this log from the server"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear all
          </button>
        )}
      </div>
        <Card bodyClassName="p-0">
          {myCalls.length === 0 ? (
            <EmptyState title="No calls yet" description="When an admin assigns you a job, ServicePulse calls you here." icon={PhoneOff} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {myCalls.map((c) => {
                const meta = callMeta[c.status] ?? callMeta.queued
                const Icon = meta.icon
                return (
                  <li key={c.id} className="relative flex items-start gap-3 px-5 py-3.5 pr-14">
                    <span className={cn('mt-0.5 rounded-full p-2', c.status === 'answered' ? 'bg-emerald-100 text-emerald-600' : c.status === 'missed' ? 'bg-red-100 text-red-500' : 'bg-amber-100 text-amber-600')}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">New assignment · {c.complaintId}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">{timeAgo(c.createdAt)}</span>
                      <span className="mt-1.5 block rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm leading-relaxed text-slate-600">{c.message}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Delete call ${c.id}`}
                      title="Delete call from server"
                      onClick={() => removeCall(c)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}