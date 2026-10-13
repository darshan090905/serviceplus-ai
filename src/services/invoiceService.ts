/**
 * Invoice persistence and issuing.
 *
 * Separate from services/supabase.ts because invoices are the one place where
 * a number has to be legal rather than merely unique, and that deserves its own
 * file rather than another row mapper appended to an already long one.
 */
import { supabase, isSupabaseConfigured, handleError } from './supabase'
import { toPaise } from '../utils/money'
import { priceInvoice, BUSINESS, isInterState, DEFAULT_SERVICE_TAX_RATE, type InvoiceLineDraft } from '../utils/gst'
import type { Invoice, InvoiceLine } from '../types'

export const INVOICE_MIGRATION =
  'phase 4: apply supabase/migrations/004-gst-invoices.sql (invoices, invoice_lines, invoice_number_seq, and the customer gstin/state columns)'

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(n) ? Math.round(n) : 0
}

interface InvoiceRow {
  id: string
  number: string
  payment_id: string | null
  customer_id: string
  amc_id: string | null
  service_id: string | null
  issued_on: string
  due_on: string | null
  supplier_state: string | null
  place_of_supply: string | null
  inter_state: boolean
  tax_rate: number | string
  subtotal_paise: number | string
  discount_paise: number | string
  cgst_paise: number | string
  sgst_paise: number | string
  igst_paise: number | string
  total_paise: number | string
  amount_paid_paise: number | string
  notes: string | null
  created_at: string
}

interface LineRow {
  id: string
  invoice_id: string
  position: number
  description: string
  hsn_sac: string | null
  quantity: number | string
  unit_price_paise: number | string
  tax_rate: number | string
  line_total_paise: number | string
}

function lineFromRow(r: LineRow): InvoiceLine {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    position: r.position,
    description: r.description,
    hsnSac: r.hsn_sac ?? '',
    quantity: typeof r.quantity === 'string' ? Number(r.quantity) : r.quantity,
    unitPricePaise: num(r.unit_price_paise),
    taxRate: typeof r.tax_rate === 'string' ? Number(r.tax_rate) : r.tax_rate,
    lineTotalPaise: num(r.line_total_paise),
  }
}

function invoiceFromRow(r: InvoiceRow, lines: InvoiceLine[]): Invoice {
  return {
    id: r.id,
    number: r.number,
    paymentId: r.payment_id,
    customerId: r.customer_id,
    amcId: r.amc_id,
    serviceId: r.service_id,
    issuedOn: r.issued_on,
    dueOn: r.due_on,
    supplierState: r.supplier_state,
    placeOfSupply: r.place_of_supply,
    interState: r.inter_state,
    taxRate: typeof r.tax_rate === 'string' ? Number(r.tax_rate) : r.tax_rate,
    subtotalPaise: num(r.subtotal_paise),
    discountPaise: num(r.discount_paise),
    cgstPaise: num(r.cgst_paise),
    sgstPaise: num(r.sgst_paise),
    igstPaise: num(r.igst_paise),
    totalPaise: num(r.total_paise),
    amountPaidPaise: num(r.amount_paid_paise),
    notes: r.notes ?? '',
    createdAt: r.created_at,
    lines,
  }
}

function lineToRow(l: InvoiceLine): LineRow {
  return {
    id: l.id,
    invoice_id: l.invoiceId,
    position: l.position,
    description: l.description,
    hsn_sac: l.hsnSac || null,
    quantity: l.quantity,
    unit_price_paise: l.unitPricePaise,
    tax_rate: l.taxRate,
    line_total_paise: l.lineTotalPaise,
  }
}

function invoiceToRow(i: Invoice): InvoiceRow {
  return {
    id: i.id,
    number: i.number,
    payment_id: i.paymentId,
    customer_id: i.customerId,
    amc_id: i.amcId,
    service_id: i.serviceId,
    issued_on: i.issuedOn,
    due_on: i.dueOn,
    supplier_state: i.supplierState,
    place_of_supply: i.placeOfSupply,
    inter_state: i.interState,
    tax_rate: i.taxRate,
    subtotal_paise: i.subtotalPaise,
    discount_paise: i.discountPaise,
    cgst_paise: i.cgstPaise,
    sgst_paise: i.sgstPaise,
    igst_paise: i.igstPaise,
    total_paise: i.totalPaise,
    amount_paid_paise: i.amountPaidPaise,
    notes: i.notes || null,
    created_at: i.createdAt,
  }
}

/**
 * The next number in the legal series.
 *
 * `nextval` is atomic, so two admins raising an invoice at the same moment get
 * two different numbers. The alternative — read the max, add one, insert — is
 * how a series ends up with two invoices numbered the same, which is the kind
 * of problem an auditor finds and the business cannot explain.
 */
async function nextInvoiceNumber(): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('next_invoice_number').single()
  if (error) {
    handleError(error)
    return null
  }
  // The function returns a text like 'INV-000042'. The cast is because
  // PostgREST hands back a JSON scalar whose type the client cannot infer.
  const value = (data as unknown as { next_invoice_number?: string } | string | null)
  const n = typeof value === 'object' && value ? value.next_invoice_number : value
  return n ? String(n) : null
}

export interface DraftInvoice {
  customerId: string
  paymentId?: string | null
  amcId?: string | null
  serviceId?: string | null
  /** Customer's GST state code, which selects the tax regime. */
  placeOfSupply: string | null
  lines: InvoiceLineDraft[]
  notes?: string
  dueOn?: string | null
  amountPaidPaise?: number
  issuedOn?: string
}

export type IssueResult = { ok: true; invoice: Invoice } | { ok: false; message: string }

