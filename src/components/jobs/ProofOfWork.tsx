import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Package, PenLine, Trash2 } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input, Field } from '../ui/Field'
import { EmptyState } from '../ui/EmptyState'
import { SignaturePad } from './SignaturePad'
import { useToast } from '../ui/Toast'
import { formatDateTime } from '../../utils/dates'
import { formatINRExact } from '../../utils/format'
import {
  loadEvidence, uploadPhoto, uploadSignature, deleteAttachment, addPartDb, deletePartDb, PROOF_OF_WORK_MIGRATION,
} from '../../services/jobService'
import type { Evidence } from '../../services/jobService'
import type { JobAttachment, JobPart } from '../../types'

interface Props {
  serviceId: string
  /** Whose camera the photos came from. Recorded as a claim, not a fact. */
  takenBy?: string
  /** Hides the capture controls and shows the record only. */
  readOnly?: boolean
  /** Drops the section headings' margins for use inside a modal. */
  compact?: boolean
}

const empty: Evidence = { attachments: [], parts: [], signature: null }

/**
 * Photos, parts and sign-off for one visit.
 *
 * Shared by the admin visit record and the technician's completion modal
 * because they answer the same question — "what is the evidence for this job?"
 * — and were about to drift into two different answers. It owns its own
 * loading and upload state; the parent only supplies a visit id.
 */
