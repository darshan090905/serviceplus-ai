import { SERVICE_TYPES } from '../../constants'
import { cn } from '../../utils/cn'
import type { ServiceTypeKey } from '../../types'

interface Props {
  value: ServiceTypeKey[]
  onChange: (v: ServiceTypeKey[]) => void
  error?: string
}

export function ServicePicker({ value, onChange, error }: Props) {
  const toggle = (s: ServiceTypeKey) => {
    onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s])
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {SERVICE_TYPES.map((s) => {
          const selected = value.includes(s as ServiceTypeKey)
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s as ServiceTypeKey)}
              aria-pressed={selected}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors',
                selected
                  ? 'border-brand-400 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <span
                className={cn(
                  'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                  selected ? 'border-brand-600 bg-brand-600' : 'border-slate-300 bg-white',
                )}
                aria-hidden
              >
                {selected && (
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white" fill="none">
                    <path d="M2.5 6.2l2.3 2.3 4.7-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {s}
            </button>
          )
        })}
      </div>
      {error ? (
        <p className="mt-1.5 text-xs text-red-500">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-slate-400">Select one or more — each service gets its own AMC contract and technician.</p>
      )}
    </div>
  )
}