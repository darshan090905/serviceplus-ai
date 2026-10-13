import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export interface PriorityActionItem {
  title: string
  count: number
  detail: string
  to: string
}

export function PriorityActions({ items }: { items: PriorityActionItem[] }) {
  return (
    <ul className="divide-y divide-slate-100" data-testid="priority-actions">
      {items.map((item) => (
        <li key={item.title}>
          <Link to={item.to} className="group flex items-center gap-3 px-1 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-sm font-bold text-amber-600">
              {item.count}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-800 group-hover:text-brand-700">{item.title}</span>
              <span className="block text-xs text-slate-500">{item.detail}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-600" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}