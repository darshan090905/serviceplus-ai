import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

interface FilterBarProps {
  children: ReactNode
  applied?: number
  onReset?: () => void
}

export function FilterBar({ children, applied = 0, onReset }: FilterBarProps) {
  if (!applied) {
    return <div className="flex flex-wrap items-end gap-3">{children}</div>
  }
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-3">{children}</div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-brand-700">
          {applied} filter{applied === 1 ? '' : 's'} applied
        </span>
        {onReset && (
          <Button variant="ghost" size="sm" onClick={onReset} icon={<X className="h-3.5 w-3.5" />}>
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}