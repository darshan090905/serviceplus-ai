import { useMemo, useState } from 'react'
import type { ServiceRecord } from '../../types'
import { useAppStore } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Select, Field } from '../ui/Field'
import { SERVICE_TYPES } from '../../constants'
import { activeTechnicians, resolveTechnicianId } from '../../utils/technicians'
import { AssetPicker } from '../assets/AssetPicker'
import { AmcPicker } from '../amc/AmcPicker'
import { daysFromNow, labelToMinutes, clampMinutes, isValidMinutes } from '../../utils/dates'

interface Props {
  open: boolean
  onClose: () => void
}

interface FormState {
  customerId: string
  serviceType: string
  date: string
  technician: string
  startTime: string
  durationMinutes: string
  assetId: string
  amcId: string
  status: ServiceRecord['status']
  rating: string
  notes: string
}

export function ServiceFormModal({ open, onClose }: Props) {
  const { customers, accounts, amcs, addService } = useAppStore()
  const { toast } = useToast()
  const technicians = useMemo(
    () =>
      activeTechnicians(accounts)
        .map((a) => a.technicianId ?? a.name)
        .filter(Boolean),
    [accounts],
  )
  const [form, setForm] = useState<FormState>({
    customerId: '',
    serviceType: 'AC Service',
    date: daysFromNow(1),
    technician: '',
    startTime: '',
    durationMinutes: '60',
    assetId: '',
    amcId: '',
    status: 'Scheduled',
    rating: '',
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (!form.customerId) next.customerId = 'Customer is required'
    if (!form.date) next.date = 'Service date is required'
    if (form.startTime && labelToMinutes(form.startTime) === null) next.startTime = 'Enter a valid time'
    if (form.durationMinutes && (!isValidMinutes(Number(form.durationMinutes)) || Number(form.durationMinutes) <= 0)) {
      next.durationMinutes = 'Enter minutes between 1 and 1440'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = () => {
    if (!validate()) return
    setSaving(true)
    setTimeout(() => {
      addService({
        id: `SRV${Date.now()}`,
        customerId: form.customerId,
        serviceType: form.serviceType as ServiceRecord['serviceType'],
        date: form.date,
        technician: form.technician,
        technicianId: resolveTechnicianId(form.technician, accounts),
        startMinute: labelToMinutes(form.startTime),
        durationMinutes: clampMinutes(Number(form.durationMinutes)),
        assetId: form.assetId || null,
        amcId: form.amcId || null,
        status: form.status,
        rating: form.status === 'Completed' && form.rating ? Number(form.rating) : null,
        notes: form.notes,
      })
      setSaving(false)
      onClose()
      toast('Service record added successfully.')
    }, 400)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Service"
      description="Record a new service activity."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Add Service</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Customer" error={errors.customerId}>
          <Select value={form.customerId} onChange={(e) => set('customerId', e.target.value)} options={[{ value: '', label: 'Select customer...' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service Type">
            <Select value={form.serviceType} onChange={(e) => set('serviceType', e.target.value)} options={SERVICE_TYPES.map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="Date" error={errors.date}>
            <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
        </div>
        <AssetPicker
          id="service-asset"
          value={form.assetId}
          onChange={(v) => set('assetId', v)}
          customerId={form.customerId}
          label="Machine Serviced"
          hint="Point the visit at the exact unit, so repeat failures on one machine become visible."
        />
        <AmcPicker
          id="service-amc"
          value={form.amcId}
          onChange={(v) => {
            // A contract is always for one kind of work, so linking one and
            // leaving a different service type selected would misreport what
            // the visit was for. Follow the contract instead.
            const linked = amcs.find((a) => a.id === v)
            setForm((prev) => ({
              ...prev,
              amcId: v,
              serviceType: linked ? linked.serviceType : prev.serviceType,
            }))
            setErrors((prev) => ({ ...prev, amcId: '' }))
          }}
          customerId={form.customerId}
          hint="Link the contract this preventive visit is discharging so contract utilisation becomes measurable."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Technician">
            <Select value={form.technician} onChange={(e) => set('technician', e.target.value)} options={[{ value: '', label: 'Select technician...' }, ...technicians.map((t) => ({ value: t, label: t }))]} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value as ServiceRecord['status'])} options={['Scheduled', 'In Progress', 'Completed', 'Cancelled'].map((s) => ({ value: s, label: s }))} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Start time"
            error={errors.startTime}
            hint="Leave blank if the time was never agreed. An unscheduled visit stays visibly unscheduled instead of being shown at midnight."
          >
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => set('startTime', e.target.value)}
              placeholder="Not scheduled"
            />
          </Field>
          <Field label="Duration (minutes)" error={errors.durationMinutes} hint="Used to spot two visits booked on top of each other.">
            <Input
              type="number"
              min={1}
              max={1440}
              step={15}
              value={form.durationMinutes}
              onChange={(e) => set('durationMinutes', e.target.value)}
            />
          </Field>
        </div>
        {form.status === 'Completed' && (
          <Field label="Rating (1–5)" hint="Customer satisfaction rating">
            <Select value={form.rating} onChange={(e) => set('rating', e.target.value)} options={[{ value: '', label: 'No rating' }, { value: '5', label: '5 — Excellent' }, { value: '4', label: '4 — Good' }, { value: '3', label: '3 — Average' }, { value: '2', label: '2 — Poor' }, { value: '1', label: '1 — Very poor' }]} />
          </Field>
        )}
        <Field label="Notes">
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Work performed, parts used..." />
        </Field>
      </div>
    </Modal>
  )
}