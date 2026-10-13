import { Activity } from 'lucide-react'
import { cn } from '../../utils/cn'

export function Logo({ compact = false, light = false, className }: { compact?: boolean; light?: boolean; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
        <Activity className="h-4 w-4" aria-hidden />
      </span>
      {!compact && (
        <span className="flex flex-col leading-tight">
          <span className={cn('text-sm font-bold tracking-tight', light ? 'text-white' : 'text-slate-900')}>ServicePulse</span>
          <span className={cn('text-[10px] font-medium', light ? 'text-brand-100/80' : 'text-slate-400')}>Track. Analyze. Retain.</span>
        </span>
      )}
    </span>
  )
}