export function ProofOfWorkPanel({ serviceId, takenBy = '', readOnly = false, compact = false }: Props) {
  const { toast } = useToast()
  const [evidence, setEvidence] = useState<Evidence>(empty)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null)
  const [signedBy, setSignedBy] = useState('')
  const [roleNote, setRoleNote] = useState('')
  const [draft, setDraft] = useState({ name: '', quantity: '1', unitPrice: '', costPrice: '', serialNo: '' })

  const refresh = useCallback(async () => {
    setEvidence(await loadEvidence(serviceId))
    setLoaded(true)
  }, [serviceId])

  useEffect(() => {
    setLoaded(false)
    setError(null)
    void refresh()
  }, [refresh])

  /**
   * A signed display URL expires, so a tab left open over an hour starts
   * showing broken images. Re-mint once on the first failure rather than
   * wrapping the URL in a state machine: the commonest cause of a load error
   * here is simply age, and a second failure is a genuinely missing or denied
   * object that another reload will not fix.
   */
  const resignOnce = useRef(false)
  const onImageError = () => {
    if (resignOnce.current) return
    resignOnce.current = true
    void refresh().finally(() => {
      // Re-armed after the reload settles, so a later expiry on the same panel
      // can recover too.
      setTimeout(() => {
        resignOnce.current = false
      }, 1000)
    })
  }

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return
    setBusy(true)
    setError(null)
    let failed = 0
    let lastMessage = ''
    for (const file of Array.from(files)) {
      const res = await uploadPhoto(serviceId, file, { takenBy })
      if (!res.ok) {
        failed++
        lastMessage = res.message
      }
    }
    setBusy(false)
    setError(failed ? `${failed} of ${files.length} failed. ${lastMessage}` : null)
    if (!failed) toast(`${files.length} photo${files.length > 1 ? 's' : ''} attached.`)
    await refresh()
  }

  const saveSignature = async () => {
    if (!pendingBlob) return
    setBusy(true)
    setError(null)
    const res = await uploadSignature(serviceId, pendingBlob, signedBy, roleNote)
    setBusy(false)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setPendingBlob(null)
    setSignedBy('')
    setRoleNote('')
    toast('Sign-off recorded.')
    await refresh()
  }

  const addPart = async () => {
    const quantity = Number(draft.quantity)
    const unitPrice = Number(draft.unitPrice)
    if (!draft.name.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      setError('A part needs a name and a quantity above zero.')
      return
    }
    const part: JobPart = {
      id: `PRT${Date.now()}`,
      serviceId,
      name: draft.name.trim(),
      quantity,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      costPrice: Number(draft.costPrice) || 0,
      serialNo: draft.serialNo.trim(),
      createdAt: new Date().toISOString(),
    }
    if (!(await addPartDb(part))) {
      setError('Could not save the part.')
      return
    }
    setDraft({ name: '', quantity: '1', unitPrice: '', costPrice: '', serialNo: '' })
    setError(null)
    await refresh()
  }

  const removePart = async (part: JobPart) => {
    // Optimistic: the row disappears immediately, which is what a technician
    // standing in a plant room expects. A failure is caught on the next load.
    setEvidence((prev) => ({ ...prev, parts: prev.parts.filter((p) => p.id !== part.id) }))
    await deletePartDb(part.id)
  }

  const removePhoto = async (a: JobAttachment) => {
    setEvidence((prev) => ({ ...prev, attachments: prev.attachments.filter((x) => x.id !== a.id) }))
    await deleteAttachment(a.id, a.storagePath)
  }

  const spacing = compact ? 'space-y-4' : 'space-y-5'
  const bodyGap = compact ? 'p-4' : undefined

  return (
    <div className={spacing}>
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
          {error.includes(PROOF_OF_WORK_MIGRATION) && (
            <p className="mt-1 text-amber-700">The rest of the app is unaffected; only proof of work is unavailable.</p>
          )}
        </div>
      )}

      <Card title="Photo evidence" bodyClassName={bodyGap}>
        {evidence.attachments.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {evidence.attachments.map((a) => (
              <figure key={a.id} className="overflow-hidden rounded-lg border border-slate-200">
                <img src={a.url} alt={a.caption || 'Visit photo'} className="h-32 w-full bg-slate-50 object-cover" loading="lazy" onError={onImageError} />
                <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="truncate text-[11px] text-slate-500">{a.caption || formatDateTime(a.createdAt)}</span>
                  {!readOnly && (
                    <button onClick={() => removePhoto(a)} className="shrink-0 text-slate-400 hover:text-red-600" aria-label="Remove photo">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <EmptyState icon={Camera} title="No photos yet" description="A visit with no photos is a claim, not a record." />
        )}
        {!readOnly && (
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-600">
            <Camera className="h-4 w-4" />
            {busy ? 'Working...' : 'Add photos'}
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="sr-only"
              onChange={(e) => { void onFiles(e.target.files); e.target.value = '' }}
            />
          </label>
        )}
      </Card>

      <Card title="Parts used" bodyClassName={bodyGap}>
        {evidence.parts.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3 font-medium">Part</th>
                  <th className="py-2 pr-3 font-medium">Qty</th>
                  <th className="py-2 pr-3 font-medium">Unit</th>
                  <th className="py-2 pr-3 font-medium">Line</th>
                  {!readOnly && <th className="py-2 font-medium" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {evidence.parts.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3">
                      <span className="font-medium text-slate-800">{p.name}</span>
                      {p.serialNo && <span className="block text-xs text-slate-400">SN {p.serialNo}</span>}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{p.quantity}</td>
                    <td className="py-2 pr-3 text-slate-600">{formatINRExact(p.unitPrice)}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800">{formatINRExact(p.unitPrice * p.quantity)}</td>
                    {!readOnly && (
                      <td className="py-2 text-right">
                        <button onClick={() => removePart(p)} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${p.name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!readOnly && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-1">
                <Field label="Part">
                  <Input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Relay" />
                </Field>
              </div>
              <Field label="Qty">
                <Input type="number" min="1" step="1" value={draft.quantity} onChange={(e) => setDraft((p) => ({ ...p, quantity: e.target.value }))} />
              </Field>
              <Field label="Charge">
                <Input type="number" min="0" step="0.01" value={draft.unitPrice} onChange={(e) => setDraft((p) => ({ ...p, unitPrice: e.target.value }))} placeholder="0" />
              </Field>
              <Field label="Cost">
                <Input type="number" min="0" step="0.01" value={draft.costPrice} onChange={(e) => setDraft((p) => ({ ...p, costPrice: e.target.value }))} placeholder="0" />
              </Field>
            </div>
            <div className="mt-3">
              <Button size="sm" onClick={addPart} disabled={busy}><Package className="h-3.5 w-3.5" /> Add part</Button>
            </div>
          </>
        )}
      </Card>

      <Card title="Customer sign-off" bodyClassName={bodyGap}>
        {evidence.signature ? (
          <div className="space-y-3">
            <img
              src={evidence.signature.url}
              alt={`Signature of ${evidence.signature.signedBy}`}
              className="h-28 rounded-lg border border-slate-200 bg-white object-contain"
              onError={onImageError}
            />
            <p className="text-sm text-slate-600">
              Signed by <span className="font-medium text-slate-900">{evidence.signature.signedBy}</span>
              {evidence.signature.roleNote ? `, ${evidence.signature.roleNote}` : ''} on {formatDateTime(evidence.signature.createdAt)}.
            </p>
          </div>
        ) : readOnly ? (
          <EmptyState icon={PenLine} title="Not signed off" description="Nobody has signed for this visit." />
        ) : (
          <div className="space-y-3">
            <SignaturePad onCaptureChange={setPendingBlob} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Signed by">
                <Input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Customer or attendant" />
              </Field>
              <Field label="Role (optional)">
                <Input value={roleNote} onChange={(e) => setRoleNote(e.target.value)} placeholder="Facilities Manager" />
              </Field>
            </div>
            <Button onClick={saveSignature} disabled={!pendingBlob || !signedBy.trim() || busy}>
              <PenLine className="h-4 w-4" /> Record sign-off
            </Button>
            {loaded && (
              <p className="text-xs text-slate-400">
                A sign-off records that someone agreed the work was done. It is not a legal e-signature.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
