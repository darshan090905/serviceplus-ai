import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquareWarning, Send, Mail, MapPin, Crosshair, CheckCircle2, X } from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Select, Field } from '../../components/ui/Field'
import { LocationMap } from '../../components/maps/LocationMap'
import { useToast } from '../../components/ui/Toast'
import { COMPLAINT_CATEGORIES } from '../../constants'
import { resolveTechnicianId } from '../../utils/technicians'
import { assignTechnicianFor } from '../../data/auth'
import { reverseGeocode, currentCoords, type GeoPoint } from '../../utils/geo'
import type { Complaint, Severity, ServiceTypeKey } from '../../types'

interface FormState {
  category: string
  description: string
  severity: Severity
  serviceType: string
}

export function PortalComplaintFormPage() {
  const { session, customers, complaints, accounts, addComplaint } = useAppStore()
  const { toast } = useToast()
  const navigate = useNavigate()
  const customer = customers.find((c) => c.id === session?.customerId)
  const [form, setForm] = useState<FormState>(() => ({
    category: 'Service Quality',
    description: '',
    severity: 'Medium',
    serviceType: customer?.serviceTypes[0] ?? 'AC Service',
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loc, setLoc] = useState<{ lat: number; lng: number; address: string } | null>(null)
  const [locAddress, setLocAddress] = useState('')
  const [picking, setPicking] = useState(false)

  if (!customer) return null

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }

  const openMap = () => {
    setPicking(true)
    toast('Select your service location on the map, or use your current GPS location.')
  }

  const onPick = async (pt: GeoPoint) => {
    if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lng)) {
      toast('Could not get your location. Select a spot on the map instead.')
      return
    }
    const address = (await reverseGeocode(pt.lat, pt.lng)) ?? ''
    setLoc({ lat: pt.lat, lng: pt.lng, address })
    setLocAddress(address)
    setPicking(true)
    toast('Location selected. You can adjust the address below.', 'success')
  }

  const useGps = async () => {
    setPicking(true)
    const gps = await currentCoords()
    if (!gps) {
      toast('Location permission denied or unavailable — pick a spot on the map instead.')
      return
    }
    await onPick(gps)
  }

  const submit = () => {
    const next: Record<string, string> = {}
    if (form.description.trim().length < 10) next.description = 'Please describe the issue in at least 10 characters'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)
    setTimeout(() => {
      const max = complaints.reduce((acc, c) => {
        const n = Number(c.id.slice(4))
        return Number.isFinite(n) && n > acc ? n : acc
      }, 1000)
      const serviceType = form.serviceType as ServiceTypeKey
      const technician = assignTechnicianFor(serviceType)
      const created: Complaint = {
        id: `CMP-${max + 1}`,
        customerId: customer.id,
        category: form.category as Complaint['category'],
        description: form.description.trim(),
        severity: form.severity,
        status: 'Open',
        created: new Date().toISOString().slice(0, 10),
        assignedTo: technician,
        // Store the profile id beside the name. The name is what gets shown and
        // what old rows carry, but the id is what survives a rename — otherwise
        // every visit booked under an old spelling quietly drops off the
        // dispatch board the first time somebody corrects their name.
        assignedToId: resolveTechnicianId(technician, accounts),
        serviceType,
        latitude: loc?.lat ?? null,
        longitude: loc?.lng ?? null,
        locationAddress: loc ? (locAddress.trim() || loc.address || null) : null,
        locationSharedAt: loc ? new Date().toISOString() : null,
      }
      addComplaint(created)
      setSaving(false)
      const urgent = form.severity === 'High' || form.severity === 'Critical'
      toast(
        loc
          ? `Complaint submitted with your exact location${urgent ? ` — ${technician} alerted.` : '.'}`
          : urgent
            ? `Complaint submitted. ${technician} has been notified by email.`
            : 'Complaint submitted. Our team will contact you shortly.',
      )
      navigate(`/portal/complaints/${created.id}`)
    }, 400)
  }

  return (
    <div>
      <button onClick={() => navigate('/portal/complaints')} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Back to my complaints
      </button>

      <div className="mx-auto max-w-2xl">
        <Card
          title="Raise a Complaint"
          description={`Reported by ${customer.name} · ${customer.company}. Our team will review and respond.`}
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Service / Equipment">
                <Select value={form.serviceType} onChange={(e) => set('serviceType', e.target.value)} options={customer.serviceTypes.map((s) => ({ value: s, label: s }))} />
              </Field>
              <Field label="Category">
                <Select value={form.category} onChange={(e) => set('category', e.target.value)} options={COMPLAINT_CATEGORIES.map((c) => ({ value: c, label: c }))} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Severity">
                <Select value={form.severity} onChange={(e) => set('severity', e.target.value as Severity)} options={['Low', 'Medium', 'High', 'Critical'].map((s) => ({ value: s, label: s }))} />
              </Field>
            </div>
            <Field label="Describe the issue" error={errors.description}>
              <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Tell us what went wrong and how it affects you..." />
            </Field>

            {!loc && !picking ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" icon={<Crosshair className="h-4 w-4" />} onClick={() => void useGps()}>
                  Share My Location
                </Button>
                <Button variant="outline" icon={<MapPin className="h-4 w-4" />} onClick={openMap}>
                  Select Location on Map
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
                    {loc ? 'Your service location' : 'Select your service location'}
                  </p>
                  {loc && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Location selected
                    </span>
                  )}
                </div>
                <LocationMap
                  interactive
                  value={loc ? { lat: loc.lat, lng: loc.lng } : null}
                  onPick={(pt) => void onPick(pt)}
                  className="h-64"
                />
                {loc && (
                  <div className="mt-3 space-y-2">
                    <Field label="Address (editable)">
                      <Input value={locAddress} onChange={(e) => setLocAddress(e.target.value)} placeholder="Street, area, city..." />
                    </Field>
                    <p className="text-xs text-slate-400">
                      Coordinates: {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<X className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setLoc(null)
                        setLocAddress('')
                        setPicking(false)
                      }}
                    >
                      Remove location
                    </Button>
                  </div>
                )}
              </div>
            )}

            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden />
              Your complaint appears instantly on our service desk dashboard, assigned to {assignTechnicianFor(form.serviceType) || 'the assigned technician'}.
            </p>
            {(form.severity === 'High' || form.severity === 'Critical') && (
              <p className="flex items-center gap-1.5 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-brand-700">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {form.severity} complaints send an immediate email alert to the assigned technician.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => navigate('/portal/complaints')}>Cancel</Button>
              <Button onClick={submit} loading={saving} icon={<Send className="h-4 w-4" />}>Submit Complaint</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}