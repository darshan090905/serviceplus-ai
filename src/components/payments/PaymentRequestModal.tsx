import { useState } from 'react'
import { useAppStore } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Select, Field } from '../ui/Field'
import { daysFromNow } from '../../utils/dates'
import { Send } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

interface FormState {
  customerId: string
  amount: string
  dueDate: string
  note: string
}

export function PaymentRequestModal({ open, onClose }: Props) {
  const { customers, accounts, sendPaymentRequest } = useAppStore()
  const { toast } = useToast()
  const [form, setForm] = useState<FormState>({
    customerId: '',
    amount: '',
    dueDate: daysFromNow(14),
    note: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)

  const activeCustomers = customers.filter((c) =>
    accounts.some((a) => a.customerId === c.id && a.role === 'customer' && a.status === 'active'),
  )

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
    setSending(true)
    void sendPaymentRequest({
      customerId: form.customerId,
      amount: Number(form.amount),
      dueDate: form.dueDate,
      note: form.note.trim() || undefined,
    }).then((res) => {
      setSending(false)
      if (!res.ok) {
        toast(res.message ?? 'Could not send the request.')
        return
      }
      const customer = customers.find((c) => c.id === form.customerId)
      toast(`Payment request sent to ${customer?.name}.`)
      setForm({ customerId: '', amount: '', dueDate: daysFromNow(14), note: '' })
      onClose()
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send Payment Request"
      description="Create a pending invoice and notify the customer."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={sending} icon={<Send className="h-4 w-4" />}>Send Request</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Customer" error={errors.customerId}>
          <Select
            value={form.customerId}
            onChange={(e) => set('customerId', e.target.value)}
            options={[
              { value: '', label: 'Select customer...' },
              ...activeCustomers.map((c) => ({ value: c.id, label: `${c.name} — ${c.company}` })),
            ]}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (₹)" error={errors.amount}>
            <Input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="e.g. 15000" />
          </Field>
          <Field label="Due Date" error={errors.dueDate}>
            <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
        </div>
        <Field label="Note (optional)" hint="Shown in the notification and email sent to the customer.">
          <Input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="e.g. Q2 AMC renewal invoice" />
        </Field>
      </div>
    </Modal>
  )
}