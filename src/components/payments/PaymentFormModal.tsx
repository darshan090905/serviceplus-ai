import { useState } from 'react'
import type { Payment, PaymentMethod } from '../../types'
import { useAppStore } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Select, Field } from '../ui/Field'
import { PAYMENT_METHODS as METHODS } from '../../constants'
import { daysFromNow } from '../../utils/dates'

interface Props {
  open: boolean
  onClose: () => void
}

interface FormState {
  customerId: string
  invoice: string
  amount: string
  dueDate: string
  paidDate: string
  method: PaymentMethod
  status: Payment['status']
}

export function PaymentFormModal({ open, onClose }: Props) {
  const { customers, addPayment } = useAppStore()
  const { toast } = useToast()
  const [form, setForm] = useState<FormState>({
    customerId: '',
    invoice: '',
    amount: '',
    dueDate: daysFromNow(30),
    paidDate: '',
    method: 'UPI',
    status: 'Pending',
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
    const amount = Number(form.amount)
    if (!form.amount || isNaN(amount) || amount <= 0) next.amount = 'Enter a valid amount'
    if (!form.dueDate) next.dueDate = 'Due date is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = () => {
    if (!validate()) return
    setSaving(true)
    setTimeout(() => {
      addPayment({
        id: `PAY${Date.now()}`,
        invoice: form.invoice || `INV-${Math.floor(9000 + Math.random() * 999)}`,
        customerId: form.customerId,
        amcId: '',
        amount: Number(form.amount),
        dueDate: form.dueDate,
        paidDate: form.status === 'Paid' || form.status === 'Partially Paid' ? form.paidDate || daysFromNow(0) : null,
        status: form.status,
        method: form.method,
      })
      setSaving(false)
      onClose()
      toast('Payment recorded successfully.')
    }, 400)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Payment"
      description="Create a new invoice or payment entry."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Record Payment</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" error={errors.customerId}>
            <Select value={form.customerId} onChange={(e) => set('customerId', e.target.value)} options={[{ value: '', label: 'Select customer...' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]} />
          </Field>
          <Field label="Invoice">
            <Input value={form.invoice} onChange={(e) => set('invoice', e.target.value)} placeholder="auto-generated if empty" />
          </Field>
        </div>
        <Field label="Amount (₹)" error={errors.amount}>
          <Input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="e.g. 18500" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due Date" error={errors.dueDate}>
            <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
          <Field label="Paid Date">
            <Input type="date" value={form.paidDate} onChange={(e) => set('paidDate', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment Method">
            <Select value={form.method} onChange={(e) => set('method', e.target.value as PaymentMethod)} options={METHODS.map((m) => ({ value: m, label: m }))} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value as Payment['status'])} options={['Paid', 'Pending', 'Overdue', 'Partially Paid'].map((s) => ({ value: s, label: s }))} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}