/**
 * GST computation for service invoices.
 *
 * The one rule that matters here is intra-state versus inter-state supply. A
 * service supplied within the supplier's own state is taxed as half CGST and
 * half SGST; across a state line it is charged as a single IGST. Getting this
 * wrong is not a rounding error, it is the wrong tax collected.
 *
 * Amounts are paise integers throughout. The `taxRate` is a percentage but is
 * applied with integer arithmetic, so an 18% rate on ₹1,188 is ₹213.84 and
 * never ₹213.84000000000003.
 */
import { toPaise, type Paise } from './money'

/**
 * GST state codes, as used in the first two digits of every GSTIN.
 *
 * The complete set of codes the GST Council assigns, not a subset: an invoice
 * for a customer in Sikkim has to be able to say so, and a list that silently
 * omits states would force an out-of-state technician to leave the field blank,
 * which `isInterState` then reads as "unknown" and taxes at IGST. Wrong, but
 * also unfixable from the screen.
 *
 * `28` is genuinely unassigned and so is absent. `25` is Daman and Diu, which
 * has since merged into Gujarat but still appears on older GSTINs, so it is
 * kept for reading historical registrations.
 */
export const GST_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman and Diu' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
]

/**
 * The supplier's own state.
 *
 * A deployment-level constant, because it is one value that belongs to the
 * business and not to a record. Set it to the state the company is registered
 * in — it decides which invoices split into CGST/SGST and which carry IGST, so
 * a wrong value silently misclassifies every invoice.
 *
 * Karnataka (29), because this is a demo whose customers are in Bengaluru. An
 * intra-state supply, so an 18% service is billed as CGST 9% + SGST 9%.
 *
 * The GSTIN is deliberately empty and must stay that way. ServicePulse is a
 * demo and is not a GST-registered business, so there is no registration to
 * quote. A well-formed-looking number here would be a fabricated tax
 * registration on a document that already carries a real-looking layout, which
 * is a compliance problem rather than a cosmetic one — far worse than printing
 * none. `isDemoBusiness` below makes the invoices say so on their face.
 */
export const BUSINESS = {
  legalName: 'ServicePulse Services Private Limited',
  gstin: '' as string,
  stateCode: '29',
  stateName: 'Karnataka',
  address: 'ServicePulse, Track. Analyze. Retain.',
  email: 'accounts@servicepulse.in',
  phone: '+91 98765 43210',
  /**
   * True while this is a demo with no real registration.
   *
   * Drives the "not a tax invoice" notice on the document, so a rendered demo
   * invoice cannot be mistaken for a submittable one even if it is screenshotted
   * out of context. Set this to false only alongside a real GSTIN and legal
   * identity.
   */
  isDemoBusiness: true,
}

export function stateNameByCode(code: string): string {
  return GST_STATES.find((s) => s.code === code.trim())?.name ?? ''
}

/**
 * Resolves a stored state to its code, accepting either a code or a name.
 *
 * The canonical stored form is the code, because that is what a GST document is
 * written in and it survives a state being renamed. But the name is accepted
 * too, and deliberately so: a customer's tax profile saves a code while the
 * invoice screen picked a name, and a lookup that only understood one of the two
 * made the other resolve to "" — which `isInterState` reads as "unknown", so a
 * Maharashtra customer was silently charged IGST instead of CGST + SGST on every
 * invoice. Wrong tax, no visible error. Accepting both makes that class of
 * mismatch impossible rather than merely absent today.
 */
export function resolveStateCode(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  if (GST_STATES.some((s) => s.code === v)) return v
  const lower = v.toLowerCase()
  return GST_STATES.find((s) => s.name.toLowerCase() === lower)?.code ?? ''
}

export function stateCodeByName(name: string): string {
  return resolveStateCode(name)
}

/** The name to show for whatever a record happens to have stored. */
export function stateLabel(value: string | null | undefined): string {
  const code = resolveStateCode(value)
  return code ? stateNameByCode(code) : (value ?? '').trim()
}

/**
 * True when the place of supply differs from the supplier's state.
 *
 * Unresolvable state on either side returns true, not false. An invoice whose
 * place of supply is unknown is not an intra-state supply — defaulting to CGST
 * would let a missing field quietly under-collect tax, whereas defaulting to
 * IGST is the conservative error and the admin can correct the state.
 */
export function isInterState(placeOfSupplyCode: string | null | undefined): boolean {
  // Resolved rather than compared verbatim, so a value stored as a name, with
  // stray whitespace, or with a different zero-padding than the canonical code
  // still classifies as the state it names.
  const pos = resolveStateCode(placeOfSupplyCode)
  if (!pos) return true
  return pos !== BUSINESS.stateCode
}

