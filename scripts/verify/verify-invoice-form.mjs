/**
 * Phase 4 logic harness: invoice form seeding and reset.
 *
 * The bug this guards against is a *leak*, so most of these assertions are
 * about the second and third invoice rather than the first. A prefill that works
 * is easy; what matters is that opening an invoice for customer B cannot show
 * customer A's line items, and above all cannot reuse customer A's place of
 * supply — because that field is not cosmetic. It decides CGST + SGST versus
 * IGST, so a stale override mis-taxes the invoice with nothing on screen to
 * suggest anything was wrong.
 *
 * The seeding logic is asserted behaviourally rather than by pattern-matching
 * the component, because the whole failure mode was a field that *looked*
 * initialised but was not actually being reset.
 */
import { readFileSync } from 'node:fs'
import { buildInitialDraft, EMPTY_LINE, DEFAULT_SAC, GST_RATES } from '../../src/utils/invoiceDraft.ts'
import { priceInvoice, resolveStateCode, DEFAULT_SERVICE_TAX_RATE } from '../../src/utils/gst.ts'

let pass = 0
let fail = 0
const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b)
function check(label, actual, expected) {
  if (same(actual, expected)) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`) }
}

console.log('\nSeeding from a payment')
{
  const d = buildInitialDraft({
    customerId: 'C-1',
    amount: 1188,
    description: 'INV-0042 — UPI payment due 12 Mar 2026',
  })
  check('the customer comes from the payment', d.customer, 'C-1')
  check('exactly one line is seeded', d.lines.length, 1)
  check('the amount is pre-filled, not left for retyping', d.lines[0].unitPrice, '1188')
  check('the description is carried across', d.lines[0].description, 'INV-0042 — UPI payment due 12 Mar 2026')
  check('quantity starts at one', d.lines[0].quantity, '1')
  check('the SAC is the AC services code', d.lines[0].hsnSac, DEFAULT_SAC)
  check('the rate starts at the standard service rate', d.rate, DEFAULT_SERVICE_TAX_RATE)
  check('there are no notes to inherit', d.notes, '')
  // Deliberately blank, so the render-time fallback resolves it from the
  // customer. Asserted because an earlier version returned a name here, which
  // then shadowed the customer's own state for every later invoice.
  check('no place-of-supply override is seeded', d.state, '')
}

console.log('\nSeeding without a payment')
{
  const d = buildInitialDraft({ customerId: 'C-2' })
  check('a blank amount is not seeded as zero', d.lines[0].unitPrice, '')
  check('a blank amount does not fake a description', d.lines[0].description, '')
  check('the customer is still carried through', d.customer, 'C-2')
  check('still exactly one line', d.lines.length, 1)
}
{
  // An amount of zero is a real figure on a fully credited invoice, but
  // "0" in a number field invites an accidental overtype, and the form
  // validates for a non-zero total anyway.
  const d = buildInitialDraft({ amount: 0 })
  check('a zero or negative amount is treated as unknown', d.lines[0].unitPrice, '')
  const e = buildInitialDraft({ amount: Number.NaN })
  check('a non-finite amount is treated as unknown', e.lines[0].unitPrice, '')
}

console.log('\nNothing survives from a previous invoice')
{
  // The scenario the fix exists for: invoice A is corrected to a different
  // state, then invoice B is opened. B must not inherit A's override.
  const a = buildInitialDraft({ customerId: 'C-1', amount: 5000, description: 'Compressor replacement' })
  const b = buildInitialDraft({ customerId: 'C-2', amount: 800, description: 'Annual service' })

  check("A's amount is not B's", b.lines[0].unitPrice, '800')
  check("A's description is not B's", b.lines[0].description, 'Annual service')
  check("A's customer is not B's", b.customer, 'C-2')
  check('B carries no place-of-supply override', b.state, '')
  check('B carries no notes from A', b.notes, '')
  check('B is back to the default rate', b.rate, DEFAULT_SERVICE_TAX_RATE)
}
{
  // Mutating one draft must not write through to the next, which would be the
  // same leak arriving by a different route.
  const a = buildInitialDraft({ customerId: 'C-1', amount: 100 })
  a.lines[0].description = 'MUTATED'
  a.state = '27'
  const b = buildInitialDraft({ customerId: 'C-1', amount: 100 })
  check('mutating a draft does not affect the next one', b.lines[0].description, 'Service rendered')
  check('the shared empty-line constant is not aliased into a draft', buildInitialDraft({}).lines[0] !== EMPTY_LINE, true)
  check('the blank line is genuinely blank', EMPTY_LINE.unitPrice, '')
  check('the blank line keeps the default SAC', EMPTY_LINE.hsnSac, DEFAULT_SAC)
}

console.log('\nThe seeded figure is the figure that gets invoiced')
{
  // The point of the prefill: what the customer was quoted is what is taxed.
  // An inclusive amount must survive the round trip into the tax totals.
  const d = buildInitialDraft({ customerId: 'C-1', amount: 1188 })
  const priced = priceInvoice(
    d.lines.map((l) => ({ description: l.description, hsnSac: l.hsnSac, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), taxRate: d.rate })),
    resolveStateCode('29'),
  )
  check('the gross equals the amount owed', (priced.totals.total / 100).toFixed(2), '1188.00')
  check('CGST and SGST split it evenly', priced.totals.cgst, priced.totals.sgst)
  check('no IGST on an intra-state invoice', priced.totals.igst, 0)
  check('tax plus taxable is the gross',
    priced.totals.taxable + priced.totals.cgst + priced.totals.sgst + priced.totals.igst,
    priced.totals.total)
}

console.log('\nOffered rates')
{
  check('nil-rated is offered, and is zero', GST_RATES.includes(0), true)
  check('the standard rate is offered', GST_RATES.includes(18), true)
  check('every rate is a real slab', GST_RATES.every((r) => [0, 5, 12, 18, 28].includes(r)), true)
  check('no duplicate rates', new Set(GST_RATES).size, GST_RATES.length)
  const nil = priceInvoice(
    [{ description: 'x', hsnSac: DEFAULT_SAC, quantity: 1, unitPrice: 500, taxRate: 0 }],
    '29',
  )
  check('a nil-rated invoice collects no tax', nil.totals.totalTax, 0)
  check('a nil-rated invoice is still worth its face value', nil.totals.total, 50000)
  check('a nil-rated invoice is fully taxable', nil.totals.taxable, 50000)
}

console.log('\nThe screen actually uses it')
{
  // The assertions above prove `buildInitialDraft` behaves; they cannot prove
  // the component calls it, or that the caller passes the payment in. Those are
  // regressions that would leave the suite green while the bug was back, so the
  // wiring is asserted too.
  const modal = readFileSync('src/components/invoices/InvoiceFormModal.tsx', 'utf8')
  const payments = readFileSync('src/pages/PaymentsPage.tsx', 'utf8')

  check('the form is re-seeded from the shared builder', /buildInitialDraft\(/.test(modal), true)
  check('the re-seed happens in an effect', /useEffect\(\(\) => \{[\s\S]{0,200}buildInitialDraft\(/.test(modal), true)
  check('the re-seed only runs once open', /if \(!open\) return[\s\S]{0,80}buildInitialDraft\(/.test(modal), true)
  check('the effect depends on the seed, so a changed payment re-seeds',
    /useEffect\([\s\S]*?\}, \[open, customerId, paymentId, amcId, serviceId, amount, description\]\)/.test(modal), true)
  check('the chosen rate is used for the preview', /taxRate: rate,/.test(modal), true)
  check('the chosen rate is persisted, not just previewed', /unitPrice: Number\(l\.unitPrice\) \|\| 0,\s*\n\s*taxRate: rate,/.test(modal), true)
  check('the payment is keyed so the form remounts per invoice', /key=\{invoicing\?\.id/.test(payments), true)
  check('the payment amount reaches the form', /amount=\{invoicing\?\.amount\}/.test(payments), true)
  check('a description reaches the form', /description=\{/.test(payments), true)
  check('the payment is still linked to the invoice', /paymentId=\{invoicing\?\.id\}/.test(payments), true)
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
