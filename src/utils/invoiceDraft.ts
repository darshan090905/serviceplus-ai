import { DEFAULT_SERVICE_TAX_RATE } from './gst'

/** One editable line on the invoice form, held as raw strings. */
export interface DraftLine {
  description: string
  hsnSac: string
  quantity: string
  unitPrice: string
}

/**
 * Service Accounting Code for installation/maintenance of AC, the default kind
 * of work here.
 */
export const DEFAULT_SAC = '998719'

/** A blank row, used for the "add line" button and as the pre-open default. */
export const EMPTY_LINE: DraftLine = {
  description: '',
  hsnSac: DEFAULT_SAC,
  quantity: '1',
  unitPrice: '',
}

/**
 * GST rates offered on the form.
 *
 * One rate applies to the whole invoice: `priceInvoice` reads the rate from the
 * first non-zero line and applies it invoice-wide, so a per-line control would
 * display values that are then discarded. The schema does carry a per-line
 * `tax_rate`, but honouring it would mean reworking the "round once at the end"
 * invariant that GST reconciliation depends on, for a multi-rate invoice that a
 * service business rarely issues.
 */
export const GST_RATES = [0, 5, 12, 18, 28]

/** What the form needs to know to seed itself for one invoice. */
export interface InvoiceSeed {
  customerId?: string
  /** Total owed in rupees. Pre-fills the amount so the invoiced figure is the recorded one. */
  amount?: number
  /** What the money was for; seeds the line description. */
  description?: string
}

export interface InitialDraft {
  customer: string
  /**
   * Always blank. Place of supply is resolved from the chosen customer at render
   * time, so a blank here is indistinguishable from a deliberate override — which
   * is exactly what makes this safe: a stale override from a previous invoice is
   * impossible because the override is never restored.
   */
  state: string
  notes: string
  rate: number
  lines: DraftLine[]
}

/**
 * Builds the starting form state for a single invoice.
 *
 * Deliberately a pure function of its inputs and always a fresh object, because
 * the bug this replaces was state *surviving* between invoices. The most
 * dangerous thing that could leak is `state`: the customer's place of supply
 * decides CGST + SGST versus IGST, so an override corrected for one customer
 * being applied to the next would mis-tax the invoice with nothing on screen to
 * suggest anything was wrong. Returning a fresh value on every call makes that
 * class of leak unrepresentable rather than merely unlikely.
 */
export function buildInitialDraft(seed: InvoiceSeed): InitialDraft {
  const hasAmount = typeof seed.amount === 'number' && Number.isFinite(seed.amount) && seed.amount > 0
  const description = seed.description?.trim() ?? ''
  return {
    customer: seed.customerId ?? '',
    state: '',
    notes: '',
    rate: DEFAULT_SERVICE_TAX_RATE,
    lines: [
      {
        description: description || (hasAmount ? 'Service rendered' : ''),
        hsnSac: DEFAULT_SAC,
        quantity: '1',
        unitPrice: hasAmount ? String(seed.amount) : '',
      },
    ],
  }
}