export interface TaxBreakup {
  interState: boolean
  taxable: Paise
  cgst: Paise
  sgst: Paise
  igst: Paise
  totalTax: Paise
  total: Paise
}

/**
 * Splits a tax-inclusive total into its tax components.
 *
 * Takes the total, not the base, because that is what the customer agrees to
 * pay and it removes the possibility of a caller adding tax to an already-taxed
 * figure. The half/half split for intra-state cannot leave a stray paisa
 * unassigned, so the odd paisa is put on SGST and the two always sum to the
 * full tax.
 */
export function computeGst(
  totalInclusive: Paise,
  taxRatePercent: number,
  placeOfSupplyCode: string | null | undefined,
): TaxBreakup {
  const interState = isInterState(placeOfSupplyCode)
  if (!Number.isFinite(totalInclusive) || totalInclusive <= 0 || taxRatePercent <= 0) {
    return { interState, taxable: Math.max(0, totalInclusive || 0), cgst: 0, sgst: 0, igst: 0, totalTax: 0, total: Math.max(0, totalInclusive || 0) }
  }
  const totalTax = Math.round((totalInclusive * taxRatePercent) / (100 + taxRatePercent))
  const taxable = totalInclusive - totalTax
  if (interState) {
    return { interState, taxable, cgst: 0, sgst: 0, igst: totalTax, totalTax, total: totalInclusive }
  }
  const cgst = Math.floor(totalTax / 2)
  return { interState, taxable, cgst, sgst: totalTax - cgst, igst: 0, totalTax, total: totalInclusive }
}

/** Default rate. Not every service is 18%; plumbing and some labour is 12% or exempt. */
export const DEFAULT_SERVICE_TAX_RATE = 18

export interface InvoiceLineDraft {
  description: string
  hsnSac: string
  quantity: number
  /** Rupees. Converted to paise internally. */
  unitPrice: number
  taxRate?: number
}

export interface PricedLine {
  description: string
  hsnSac: string
  quantity: number
  unitPricePaise: Paise
  taxRate: number
  lineTotalPaise: Paise
  /** Tax embedded in the line total, apportioned across the invoice. */
  taxPaise: Paise
  taxablePaise: Paise
  cgstPaise: Paise
  sgstPaise: Paise
  igstPaise: Paise
}

/**
 * Prices a set of lines and splits the tax, rounding once at the end.
 *
 * Each line is rounded to a whole paisa on the way in, so a long invoice of
 * cheap items still has a total that equals the sum of what is printed on it.
 * The invoice-level tax split is computed from the combined total rather than
 * by adding up per-line tax, because rounding each line's half of CGST
 * separately is how totals drift by a rupee.
 */
export function priceInvoice(
  lines: InvoiceLineDraft[],
  placeOfSupplyCode: string | null | undefined,
): { lines: PricedLine[]; totals: TaxBreakup } {
  const priced: PricedLine[] = lines.map((l) => {
    const quantity = Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 0
    const unitPricePaise = toPaise(l.unitPrice)
    const lineTotalPaise = Math.round(unitPricePaise * quantity)
    return {
      description: l.description,
      hsnSac: l.hsnSac,
      quantity,
      unitPricePaise,
      taxRate: l.taxRate ?? DEFAULT_SERVICE_TAX_RATE,
      lineTotalPaise,
      taxPaise: 0,
      taxablePaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
    }
  })

  const subtotal = priced.reduce((sum, l) => sum + l.lineTotalPaise, 0)
  const taxRate = priced.find((l) => l.lineTotalPaise > 0)?.taxRate ?? DEFAULT_SERVICE_TAX_RATE
  const totals = computeGst(subtotal, taxRate, placeOfSupplyCode)

  // Apportion the invoice-level tax back onto the lines in proportion to value,
  // then hand any rounding remainder to the last line, so the printed lines
  // always add up to the printed total.
  let allocated = 0
  priced.forEach((l, i) => {
    const share = l.lineTotalPaise === subtotal ? totals.totalTax : Math.round((totals.totalTax * l.lineTotalPaise) / subtotal)
    const tax = i === priced.length - 1 ? totals.totalTax - allocated : share
    allocated += tax
    l.taxPaise = tax
    l.taxablePaise = l.lineTotalPaise - tax
    l.cgstPaise = totals.interState ? 0 : Math.floor(tax / 2)
    l.sgstPaise = totals.interState ? 0 : tax - Math.floor(tax / 2)
    l.igstPaise = totals.interState ? tax : 0
  })

  return { lines: priced, totals }
}