/**
 * Prices, numbers and writes an invoice.
 *
 * The header and its lines are written in one transaction. Two statements
 * would leave a real possibility of a header with no lines — an invoice that
 * totals nothing and looks legitimate — if the second failed.
 */
export async function issueInvoice(draft: DraftInvoice): Promise<IssueResult> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, message: 'Database is not configured.' }
  if (!draft.customerId) return { ok: false, message: 'An invoice needs a customer.' }
  if (!draft.lines.length) return { ok: false, message: 'An invoice needs at least one line.' }
  if (draft.lines.some((l) => !l.description.trim())) return { ok: false, message: 'Every line needs a description.' }

  const { lines: priced, totals } = priceInvoice(draft.lines, draft.placeOfSupply)
  if (priced.every((l) => l.lineTotalPaise <= 0)) {
    return { ok: false, message: 'Every line is zero, so there is nothing to invoice.' }
  }

  const number = await nextInvoiceNumber()
  if (!number) return { ok: false, message: INVOICE_MIGRATION }

  const id = `INV${Date.now()}`
  const invoice: Invoice = {
    id,
    number,
    paymentId: draft.paymentId ?? null,
    customerId: draft.customerId,
    amcId: draft.amcId ?? null,
    serviceId: draft.serviceId ?? null,
    issuedOn: draft.issuedOn ?? new Date().toISOString().slice(0, 10),
    dueOn: draft.dueOn ?? null,
    supplierState: BUSINESS.stateName,
    placeOfSupply: draft.placeOfSupply || null,
    interState: isInterState(draft.placeOfSupply),
    taxRate: priced.find((l) => l.lineTotalPaise > 0)?.taxRate ?? DEFAULT_SERVICE_TAX_RATE,
    subtotalPaise: priced.reduce((s, l) => s + l.lineTotalPaise, 0),
    discountPaise: 0,
    cgstPaise: totals.cgst,
    sgstPaise: totals.sgst,
    igstPaise: totals.igst,
    totalPaise: totals.total,
    amountPaidPaise: draft.amountPaidPaise ?? 0,
    notes: draft.notes ?? '',
    createdAt: new Date().toISOString(),
    lines: priced.map((l, i) => ({
      id: `${id}L${i + 1}`,
      invoiceId: id,
      position: i,
      description: l.description,
      hsnSac: l.hsnSac,
      quantity: l.quantity,
      unitPricePaise: l.unitPricePaise,
      taxRate: l.taxRate,
      lineTotalPaise: l.lineTotalPaise,
    })),
  }

  const { error } = await supabase.rpc('create_invoice_with_lines', {
    p_invoice: invoiceToRow(invoice),
    p_lines: invoice.lines.map(lineToRow),
  })

  if (error) {
    // The sequence function is the only piece that needs a database function, so
    // an unapplied migration is the overwhelmingly likely cause and is named as
    // such rather than as a generic permission error.
    if (/does not exist|PGRST|42883|42P01|permission denied/i.test(`${error.code ?? ''} ${error.message}`)) {
      return { ok: false, message: INVOICE_MIGRATION }
    }
    handleError(error)
    return { ok: false, message: error.message }
  }
  return { ok: true, invoice }
}

export async function loadInvoices(customerId?: string): Promise<Invoice[]> {
  if (!isSupabaseConfigured() || !supabase) return []
  const q = supabase.from('invoices').select('*').order('issued_on', { ascending: false }).order('number', { ascending: false })
  if (customerId) q.eq('customer_id', customerId)
  const { data, error } = await q
  if (error) {
    if (!/does not exist|PGRST|42P01/i.test(`${error.code ?? ''} ${error.message}`)) handleError(error)
    return []
  }
  const rows = (data ?? []) as unknown as InvoiceRow[]
  if (!rows.length) return []
  const { data: lineData } = await supabase
    .from('invoice_lines')
    .select('*')
    .in('invoice_id', rows.map((r) => r.id))
    .order('position')
  const byInvoice = new Map<string, InvoiceLine[]>()
  for (const l of (lineData ?? []) as unknown as LineRow[]) {
    const line = lineFromRow(l)
    byInvoice.set(line.invoiceId, [...(byInvoice.get(line.invoiceId) ?? []), line])
  }
  return rows.map((r) => invoiceFromRow(r, byInvoice.get(r.id) ?? []))
}

export async function loadInvoice(idOrNumber: string): Promise<Invoice | null> {
  if (!isSupabaseConfigured() || !supabase) return null
  // Accepts either the primary key or the printed number, because a customer
  // quoting "INV-000042" should find their invoice without anyone having to
  // know which of the two the app uses internally.
  const isNumber = /^INV-/i.test(idOrNumber)
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq(isNumber ? 'number' : 'id', idOrNumber)
    .maybeSingle()
  if (error || !data) {
    if (error && !/does not exist|PGRST|42P01/i.test(`${error.code ?? ''} ${error.message}`)) handleError(error)
    return null
  }
  const row = data as unknown as InvoiceRow
  const { data: lineData } = await supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', row.id)
    .order('position')
  return invoiceFromRow(row, ((lineData ?? []) as unknown as LineRow[]).map(lineFromRow))
}

/** Records money received against an invoice. Clamped to the total, never above it. */
export async function recordInvoicePayment(id: string, amountRupees: number): Promise<boolean> {
  if (!supabase) return false
  const invoice = await loadInvoice(id)
  if (!invoice) return false
  const already = invoice.amountPaidPaise
  const next = Math.min(invoice.totalPaise, already + toPaise(amountRupees))
  const { error } = await supabase.from('invoices').update({ amount_paid_paise: next }).eq('id', id)
  if (error) {
    handleError(error)
    return false
  }
  return true
}
