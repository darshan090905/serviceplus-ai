import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, FileText, MessageSquareWarning, CreditCard, Cog, CheckCheck, Circle, Trash2, Wrench } from 'lucide-react'
import type { NotificationType } from '../types'
import { useAppStore } from '../store/AppStore'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Tabs } from '../components/ui/Tabs'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../components/ui/Toast'
import { timeAgo } from '../utils/dates'
import { cn } from '../utils/cn'

const typeMeta: Record<NotificationType, { icon: typeof AlertTriangle; className: string }> = {
  Risk: { icon: AlertTriangle, className: 'bg-red-50 text-red-600' },
  AMC: { icon: FileText, className: 'bg-amber-50 text-amber-600' },
  Complaint: { icon: MessageSquareWarning, className: 'bg-sky-50 text-sky-600' },
  Payment: { icon: CreditCard, className: 'bg-emerald-50 text-emerald-600' },
  System: { icon: Cog, className: 'bg-slate-100 text-slate-600' },
  Service: { icon: Wrench, className: 'bg-indigo-50 text-indigo-600' },
}

const tabIds = [
  { id: 'All', label: 'All' },
  { id: 'Risk', label: 'Risk' },
  { id: 'AMC', label: 'AMC' },
  { id: 'Complaint', label: 'Complaints' },
  { id: 'Payment', label: 'Payments' },
  { id: 'System', label: 'System' },
]

export function NotificationsPage() {
  const { notifications, markNotificationRead, markAllNotificationsRead, deleteNotification, clearNotifications } = useAppStore()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState('All')
  const [confirmingClear, setConfirmingClear] = useState(false)

  const filtered = useMemo(
    () => (tab === 'All' ? notifications : notifications.filter((n) => n.type === tab)),
    [notifications, tab],
  )
  const unread = notifications.filter((n) => !n.read).length

  const counts: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {}
    notifications.forEach((n) => {
      map[n.type] = (map[n.type] ?? 0) + 1
    })
    return map
  }, [notifications])

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Alerts and updates across customers, AMCs, complaints and payments."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              icon={<CheckCheck className="h-4 w-4" />}
              onClick={() => {
                markAllNotificationsRead()
                toast('All notifications marked as read.')
              }}
            >
              Mark all as read
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => setConfirmingClear(true)}
            >
              Clear all
            </Button>
          </div>
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 pt-4">
          <Tabs
            tabs={tabIds.map((t) => ({ id: t.id, label: t.label, count: t.id === 'All' ? unread : counts[t.id] }))}
            active={tab}
            onChange={setTab}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No notifications" description="You are all caught up." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((n) => {
              const meta = typeMeta[n.type] ?? typeMeta.System
              const Icon = meta.icon
              return (
                <li key={n.id} className={cn('flex items-start gap-3 px-5 py-4', !n.read && 'bg-brand-50/30')}>
                  <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', meta.className)}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{n.title}</p>
                      {!n.read && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">New</span>}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">{n.description}</p>
                    <p className="mt-1 text-xs text-slate-400">{timeAgo(n.time)} · {n.type}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {n.link && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          markNotificationRead(n.id)
                          navigate(n.link!)
                        }}
                      >
                        View
                      </Button>
                    )}
                    {!n.read && (
                      <button
                        onClick={() => markNotificationRead(n.id)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-label="Mark as read"
                        title="Mark as read"
                      >
                        <Circle className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(n.id)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Delete notification"
                      title="Delete notification"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Modal
        open={confirmingClear}
        onClose={() => setConfirmingClear(false)}
        title="Clear all notifications?"
        description="This permanently deletes every notification, including unread ones, from the database. This cannot be undone."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmingClear(false)}>Cancel</Button>
            <Button
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => {
                clearNotifications()
                setConfirmingClear(false)
                toast('All notifications cleared.')
              }}
            >
              Clear all
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-500">
          The bell badge will drop to zero and every open admin, technician and customer tab clears live.
        </p>
      </Modal>
    </div>
  )
}