import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Select, Field, Textarea } from '../ui/Field'
import { useToast } from '../ui/Toast'
import { useAppStore } from '../../store/AppStore'
import { formatINRExact } from '../../utils/format'
import { toRupees } from '../../utils/money'
import { GST_STATES, BUSINESS, priceInvoice, resolveStateCode, DEFAULT_SERVICE_TAX_RATE } from '../../utils/gst'
import { buildInitialDraft, EMPTY_LINE, DEFAULT_SAC, GST_RATES, type DraftLine } from '../../utils/invoiceDraft'
import { issueInvoice, INVOICE_MIGRATION } from '../../services/invoiceService'

interface Props {
  open: boolean
  onClose: () => void
  /** Pre-fills the customer and, when given, links the invoice to the record. */
  customerId?: string
  paymentId?: string
  amcId?: string
  serviceId?: string
  /**
   * Total the customer owes, in rupees. Pre-fills the amount so the figure
   * being invoiced is the figure that was recorded rather than a retyped one.
   */
  amount?: number
  /** What the money was for, used to seed the line description. */
  description?: string
}

export function InvoiceFormModal({ open, onClose, customerId, paymentId, amcId, serviceId, amount, description }: Props) {
  const { customers } = useAppStore()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [customer, setCustomer] = useState(() => customerId ?? '')
  const [state, setState] = useState('')
  const [notes, setNotes] = useState('')
  const [rate, setRate] = useState(DEFAULT_SERVICE_TAX_RATE)
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Re-seeds the form every time it opens.
   *
   * Without this the fields kept whatever was last typed, so the line items for
   * one customer were still on screen for the next one — and because
   * `effectiveState` below prefers an explicit `state` override, a place of
   * supply corrected for customer A was silently applied to customer B. The tax
   * regime is the one thing on this form that must never carry over.
   */
  useEffect(() => {
    if (!open) return
    const next = buildInitialDraft({ customerId, amount, description })
    setCustomer(next.customer)
    setState(next.state)
    setNotes(next.notes)
    setRate(next.rate)
    setLines(next.lines)
    setError(null)
    setBusy(false)
  }, [open, customerId, paymentId, amcId, serviceId, amount, description])

  const chosen = customers.find((c) => c.id === customer)
  // The customer's own state is the default, because place of supply is a fact
  // about them rather than something to be guessed at on every invoice.
  //
  // Resolved to a code on the way in, because this modal and the customer's tax
  // profile were writing the same column in two different shapes — a name here
  // and a code there. Anything downstream expecting a code then had to cope
  // with both, and where it did not, a Maharashtra customer was charged IGST
  // instead of CGST + SGST with nothing on screen to suggest anything was wrong.
  const effectiveState = state || resolveStateCode(chosen?.state)
  const placeOfSupply = resolveStateCode(effectiveState)

  const priced = useMemo(
    () =>
      priceInvoice(
        lines.map((l) => ({
          description: l.description,
          hsnSac: l.hsnSac || EMPTY_LINE.hsnSac,
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
          taxRate: rate,
        })),
        placeOfSupply || null,
      ),
    [lines, placeOfSupply, rate],
  )

  const setLine = (i: number, key: keyof DraftLine, value: string) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)))

  const submit = async () => {
    setError(null)
    if (!customer) return setError('Choose a customer.')
    if (lines.some((l) => !l.description.trim())) return setError('Every line needs a description.')
    if (priced.lines.every((l) => l.lineTotalPaise <= 0)) return setError('At least one line needs an amount.')

    setBusy(true)
    const res = await issueInvoice({
      customerId: customer,
      paymentId: paymentId ?? null,
      amcId: amcId ?? null,
      serviceId: serviceId ?? null,
      placeOfSupply: placeOfSupply || null,
      notes,
      lines: lines.map((l) => ({
        description: l.description,
        hsnSac: l.hsnSac || EMPTY_LINE.hsnSac,
        quantity: Number(l.quantity) || 1,
        unitPrice: Number(l.unitPrice) || 0,
        taxRate: rate,
      })),
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.message === INVOICE_MIGRATION ? INVOICE_MIGRATION : res.message)
      return
    }
    toast(`Invoice ${res.invoice.number} issued.`)
    onClose()
    navigate(`/invoices/${res.invoice.id}`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Raise a GST invoice"
      description="Amounts are entered as the total the customer pays, tax included."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Issue invoice</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</div>
        )}

        {/* Warn before the invoice exists, not after. By the time a demo invoice
            has a number it is one click from being sent to someone who will
            assume it carries a tax claim. */}
        {BUSINESS.isDemoBusiness && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span className="font-semibold">Demo document.</span> {BUSINESS.legalName} has no GSTIN, so
            this will not be a valid GST tax invoice and carries no tax credit. It exists to
            demonstrate the invoicing flow.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer">
            <Select
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value)
                const c = customers.find((x) => x.id === e.target.value)
                setState(resolveStateCode(c?.state))
              }}
              options={[{ value: '', label: 'Select customer...' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </Field>

          <Field
            label="Place of supply"
            hint={
              !placeOfSupply
                ? 'Not set. Treated as inter-state so IGST is charged, because a missing place of supply must not quietly under-collect tax.'
                : placeOfSupply === BUSINESS.stateCode
                  ? `Intra-state — CGST and SGST at ${(rate / 2).toFixed(rate % 2 === 0 ? 0 : 2)}% each.`
                  : `Inter-state — all tax charged as IGST at ${rate}%.`
            }
            >
            <Select
              value={placeOfSupply}
              onChange={(e) => setState(e.target.value)}
              options={[
                { value: '', label: 'Not stated' },
                ...GST_STATES.map((s) => ({
                  value: s.code,
                  label: `${s.name} (${s.code})${s.code === BUSINESS.stateCode ? ' — our state' : ''}`,
                })),
              ]}
            />
          </Field>

          <Field
            label="GST rate"
            hint={
              rate === 0
                ? 'Nil-rated. No tax is collected and none is shown as collected.'
                : placeOfSupply === BUSINESS.stateCode
                  ? `Applied as CGST ${(rate / 2).toFixed(rate % 2 === 0 ? 0 : 2)}% + SGST ${(rate / 2).toFixed(rate % 2 === 0 ? 0 : 2)}%.`
                  : `Applied in full as IGST.`
            }
          >
            <Select
              value={String(rate)}
              onChange={(e) => setRate(Number(e.target.value))}
              options={GST_RATES.map((r) => ({
                value: String(r),
                label: r === 0 ? '0% — nil rated / exempt' : `${r}%`,
              }))}
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-700">Line items</p>
            <button
              type="button"
              onClick={() => setLines((p) => [...p, { ...EMPTY_LINE }])}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <Field label={i === 0 ? 'Description' : ''}>
                    <Input value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} placeholder="AC service — 2 units" />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label={i === 0 ? 'SAC' : ''}>
                    <Input value={l.hsnSac} onChange={(e) => setLine(i, 'hsnSac', e.target.value)} placeholder={DEFAULT_SAC} />
                  </Field>
                </div>
                <div className="sm:col-span-1">
                  <Field label={i === 0 ? 'Qty' : ''}>
                    <Input type="number" min="0" step="0.5" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label={i === 0 ? 'Amount' : ''}>
                    <Input type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, 'unitPrice', e.target.value)} placeholder="0" />
                  </Field>
                </div>
                <div className="flex items-end pb-1 sm:col-span-2">
                  <span className="flex-1 text-right text-sm font-medium text-slate-800">
                    {formatINRExact(toRupees(priced.lines[i]?.lineTotalPaise ?? 0))}
                  </span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                      className="ml-2 text-slate-400 hover:text-red-600"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Taxable value</dt>
              <dd className="font-medium text-slate-800">{formatINRExact(toRupees(priced.totals.taxable))}</dd>
            </div>
            {priced.totals.interState ? (
              <div className="flex justify-between">
                <dt className="text-slate-500">IGST</dt>
                <dd className="font-medium text-slate-800">{formatINRExact(toRupees(priced.totals.igst))}</dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <dt className="text-slate-500">CGST</dt>
                  <dd className="font-medium text-slate-800">{formatINRExact(toRupees(priced.totals.cgst))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">SGST</dt>
                  <dd className="font-medium text-slate-800">{formatINRExact(toRupees(priced.totals.sgst))}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-1">
              <dt className="font-semibold text-slate-800">Total</dt>
              <dd className="font-semibold text-slate-900">{formatINRExact(toRupees(priced.totals.total))}</dd>
            </div>
          </dl>
        </div>

        <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Includes one free visit under the annual contract." />
      </div>
    </Modal>
  )
}
