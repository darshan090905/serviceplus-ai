/**
 * Phase 3 logic harness: job costing in paise.
 *
 * The reason this exists is that the obvious implementation is wrong. Money as
 * floats does not reconcile: 0.1 + 0.2 !== 0.3, and 149.50 * 100 is
 * 14949.999999999998. An invoice whose line items do not add up to its stated
 * total is the kind of bug a customer finds before you do.
 */
import {
  toPaise, toRupees, lineTotalPaise, partsTotalPaise, partsCostPaise, marginPaise, marginPercent, jobCost, extractTax,
} from '../../src/utils/money.ts'

let pass = 0
let fail = 0

// JSON.stringify turns NaN and Infinity into null, which would make
// "garbage input is rejected" indistinguishable from "garbage input is 0".
// This compares the values themselves so those cases stay meaningful.
const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b)

function check(label, actual, expected) {
  if (same(actual, expected)) {
    pass++
    console.log(`  ok  ${label}`)
  } else {
    fail++
    console.log(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`)
  }
}

const part = (over = {}) => ({
  id: 'P1', serviceId: 'S1', name: 'Relay', quantity: 1,
  unitPrice: 100, costPrice: 0, serialNo: '', createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

console.log('\nPaise conversion')
check('whole rupees are exact', toPaise(1000), 100000)
check('the 149.50 case is exact, not 14949.99...', toPaise(149.5), 14950)
check('0.1 and 0.2 become paise that add up', toPaise(0.1) + toPaise(0.2), toPaise(0.3))
check('paise round-trips back', toRupees(toPaise(1234.56)), 1234.56)
check('garbage is zero rather than NaN', toPaise(NaN), 0)
check('Infinity is zero rather than NaN', toPaise(Infinity), 0)

console.log('\nLine totals')
check('one of one at 100', lineTotalPaise(part()), 10000)
check('three at 149.50 is 448.50', lineTotalPaise(part({ quantity: 3, unitPrice: 149.5 })), 44850)
check('a fractional quantity still reconciles to whole paise', lineTotalPaise(part({ quantity: 2.5, unitPrice: 100 })), 25000)

console.log('\nTotals and margin')
const mixed = [part({ id: 'A', unitPrice: 149.5, quantity: 3, costPrice: 90 }), part({ id: 'B', unitPrice: 1200.1, costPrice: 1000 })]
// Expected values are written in paise and converted, never computed as float
// sums of rupees — writing `448.5 + 1200.1 - 270 - 1000` in the expectation
// gives 378.5999999999999 and makes a correct implementation look broken.
const expectSell = toRupees(partsTotalPaise(mixed))
const expectCost = toRupees(partsCostPaise(mixed))
check('parts charged', expectSell, 1648.6)
check('parts cost', expectCost, 1270)
check('margin', toRupees(marginPaise(mixed)), 378.6)
check('margin percent', Math.round(marginPercent(mixed) * 100) / 100, 22.96)
check('no parts means no margin percentage, not zero', marginPercent([]), null)
check('selling at cost gives exactly 0%', marginPercent([part({ unitPrice: 100, costPrice: 100 })]), 0)
check('selling below cost is negative, and stays negative', marginPercent([part({ unitPrice: 100, costPrice: 150 })]), -50)

console.log('\nJob cost')
const job = jobCost(mixed, 500)
check('total is parts plus labour charge', toRupees(job.total), expectSell + 500)
check('labour is a charge, not a cost, so it never moves margin', job.margin, marginPaise(mixed))
check('an absent labour charge is zero', jobCost([]).labour, 0)
check('an empty job has no percentage', jobCost([]).marginPercent, null)

console.log('\nTax extraction')
// 1180 total at 18%: the tax component is 1180 * 0.18 = 212.40, so base is
// 967.60. These are inclusive-of-tax figures being split, not a price being
// grossed up.
check('18% of 1180 is 212.40 tax over a 967.60 base', extractTax(118000, 18), { base: 96760, tax: 21240 })
check('base plus tax is exactly the input, always', (() => {
  for (const total of [1, 7, 1180, 99999, 123456.78]) {
    const p = toPaise(total)
    const r = extractTax(p, 18)
    if (r.base + r.tax !== p) return `mismatch at ${total}: ${r.base} + ${r.tax} != ${p}`
  }
  return 'reconciles at every total'
})(), 'reconciles at every total')
check('a 0% rate is all base', extractTax(5000, 0), { base: 5000, tax: 0 })
check('a negative rate is refused rather than creating a credit', extractTax(5000, -5), { base: 5000, tax: 0 })
check('5% of 100 is 5', extractTax(10000, 5), { base: 9500, tax: 500 })
check('12% of 999 is 119.88, rounded once', extractTax(99900, 12), { base: 87912, tax: 11988 })

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail > 0 ? 1 : 0)
