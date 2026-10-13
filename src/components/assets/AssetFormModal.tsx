import { useState } from 'react'
import { useAppStore } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Select, Textarea, Field } from '../ui/Field'
import { ASSET_CATEGORIES } from '../../constants'
import type { AssetCategory, AssetStatus, EquipmentAsset } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  /** Editing an existing machine instead of adding one. */
  asset?: EquipmentAsset | null
  /** Locked to one customer when opened from that customer's record. */
  customerId?: string
}

interface FormState {
  customerId: string
  name: string
  category: AssetCategory
  model: string
  serialNo: string
  capacity: string
  installedOn: string
  warrantyUntil: string
  locationNote: string
  status: AssetStatus
}

const emptyForm: FormState = {
  customerId: '',
  name: '',
  category: 'AC',
  model: '',
  serialNo: '',
  capacity: '',
  installedOn: '',
  warrantyUntil: '',
  locationNote: '',
  status: 'Active',
}

function toForm(asset: EquipmentAsset): FormState {
  return {
    customerId: asset.customerId,
    name: asset.name,
    category: asset.category,
    model: asset.model,
    serialNo: asset.serialNo,
    capacity: asset.capacity,
    installedOn: asset.installedOn ?? '',
    warrantyUntil: asset.warrantyUntil ?? '',
    locationNote: asset.locationNote,
    status: asset.status,
  }
}

export function AssetFormModal({ open, onClose, asset, customerId }: Props) {
  const { customers, addAsset, updateAsset } = useAppStore()
  const { toast } = useToast()
  const editing = Boolean(asset)
  const [form, setForm] = useState<FormState>(asset ? toForm(asset) : { ...emptyForm, customerId: customerId ?? '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Reopening for a different machine must not show the previous one's values.
  const [seed, setSeed] = useState<EquipmentAsset | null | undefined>(asset)
  if (open && seed !== asset) {
    setSeed(asset)
    setForm(asset ? toForm(asset) : { ...emptyForm, customerId: customerId ?? '' })
    setErrors({})
  }

  const lockedCustomer = Boolean(customerId) && !asset

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }

  const values = () => ({
    customerId: form.customerId,
    name: form.name.trim(),
    category: form.category,
    model: form.model.trim(),
    serialNo: form.serialNo.trim(),
    capacity: form.capacity.trim(),
    installedOn: form.installedOn || null,
    warrantyUntil: form.warrantyUntil || null,
    locationNote: form.locationNote.trim(),
    status: form.status,
  })

  const validate = () => {
    const next: Record<string, string> = {}
    if (!form.customerId) next.customerId = 'Customer is required'
    if (!form.name.trim()) next.name = 'Give the machine a name you will recognise on a service call'
    // A warranty that ended before the machine was installed is a data-entry
    // slip, not a real warranty, so it is rejected rather than silently stored.
    if (form.installedOn && form.warrantyUntil && form.warrantyUntil < form.installedOn) {
      next.warrantyUntil = 'Warranty end cannot be before the install date'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSaving(true)
    const ok = editing ? await updateAsset(asset!.id, values()) : await addAsset({ id: `AST-${Date.now()}`, ...values(), createdAt: new Date().toISOString() })
    setSaving(false)
    if (!ok) {
      toast('Could not save this machine — the database refused the change, so nothing was stored.', 'error')
      return
    }
    toast(editing ? 'Machine updated.' : 'Machine added to the equipment register.')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Machine' : 'Add Machine'}
      description={
        editing
          ? 'Update the details technicians and contracts refer to.'
          : 'Record a machine on site so contracts and visits can point at the exact unit.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{editing ? 'Save Changes' : 'Add Machine'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Customer" error={errors.customerId}>
          <Select
            value={form.customerId}
            onChange={(e) => set('customerId', e.target.value)}
            disabled={lockedCustomer}
            options={[
              { value: '', label: 'Select customer...' },
              ...customers.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Machine Name" error={errors.name} hint="e.g. Split AC — Conference Room">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Split AC — Server Room" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => set('category', e.target.value as AssetCategory)} options={ASSET_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Model">
            <Input value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="Voltas 1.5 Ton 3 Star" />
          </Field>
          <Field label="Serial Number">
            <Input value={form.serialNo} onChange={(e) => set('serialNo', e.target.value)} placeholder="Serial / UID" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Capacity">
            <Input value={form.capacity} onChange={(e) => set('capacity', e.target.value)} placeholder="1.5 Ton" />
          </Field>
          <Field label="Installed On">
            <Input type="date" value={form.installedOn} onChange={(e) => set('installedOn', e.target.value)} />
          </Field>
          <Field label="Warranty Until" error={errors.warrantyUntil}>
            <Input type="date" value={form.warrantyUntil} onChange={(e) => set('warrantyUntil', e.target.value)} />
          </Field>
        </div>
        <Field label="Location Note" hint="Where on site the machine is — floor, room, near what">
          <Textarea value={form.locationNote} onChange={(e) => set('locationNote', e.target.value)} placeholder="3rd floor, server room, beside the DB rack" />
        </Field>
        {editing && (
          <Field label="Status" hint="Retired keeps the machine's service history but stops it appearing as active">
            <Select value={form.status} onChange={(e) => set('status', e.target.value as AssetStatus)} options={[{ value: 'Active', label: 'Active' }, { value: 'Retired', label: 'Retired' }]} />
          </Field>
        )}
      </div>
    </Modal>
  )
}
