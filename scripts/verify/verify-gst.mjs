/**
 * Phase 4 logic harness: GST computation.
 *
 * The property that matters is reconciliation: the printed lines must add up
 * to the printed total, and taxable + tax must equal the total, for every
 * combination of rates, states and quantities. That is asserted by brute force
 * rather than by example, because the failure mode is a single stray paisa on
 * one particular invoice and examples are exactly what miss it.
 */
import { computeGst, priceInvoice, isInterState, BUSINESS, GST_STATES, stateNameByCode, stateCodeByName, resolveStateCode, stateLabel, DEFAULT_SERVICE_TAX_RATE } from '../../src/utils/gst.ts'
import { toPaise, toRupees } from '../../src/utils/money.ts'

let pass = 0
let fail = 0
// The supplier's state is configuration, not a fact about GST, so these are
// derived rather than hardcoded. An earlier version of this file hardcoded
// '27' as the home state and '29' as a contrasting one, which meant the whole
// suite silently started testing the wrong thing the day the demo business
// moved to Karnataka: '27' became an out-of-state customer and every
// intra-state expectation inverted. A test that breaks when a config value
// changes is telling you about itself, not about the code.
const HOME = BUSINESS.stateCode
const HOME_NAME = stateNameByCode(HOME)
const AWAY = GST_STATES.find((st) => st.code !== HOME).code
const AWAY_NAME = stateNameByCode(AWAY)

