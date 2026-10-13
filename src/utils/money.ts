import type { JobPart } from '../types'

/**
 * Job costing, in paise.
 *
 * Everything here multiplies and adds integers rather than floats, because
 * money in binary floating point does not add up. A part at ₹149.50 x 3 and a
 * labour charge of ₹1200.10 has to total exactly what the invoice says, and
 * 0.1 + 0.2 has to be 0.3. Rounding to paise at each step and only converting
 * to rupees for display is the whole point.
 *
 * Paise, not rupees-times-100 computed on the fly, because `149.5 * 100` is
 * 14949.999999999998 in IEEE 754.
 */
export type Paise = number

/**
 * Rupees to paise.
 *
 * Guarded, because this is a money primitive and a NaN reaching it from a form
 * field would otherwise propagate silently through every total and render as
 * "₹NaN" on an invoice. Garbage in becomes zero, which at least balances.
 */
export const toPaise = (rupees: number): Paise =>
  Number.isFinite(rupees) ? Math.round(rupees * 100) : 0

export const toRupees = (paise: Paise): number => paise / 100

/**
 * Line total for one part, in paise.
 *
 * The quantity is multiplied, not rounded. Rounding it to a whole unit would
 * quietly overcharge (0.5m of cable billed as 1m) and fractional quantities are
 * ordinary — half an hour of labour, a metre of conduit, two and a half litres
 * of refrigerant. Rounding happens once, on the paise result.
 */
export function lineTotalPaise(part: Pick<JobPart, 'quantity' | 'unitPrice'>): Paise {
  const qty = Number.isFinite(part.quantity) ? part.quantity : 0
  return Math.round(toPaise(part.unitPrice) * qty)
}

/** Everything the customer was charged for parts, in paise. */
export function partsTotalPaise(parts: JobPart[]): Paise {
  return parts.reduce((sum, p) => sum + lineTotalPaise(p), 0)
}

/** What we paid for those parts, in paise. Never shown to a customer. */
export function partsCostPaise(parts: JobPart[]): Paise {
  return parts.reduce(
    (sum, p) => sum + Math.round(toPaise(p.costPrice) * (Number.isFinite(p.quantity) ? p.quantity : 0)),
    0,
  )
}

export function marginPaise(parts: JobPart[]): Paise {
  return partsTotalPaise(parts) - partsCostPaise(parts)
}

/**
 * Margin as a fraction of the sell price, or null when there is no sell price
 * to take a percentage of.
 *
 * Null rather than 0 because "we made nothing" and "there is no revenue to
 * measure against" are different answers, and a 0% margin on a job with no
 * parts on it would read as a pricing failure that never happened.
 */
export function marginPercent(parts: JobPart[]): number | null {
  const sell = partsTotalPaise(parts)
  if (sell === 0) return null
  return (marginPaise(parts) / sell) * 100
}

export interface JobCost {
  parts: Paise
  cost: Paise
  margin: Paise
  marginPercent: number | null
  labour: Paise
  total: Paise
}

/**
 * The full picture for a visit: what the parts cost us, what the customer is
 * charged, and the difference.
 *
 * `labour` is a charge, not a cost — there is no labour cost figure anywhere in
 * the product yet, so margin deliberately reflects parts only rather than
 * pretending to know what a technician's hour costs. The comment on the field
 * is the honest version of that limitation.
 */
export function jobCost(parts: JobPart[], labourCharge = 0): JobCost {
  const p = partsTotalPaise(parts)
  const c = partsCostPaise(parts)
  const labour = toPaise(labourCharge)
  return {
    parts: p,
    cost: c,
    margin: p - c,
    marginPercent: marginPercent(parts),
    labour,
    total: p + labour,
  }
}

/**
 * Splits a tax-inclusive amount into base and tax.
 *
 * Tax is extracted, never added on: a caller holding a grand total must not
 * also be able to add tax to it and get a different, wrong answer. Rounding
 * puts the remainder on the tax component rather than the base so the two
 * always reconcile to exactly the input.
 */
export function extractTax(totalPaise: Paise, ratePercent: number): { base: Paise; tax: Paise } {
  if (ratePercent <= 0) return { base: totalPaise, tax: 0 }
  const tax = Math.round((totalPaise * ratePercent) / 100)
  return { base: totalPaise - tax, tax }
}
