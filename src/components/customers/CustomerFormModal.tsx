import { useState } from 'react'
import type { Customer, CustomerType, ServiceTypeKey } from '../../types'
import { useAppStore } from '../../store/AppStore'
import { useToast } from '../ui/Toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Select, Field } from '../ui/Field'
import { ServicePicker } from '../ui/ServicePicker'
import { CITIES } from '../../constants'

interface Props {
  open: boolean
  onClose: () => void
}

interface FormState {
  name: string
  company: string
  email: string
  phone: string
  address: string
  customerType: CustomerType
  serviceTypes: ServiceTypeKey[]
  city: string
}

const empty: FormState = {
  name: '',
  company: '',
  email: '',
  phone: '',
  address: '',
  customerType: 'Business',
  serviceTypes: ['AC Service'],
  city: CITIES[0],
}

type Errors = Partial<Record<keyof FormState, string>>

export function CustomerFormModal({ open, onClose }: Props) {
  const { addCustomer } = useAppStore()
  const { toast } = useToast()
  const [form, setForm] = useState<FormState>(empty)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validate = (): boolean => {
    const next: Errors = {}
    if (!form.name.trim()) next.name = 'Name is required'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email'
    if (form.phone && form.phone.replace(/\D/g, '').length < 10) next.phone = 'Enter a valid phone number'
    if (form.serviceTypes.length === 0) next.serviceTypes = 'Select at least one service'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = () => {
    if (!validate()) return
    setSaving(true)
    setTimeout(() => {
      const customer: Customer = {
        id: `C-${Date.now()}`,
        name: form.name.trim(),
        company: form.company.trim() || form.name.trim(),
        email: form.email,
        phone: form.phone,
        address: form.address,
        city: form.city,
        type: form.customerType,
        serviceTypes: form.serviceTypes,
        joined: new Date().toISOString().slice(0, 10),
        health: { score: 100, level: 'Healthy', factors: [] },
      }
      addCustomer(customer)
      setSaving(false)
      setForm(empty)
      setErrors({})
      onClose()
      toast('Customer added successfully.')
    }, 400)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Customer"
      description="Create a new customer record."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Add Customer</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" error={errors.name}>
          <Input name="name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Rajesh Kumar" invalid={!!errors.name} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company Name">
            <Input name="company" value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Optional for individuals" />
          </Field>
          <Field label="City">
            <Select name="city" value={form.city} onChange={(e) => set('city', e.target.value)} options={CITIES.map((c) => ({ value: c, label: c }))} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" error={errors.email}>
            <Input name="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" invalid={!!errors.email} />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <Input name="phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98xxx xxxxx" invalid={!!errors.phone} />
          </Field>
        </div>
        <Field label="Address">
          <Input name="address" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, area, city" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer Type">
            <Select name="customerType" value={form.customerType} onChange={(e) => set('customerType', e.target.value as CustomerType)} options={[{ value: 'Business', label: 'Business' }, { value: 'Individual', label: 'Individual' }]} />
          </Field>
          <Field label="City">
            <Select name="city" value={form.city} onChange={(e) => set('city', e.target.value)} options={CITIES.map((c) => ({ value: c, label: c }))} />
          </Field>
        </div>
        <Field label="Services" error={errors.serviceTypes}>
          <ServicePicker value={form.serviceTypes} onChange={(v) => set('serviceTypes', v)} error={errors.serviceTypes} />
        </Field>
      </div>
    </Modal>
  )
}