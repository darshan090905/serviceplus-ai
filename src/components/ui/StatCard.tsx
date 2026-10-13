import type { ComponentType, ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface StatCardProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ComponentType<{ className?: string }>
  tone?: 'default' | 'warning' | 'danger' | 'success' | 'brand'
  subTone?: 'default' | 'positive' | 'negative'
  loading?: boolean
}

const iconTones = {
  default: 'bg-slate-100 text-slate-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
  success: 'bg-emerald-50 text-emerald-600',
  brand: 'bg-brand-50 text-brand-600',
}

const subTones = {
  default: 'text-slate-500',
  positive: 'text-emerald-600',
  negative: 'text-red-600',
}

/**
 * A stat tile that stays readable at any width.
 *
 * The tile used to spend 20px of padding on each edge plus a 36px icon badge and
 * a 12px gap before the number got a single pixel. That was fine in a
 * four-across row spanning the page and broken the moment the same tile was
 * dropped into a narrower column: a grid of three inside a third-width card left
 * about 17px for a 24px-font value, so the number was clipped and the icon badge
 * sat on top of it. Nothing in the component could notice, because the crowding
 * came from the parent's column count rather than the viewport - and roughly ten
 * pages do put these tiles in a bare `grid-cols-3`, which on a phone is the same
 * problem the reports page had on a desktop.
 *
 * So the tile measures its own box instead of guessing from the screen, using
 * native container queries (see .stat-tile in index.css). Below 11rem the padding
 * and icon shrink; below 8rem the icon goes entirely, which is the point where
 * keeping it would mean the value has no room at all.
 */
export function StatCard({ label, value, sub, icon: Icon, tone = 'default', subTone = 'default' }: StatCardProps) {
  return (
    <div className="stat-tile rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="stat-tile-body p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-slate-500">{label}</p>
            <p className="stat-tile-value mt-1.5 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
            {sub && <p className={cn('mt-1 text-xs font-medium', subTones[subTone])}>{sub}</p>}
          </div>
          {Icon && (
            <span className={cn('stat-tile-icon shrink-0 rounded-lg p-2', iconTones[tone])}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}