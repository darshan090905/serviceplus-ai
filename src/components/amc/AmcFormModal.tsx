import { useState } from 'react'
import type { AMCContract, AmcStatus } from '../../types'
import { useAppStore } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Select, Field } from '../ui/Field'
import { SERVICE_TYPES } from '../../constants'
import { AssetPicker } from '../assets/AssetPicker'
import { daysFromNow, formatDate, monthEnd, monthStart, monthValue, monthsBetween } from '../../utils/dates'
import { VISIT_CADENCES, suggestFirstVisit, visitIntervalDays } from '../../utils/preventive'

interface Props {
  open: boolean
  onClose: () => void
  /** Present = edit that contract instead of creating a new one. */
  amc?: AMCContract
}

interface FormState {
  customerId: string
  serviceType: string
  fromMonth: string
  toMonth: string
  renewalDate: string
  assetId: string
  amount: string
  status: AmcStatus
  renewalStatus: AMCContract['renewalStatus']
  visitsPerYear: string
  nextVisitOn: string
}

export function AmcFormModal({ open, onClose, amc }: Props) {
  const { customers, addAmc, updateAmc } = useAppStore()
  const { toast } = useToast()
  const [form, setForm] = useState<FormState>(() => ({
    customerId: amc?.customerId ?? '',
    serviceType: amc?.serviceType ?? 'AC Service',
    fromMonth: amc ? monthValue(amc.startDate) : monthValue(daysFromNow(0)),
    toMonth: amc ? monthValue(amc.endDate) : monthValue(daysFromNow(365)),
    renewalDate: amc?.renewalDate ?? '',
    assetId: amc?.assetId ?? '',
    amount: amc ? String(amc.amount) : '',
    status: amc?.status ?? 'Active',
    renewalStatus: amc?.renewalStatus ?? 'None',
    visitsPerYear: amc?.visitsPerYear != null ? String(amc.visitsPerYear) : '',
    nextVisitOn: amc?.nextVisitOn ?? '',
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }

  const startDate = monthStart(form.fromMonth)
  const endDate = monthEnd(form.toMonth)
  const validMonths = form.fromMonth && form.toMonth && monthsBetween(form.fromMonth, form.toMonth) > 0

  const validate = () => {
    const next: Record<string, string> = {}
    if (!form.customerId) next.customerId = 'Customer is required'
    const amount = Number(form.amount)
    if (!form.amount || isNaN(amount) || amount <= 0) next.amount = 'Amount must be greater than 0'
    if (!form.fromMonth) next.fromMonth = 'Select the starting month'
    if (!form.toMonth) next.toMonth = 'Select the ending month'
    if (form.fromMonth && form.toMonth && monthsBetween(form.fromMonth, form.toMonth) <= 0) {
      next.toMonth = 'Ending month must be the same as or later than the starting month'
    }
    if (form.renewalDate && form.renewalDate < startDate) {
      next.renewalDate = 'Renewal date cannot be before the contract starts'
    }
    if (form.visitsPerYear) {
      const cadence = Number(form.visitsPerYear)
      if (!Number.isInteger(cadence) || cadence < 1 || cadence > 52) {
        next.visitsPerYear = 'Visits per year must be a whole number between 1 and 52'
      }
    }
    if (form.nextVisitOn && form.nextVisitOn < startDate) {
      next.nextVisitOn = 'The first visit cannot be before the contract starts'
    }
    if (form.nextVisitOn && endDate && form.nextVisitOn > endDate) {
      next.nextVisitOn = 'The first visit cannot be after the contract ends'
    }
    // A date with no cadence behind it would never advance, so the visit book
    // would freeze on that one date forever.
    if (form.nextVisitOn && !form.visitsPerYear) {
      next.visitsPerYear = 'Set visits per year so scheduled visits keep repeating'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = () => {
    if (!validate()) return
    setSaving(true)
    setTimeout(() => {
      if (amc) {
        updateAmc(amc.id, {
          customerId: form.customerId,
          serviceType: form.serviceType as AMCContract['serviceType'],
          startDate,
          endDate,
          renewalDate: form.renewalDate || null,
          assetId: form.assetId || null,
          amount: Number(form.amount),
          status: form.status,
          renewalStatus: form.renewalStatus,
          visitsPerYear: form.visitsPerYear ? Number(form.visitsPerYear) : null,
          nextVisitOn: form.nextVisitOn || null,
        })
        toast(`AMC contract ${amc.id} updated.`)
      } else {
        addAmc({
          id: `AMC${Date.now()}`,
          customerId: form.customerId,
          serviceType: form.serviceType as AMCContract['serviceType'],
          startDate,
          endDate,
          renewalDate: form.renewalDate || null,
          assetId: form.assetId || null,
          amount: Number(form.amount),
          status: form.status,
          renewalStatus: form.renewalStatus,
          visitsPerYear: form.visitsPerYear ? Number(form.visitsPerYear) : null,
          nextVisitOn: form.nextVisitOn || null,
        })
        toast('AMC contract created successfully.')
      }
      setSaving(false)
      onClose()
    }, 400)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={amc ? `Edit Contract ${amc.id}` : 'Add AMC Contract'}
      description={
        amc
          ? 'Change the customer, service, amount or the months this contract is valid for.'
          : 'Create a new service contract for a customer.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{amc ? 'Save Changes' : 'Create Contract'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Customer" error={errors.customerId}>
          <Select
            value={form.customerId}
            onChange={(e) => set('customerId', e.target.value)}
            options={[{ value: '', label: 'Select customer...' }, ...customers.map((c) => ({ value: c.id, label: `${c.name} — ${c.company}` }))]}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service Type">
            <Select value={form.serviceType} onChange={(e) => set('serviceType', e.target.value)} options={SERVICE_TYPES.map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="Amount (₹)" error={errors.amount}>
            <Input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="e.g. 18000" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valid From (month)" error={errors.fromMonth} hint="First day of this month">
            <Input type="month" value={form.fromMonth} onChange={(e) => set('fromMonth', e.target.value)} />
          </Field>
          <Field label="Valid To (month)" error={errors.toMonth} hint="Last day of this month">
            <Input type="month" value={form.toMonth} onChange={(e) => set('toMonth', e.target.value)} />
          </Field>
        </div>
        <p className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-brand-800">
          {validMonths
            ? `Valid ${formatDate(startDate)} → ${formatDate(endDate)} · ${monthsBetween(form.fromMonth, form.toMonth)} month${monthsBetween(form.fromMonth, form.toMonth) === 1 ? '' : 's'}.`
            : 'Pick a starting and ending month to see the exact validity period.'}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value as AmcStatus)} options={['Active', 'Expiring Soon', 'Renewal Pending', 'Renewed', 'Expired'].map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="Renewal Status">
            <Select value={form.renewalStatus} onChange={(e) => set('renewalStatus', e.target.value as AMCContract['renewalStatus'])} options={['None', 'Pending', 'Started', 'Done', 'Declined'].map((s) => ({ value: s, label: s }))} />
          </Field>
        </div>
        <AssetPicker
          id="amc-asset"
          value={form.assetId}
          onChange={(v) => set('assetId', v)}
          customerId={form.customerId}
          label="Machine Covered"
          hint="An AMC normally covers one machine. Leave as site-wide if it covers everything on site."
        />
        <Field
          label="Preventive Visits"
          error={errors.visitsPerYear}
          hint="How many service visits this contract includes each year. Leave unset for on-call-only contracts."
        >
          <Select
            value={form.visitsPerYear}
            onChange={(e) => set('visitsPerYear', e.target.value)}
            options={[
              { value: '', label: 'No scheduled visits' },
              ...VISIT_CADENCES.map((n) => ({ value: String(n), label: `${n} ${n === 1 ? 'visit' : 'visits'} per year` })),
            ]}
          />
        </Field>
        {form.visitsPerYear && (
          <Field
            label="First Scheduled Visit"
            error={errors.nextVisitOn}
            hint={
              visitIntervalDays(Number(form.visitsPerYear)) != null
                ? `Repeats every ${visitIntervalDays(Number(form.visitsPerYear))} days from each visit, unassigned and ready to claim.`
                : undefined
            }
          >
            <div className="flex gap-2">
              <Input
                type="date"
                aria-label="First Scheduled Visit"
                min={startDate || undefined}
                max={endDate || undefined}
                value={form.nextVisitOn}
                onChange={(e) => set('nextVisitOn', e.target.value)}
              />
              <Button
                variant="outline"
                className="shrink-0"
                disabled={!startDate || !form.visitsPerYear}
                onClick={() => {
                  const suggested = suggestFirstVisit(startDate, Number(form.visitsPerYear))
                  if (suggested) set('nextVisitOn', suggested)
                }}
              >
                One interval in
              </Button>
            </div>
          </Field>
        )}
        <Field
          label="Renewal Date"
          error={errors.renewalDate}
          hint="Pick the day from the calendar. Leave empty if no renewal is planned."
        >
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label="Renewal Date"
              min={startDate || undefined}
              value={form.renewalDate}
              onChange={(e) => set('renewalDate', e.target.value)}
            />
            <Button
              variant="outline"
              className="shrink-0"
              disabled={!endDate}
              onClick={() => set('renewalDate', endDate)}
            >
              Same as end date
            </Button>
          </div>
        </Field>
      </div>
    </Modal>
  )
}
