import { useNavigate } from 'react-router-dom'
import { MessageSquareWarning, CreditCard, FileText, UserPlus, Wrench, HeartPulse, type LucideIcon } from 'lucide-react'
import type { ActivityEvent } from '../../types'
import { formatShortDate } from '../../utils/dates'

const icons: Record<ActivityEvent['type'], LucideIcon> = {
  complaint: MessageSquareWarning,
  payment: CreditCard,
  amc: FileText,
  customer: UserPlus,
  service: Wrench,
  risk: HeartPulse,
}

const colors: Record<ActivityEvent['type'], string> = {
  complaint: 'text-amber-600 bg-amber-50',
  payment: 'text-emerald-600 bg-emerald-50',
  amc: 'text-brand-600 bg-brand-50',
  customer: 'text-slate-600 bg-slate-100',
  service: 'text-sky-600 bg-sky-50',
  risk: 'text-red-600 bg-red-50',
}

export function RecentActivity({ events }: { events: ActivityEvent[] }) {
  const navigate = useNavigate()
  return (
    <ol className="relative space-y-4 before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
      {events.map((event) => {
        const Icon = icons[event.type]
        return (
          <li key={event.id} className="relative flex items-start gap-3 pl-0">
            <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${colors[event.type]}`}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-medium text-slate-800">{event.title}</p>
              <button
                onClick={() => event.customerId && navigate(`/customers/${event.customerId}`)}
                className="block text-xs text-slate-500 hover:text-brand-600"
              >
                {event.detail}
              </button>
              <p className="mt-0.5 text-[11px] text-slate-400">{formatShortDate(event.date)}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}