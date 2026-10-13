import { Select } from '../ui/Field'
import { useAppStore } from '../../store/AppStore'
import type { EquipmentAsset } from '../../types'

interface Props {
  value: string
  onChange: (v: string) => void
  /** Only this customer's machines are offered; omit to allow any customer. */
  customerId?: string
  error?: string
  label?: string
  hint?: string
  id?: string
}

/**
 * Picks the machine a contract, visit or complaint is about. Without a customer
 * chosen yet there is nothing to narrow by, so it says so instead of listing
 * every machine in the book.
 */
export function AssetPicker({ value, onChange, customerId, error, label = 'Machine', hint, id }: Props) {
  const { assets } = useAppStore()

  if (!customerId) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
        Choose a customer first, then the machine this applies to.
      </p>
    )
  }

  const options: Array<{ value: string; label: string }> = [
    { value: '', label: 'Site-wide / not machine specific' },
    ...assets
      .filter((a) => a.customerId === customerId)
      .map((a) => ({ value: a.id, label: describe(a) })),
  ]

  return (
    <div className="space-y-1.5">
      <label htmlFor={id ?? 'asset-picker'} className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      <Select
        id={id ?? 'asset-picker'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={options}
        invalid={Boolean(error)}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
      {options.length === 1 && (
        <p className="text-xs text-slate-400">No machines registered for this customer yet.</p>
      )}
    </div>
  )
}

export function describe(asset: EquipmentAsset): string {
  const parts = [asset.name]
  if (asset.capacity) parts.push(asset.capacity)
  if (asset.model) parts.push(asset.model)
  const label = parts.join(' · ')
  return asset.status === 'Retired' ? `${label} (retired)` : label
}
