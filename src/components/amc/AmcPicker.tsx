import { Select } from '../ui/Field'
import { useAppStore } from '../../store/AppStore'
import type { AMCContract } from '../../types'

interface Props {
  value: string
  onChange: (v: string) => void
  /** Only this customer's contracts are offered; omit to allow any customer. */
  customerId?: string
  error?: string
  label?: string
  hint?: string
  id?: string
}

/**
 * Links a service visit back to the maintenance contract it discharges. Without
 * a customer chosen there is nothing to narrow by, so it says so rather than
 * listing every contract in the book.
 */
export function AmcPicker({ value, onChange, customerId, error, label = 'Linked Contract (AMC)', hint, id }: Props) {
  const { amcs } = useAppStore()

  if (!customerId) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
        Choose a customer first, then the contract this visit is for.
      </p>
    )
  }

  const options: Array<{ value: string; label: string }> = [
    { value: '', label: 'Ad-hoc visit / not tied to a contract' },
    ...amcs
      .filter((a) => a.customerId === customerId)
      .map((a) => ({ value: a.id, label: describe(a) })),
  ]

  return (
    <div className="space-y-1.5">
      <label htmlFor={id ?? 'amc-picker'} className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      <Select
        id={id ?? 'amc-picker'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={options}
        invalid={Boolean(error)}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
      {options.length === 1 && (
        <p className="text-xs text-slate-400">No contracts on file for this customer yet.</p>
      )}
    </div>
  )
}

export function describe(amc: AMCContract): string {
  const parts: string[] = [amc.serviceType]
  if (amc.visitsPerYear) parts.push(`${amc.visitsPerYear} visits/yr`)
  const label = parts.join(' · ')
  return amc.status === 'Expired' ? `${label} (expired)` : label
}
