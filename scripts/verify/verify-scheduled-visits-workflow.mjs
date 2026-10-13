/**
 * Runs the Code node out of n8n/workflows/07-generate-scheduled-visits.json
 * against sample AMCs, so the workflow's copy of the cadence arithmetic is
 * checked rather than assumed to agree with src/utils/preventive.ts.
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { visitIntervalDays, nextVisitAfter } from '../../src/utils/preventive.ts'

const wf = JSON.parse(readFileSync(new URL('../../n8n/workflows/07-generate-scheduled-visits.json', import.meta.url), 'utf8'))
const buildNode = wf.nodes.find((n) => n.name === 'Build Scheduled Visits')

let pass = 0
let fail = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log(`  ok  ${label}`) }
  else {
    fail++
    console.log(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`)
  }
}

// The Code node's `return` is the script's completion value, which vm hands
// back from runInContext. $input.all() stands in for this node's input and
// $('Today') for the named node's output.
async function runCapture(amcs, today = '2026-05-10') {
  const sandbox = {
    $input: { all: () => amcs.map((json) => ({ json })) },
    $: () => ({ first: () => ({ json: { today } }) }),
  }
  vm.createContext(sandbox)
  // n8n runs a Code node's body inside an async function, which is what makes
  // its top-level `return` legal. Replicate that wrapper or the body will not
  // even parse here.
  const items = await vm.runInContext(`(async () => {
${buildNode.parameters.jsCode}
})()`, sandbox)
  // n8n treats each { json } entry as one item; unwrap to the payloads so the
  // assertions read like the data rather than the node plumbing.
  return items.map((item) => item.json)
}

const amc = (over = {}) => ({
  id: 'AMC1',
  customer_id: 'C1',
  service_type: 'AC Service',
  visits_per_year: 4,
  next_visit_on: '2026-05-10',
  asset_id: 'AST1',
  ...over,
})

console.log('\nOnly due contracts produce a visit')
const due = await runCapture([amc()], '2026-05-10')
check('a contract due today yields one visit', due.length, 1)
check('id is derived from contract and date, not the clock', due[0].visit.id, 'SVC-AUTO-AMC1-2026-05-10')
check('the visit points back at the contract', due[0].visit.amc_id, 'AMC1')
check('the visit inherits the machine', due[0].visit.asset_id, 'AST1')
check('the visit is unassigned', due[0].visit.technician, '')
check('the visit is scheduled, not completed', due[0].visit.status, 'Scheduled')
check('an unrated visit starts unrated', due[0].visit.rating, null)
check('bookkeeping stays out of the row', Object.keys(due[0].visit).includes('next_visit_on'), false)
check('advance date is one interval on', due[0].next_visit_on, nextVisitAfter('2026-05-10', 4))

const notDue = await runCapture([amc({ next_visit_on: '2026-05-11' })], '2026-05-10')
check('a future visit is skipped', notDue.length, 0)

const overdue = await runCapture([amc({ next_visit_on: '2026-05-01' })], '2026-05-10')
check('a missed visit is still booked', overdue.length, 1)
check('and it books the missed date, not today', overdue[0].visit.date, '2026-05-01')

console.log('\nOn-call contracts and unscheduled dates are left alone')
check('no cadence is skipped', (await runCapture([amc({ visits_per_year: null })], '2026-05-10')).length, 0)
check('zero cadence is skipped', (await runCapture([amc({ visits_per_year: 0 })], '2026-05-10')).length, 0)
check('no scheduled date is skipped', (await runCapture([amc({ next_visit_on: null })], '2026-05-10')).length, 0)
check('a garbage scheduled date is skipped', (await runCapture([amc({ next_visit_on: 'not-a-date' })], '2026-05-10')).length, 0)

console.log('\nTwo runs on the same day produce the same id')
const first = await runCapture([amc()], '2026-05-10')
const second = await runCapture([amc()], '2026-05-10')
check('ids are stable across runs', first[0].visit.id, second[0].visit.id)
check('so ignore-duplicates can absorb the retry', first[0].visit.id === 'SVC-AUTO-AMC1-2026-05-10', true)

console.log('\nThe workflow agrees with the app about interval length')
for (const perYear of [1, 2, 3, 4, 6, 12]) {
  const row = (await runCapture([amc({ visits_per_year: perYear, next_visit_on: '2026-05-10' })], '2026-05-10'))[0]
  const fromApp = nextVisitAfter('2026-05-10', perYear)
  const fromWorkflow = new Date(`${row.visit.date}T00:00:00Z`)
  fromWorkflow.setUTCDate(fromWorkflow.getUTCDate() + visitIntervalDays(perYear))
  check(`${perYear}/year advances to ${fromApp}`, row.next_visit_on, fromApp)
}

console.log('\nSeveral contracts in one run stay independent')
const many = await runCapture(
  [
    amc({ id: 'AMC1', visits_per_year: 4, next_visit_on: '2026-05-10' }),
    amc({ id: 'AMC2', visits_per_year: 12, next_visit_on: '2026-05-10' }),
    amc({ id: 'AMC3', visits_per_year: null, next_visit_on: '2026-05-10' }),
  ],
  '2026-05-10',
)
check('two of three are booked', many.length, 2)
check('each keeps its own cadence', many.map((m) => m.next_visit_on), ['2026-08-09', '2026-06-09'])
check('each gets its own id', many.map((m) => m.visit.id), ['SVC-AUTO-AMC1-2026-05-10', 'SVC-AUTO-AMC2-2026-05-10'])

console.log('\nA site-wide contract books without a machine')
const siteWide = await runCapture([amc({ asset_id: null })], '2026-05-10')
check('null machine is passed through, not the string "null"', siteWide[0].visit.asset_id, null)

console.log('\nAn empty result does not break the run')
check('no due contracts yields an empty array', (await runCapture([], '2026-05-10')).length, 0)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail > 0 ? 1 : 0)