const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b)
function check(label, actual, expected) {
  if (same(actual, expected)) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`) }
}

console.log('\nState codes')
check('the state list has no duplicate codes', new Set(GST_STATES.map((s) => s.code)).size, GST_STATES.length)
check('code 27 is Maharashtra', stateNameByCode('27'), 'Maharashtra')
check('Maharashtra maps back to 27', stateCodeByName('maharashtra'), '27')
check('an unknown name is empty, not a guess', stateCodeByName('Atlantis'), '')

// The customer's tax profile and the invoice screen were both writing this
// column, one as a code and one as a name. A resolver that understood only one
// of them turned the other into "", which isInterState reads as "unknown", which
// is then taxed as IGST. So a Maharashtra customer was charged IGST on every
// invoice instead of CGST + SGST, with nothing on screen to indicate it. These
// assert that a value resolves the same whichever shape it arrives in, because
// that is the property the bug was really about.
console.log('\nA state resolves from a code or a name alike')
check('a stored code resolves', resolveStateCode('27'), '27')
check('a stored name resolves', resolveStateCode('Maharashtra'), '27')
check('a name in any case resolves', resolveStateCode('  mAhArAsHtRa '), '27')
check('padded and unpadded code both resolve', resolveStateCode(' 27 '), '27')
check('an unknown value stays empty', resolveStateCode('Atlantis'), '')
check('null stays empty', resolveStateCode(null), '')
check('the label reads back from a code', stateLabel('27'), 'Maharashtra')
check('the label reads back from a name', stateLabel('maharashtra'), 'Maharashtra')

// The actual harm, asserted end to end rather than only on the resolver.
const viaCode = computeGst(toPaise(1000), 18, HOME)
const viaName = computeGst(toPaise(1000), 18, HOME_NAME)
check('our own customer is intra-state when stored as a code', viaCode.interState, false)
check('our own customer is intra-state when stored as a name', viaName.interState, false)
check('both shapes produce identical tax', same(viaCode.totalTax, viaName.totalTax), true)
check('an intra-state invoice splits into CGST and SGST', viaCode.cgst > 0 && viaCode.sgst > 0 && viaCode.igst === 0, true)
check('CGST and SGST always sum to the whole tax', viaCode.cgst + viaCode.sgst, viaCode.totalTax)

// Every state in the list must classify as intra when it is ours, so a state
// added later cannot be left with a code that silently resolves to nothing.
const unresolvable = GST_STATES.filter((s) => resolveStateCode(s.code) !== s.code).map((s) => s.code)
check('every listed code resolves to itself', same(unresolvable, []), true)
const unresolvableNames = GST_STATES.filter((s) => resolveStateCode(s.name) !== s.code).map((s) => s.name)
check('every listed name resolves to its code', same(unresolvableNames, []), true)


console.log('\nIntra-state versus inter-state')
check('our own state is intra', isInterState(BUSINESS.stateCode), false)
check('a different state is inter', isInterState(AWAY), true)
check('an unknown place of supply is treated as inter, not intra', isInterState(null), true)

// The supplier's own state is the one config value that inverts the meaning of
// every other number in this file, so it is checked for self-consistency rather
// than trusted. A mismatch here misclassifies every invoice, silently.
check('the configured state code is a real GST code', GST_STATES.some((s) => s.code === HOME), true)
check('the configured state name matches the code', HOME_NAME, BUSINESS.stateName)
check('a demo business quotes no GSTIN', BUSINESS.isDemoBusiness ? BUSINESS.gstin === '' : true, true)
check('a demo business is flagged as one', BUSINESS.isDemoBusiness, true)
check('an empty string is not assumed to be our state', isInterState(''), true)

console.log('\nTax split, 18% inclusive')
// 1180 total at 18% inclusive => tax = 1180 * 18/118 = 180.00, taxable 1000.
check('intra-state splits 180 into two 90 halves', computeGst(118000, 18, HOME), {
  interState: false, taxable: 100000, cgst: 9000, sgst: 9000, igst: 0, totalTax: 18000, total: 118000,
})
check('inter-state charges it all as IGST', computeGst(118000, 18, AWAY), {
  interState: true, taxable: 100000, cgst: 0, sgst: 0, igst: 18000, totalTax: 18000, total: 118000,
})
check('intra-state halves never leave a stray paisa', computeGst(101, 18, HOME), {
  interState: false, taxable: 86, cgst: 7, sgst: 8, igst: 0, totalTax: 15, total: 101,
})

console.log('\nTax split, 12% and 5%')
check('12% of 1120 is 120 over 1000', computeGst(112000, 12, HOME).totalTax, 12000)
check('5% of 1050 is 50 over 1000', computeGst(105000, 5, HOME).totalTax, 5000)
check('a 0% rate collects nothing', computeGst(50000, 0, HOME).totalTax, 0)
check('a negative rate collects nothing rather than crediting', computeGst(50000, -5, HOME).totalTax, 0)

console.log('\nDegenerate inputs are refused, not propagated')
check('a zero total is zero, not NaN', computeGst(0, 18, HOME).total, 0)
check('a negative total clamps to zero', computeGst(-5000, 18, HOME).total, 0)
check('NaN clamps to zero', computeGst(NaN, 18, '27').total, 0)

console.log('\nBrute force: reconciliation holds for every combination')
// The properties that must never break, across a wide sweep of realistic and
// awkward values rather than the handful a human would think to test.
const amounts = [1, 99, 100, 1180, 12345, 99999, 123456.78, 1_00_00_000]
const rates = [0, 5, 12, 18, 28]
const states = [HOME, AWAY, '33', '07', null, '']
let taxMismatch = 0, totalMismatch = 0, negativeTax = 0, examples = []
for (const a of amounts) {
  for (const rate of rates) {
    for (const st of states) {
      const t = toPaise(a)
      const r = computeGst(t, rate, st)
      if (r.taxable + r.totalTax !== r.total) { taxMismatch++; if (examples.length < 3) examples.push(`taxable+tax != total at ${a}@${rate}%/${st}`) }
      if (r.total !== t) { totalMismatch++; if (examples.length < 3) examples.push(`total changed at ${a}@${rate}%/${st}`) }
      if (r.cgst < 0 || r.sgst < 0 || r.igst < 0 || r.totalTax < 0) negativeTax++
      // The two regimes are mutually exclusive, and which components carry the
      // tax depends on which one applies. Asserting cgst+sgst === tax
      // unconditionally is wrong: on an inter-state invoice both are zero and
      // the whole amount is IGST.
      if (r.interState) {
        if (r.cgst || r.sgst) { taxMismatch++; if (examples.length < 3) examples.push(`intra tax on inter-state at ${a}/${st}`) }
        if (r.igst !== r.totalTax) { taxMismatch++; if (examples.length < 3) examples.push(`igst != tax at ${a}/${st}`) }
      } else {
        if (r.igst) { taxMismatch++; if (examples.length < 3) examples.push(`IGST on intra-state at ${a}/${st}`) }
        if (r.cgst + r.sgst !== r.totalTax) { taxMismatch++; if (examples.length < 3) examples.push(`cgst+sgst != tax at ${a}@${rate}%/${st}`) }
      }
    }
  }
}
check('taxable + tax always equals the total, and halves never drift', taxMismatch, 0)
check('the total is never altered by the split', totalMismatch, 0)
check('no component is ever negative', negativeTax, 0)
if (examples.length) console.log('       ' + examples.join('; '))
check('swept a meaningful number of combinations', amounts.length * rates.length * states.length >= 200, true)

console.log('\nMulti-line invoices')
const { lines, totals } = priceInvoice(
  [
    { description: 'AC service - 2 units', hsnSac: '998719', quantity: 2, unitPrice: 450 },
    { description: 'Compressor relay', hsnSac: '998719', quantity: 3, unitPrice: 149.5 },
    { description: 'Callout', hsnSac: '998719', quantity: 1, unitPrice: 250 },
  ],
  HOME,
)
check('three lines come back priced', lines.length, 3)
check('line totals are unit x qty in paise', lines.map((l) => l.lineTotalPaise), [90000, 44850, 25000])
check('the subtotal is the sum of the lines', totals.total, 90000 + 44850 + 25000)
check('line taxes sum to the invoice tax', lines.reduce((s, l) => s + l.taxPaise, 0), totals.totalTax)
check('line taxable sums to the invoice taxable', lines.reduce((s, l) => s + l.taxablePaise, 0), totals.taxable)
check('no line mixes CGST with IGST', lines.every((l) => l.igstPaise === 0), true)
check('each line taxable + tax = its line total', lines.every((l) => l.taxablePaise + l.taxPaise === l.lineTotalPaise), true)

console.log('\nMulti-line invoices must also reconcile at every rate and state')
let lineMismatch = 0
for (const rate of [0, 5, 12, 18, 28]) {
  for (const st of ['27', '29', null]) {
    for (const qty of [1, 2, 3, 0.5, 7]) {
      const r = priceInvoice(
        [
          { description: 'A', hsnSac: '998719', quantity: qty, unitPrice: 333.33, taxRate: rate },
          { description: 'B', hsnSac: '998719', quantity: 1, unitPrice: 0.01, taxRate: rate },
        ],
        st,
      )
      const sum = r.lines.reduce((s, l) => s + l.lineTotalPaise, 0)
      if (sum !== r.totals.total) lineMismatch++
      if (r.lines.reduce((s, l) => s + l.taxPaise, 0) !== r.totals.totalTax) lineMismatch++
    }
  }
}
check('printed lines always add up to the printed total', lineMismatch, 0)

console.log('\nA part-derived invoice')
// The realistic case: an invoice raised from proof of work on a visit.
const fromParts = priceInvoice(
  [
    { description: 'Compressor relay', hsnSac: '998719', quantity: 3, unitPrice: 149.5 },
    { description: 'Freon top-up', hsnSac: '998719', quantity: 1, unitPrice: 1200.1 },
  ],
  AWAY,
)
check('inter-state, so no CGST/SGST at all', [fromParts.totals.cgst, fromParts.totals.sgst], [0, 0])
check('all of it is IGST', toRupees(fromParts.totals.igst), toRupees(fromParts.totals.totalTax))
check('the gross is what the parts table already said', toRupees(fromParts.totals.total), 448.5 + 1200.1)

console.log('\nDefault rate')
check('services default to 18%', DEFAULT_SERVICE_TAX_RATE, 18)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail > 0 ? 1 : 0)
