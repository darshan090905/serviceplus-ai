import { cn } from '../../utils/cn'

export function Progress({
  value,
  tone = 'neutral',
  className,
}: {
  value: number
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  const bars = {
    neutral: 'bg-brand-600',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
  }
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}
    >
      <div className={cn('h-full rounded-full transition-all', bars[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}