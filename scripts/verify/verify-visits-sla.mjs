/**
 * Phase 2 logic harness: preventive cadence and complaint SLA.
 *
 * Runs against the real modules in src/utils rather than a copy of the maths,
 * because the whole point of centralising the SLA matrix was so there is exactly
 * one copy to be wrong about.
 */
import { slaFor, slaDeadlinesFor, slaStateOf, slaLabel, isComplaintOpen, SLA_TARGETS } from '../../src/utils/sla.ts'
import { visitIntervalDays, suggestFirstVisit, nextVisitAfter, isVisitDue, toDateValue } from '../../src/utils/preventive.ts'

let pass = 0
let fail = 0

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pass++
    console.log(`  ok  ${label}`)
  } else {
    fail++
    console.log(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`)
  }
}

const at = (iso) => new Date(iso)
const complaint = (over = {}) => ({
  status: 'Open',
  created: '2026-01-01T00:00:00.000Z',
  slaRespondBy: null,
  slaResolveBy: null,
  respondedAt: null,
  slaBreached: false,
  ...over,
})

console.log('\nSLA matrix')
check('critical respond/resolve', [slaFor('Critical').respondHours, slaFor('Critical').resolveHours], [2, 24])
check('high respond/resolve', [slaFor('High').respondHours, slaFor('High').resolveHours], [8, 48])
check('medium respond/resolve', [slaFor('Medium').respondHours, slaFor('Medium').resolveHours], [24, 72])
check('low respond/resolve', [slaFor('Low').respondHours, slaFor('Low').resolveHours], [72, 168])
check('respond is always shorter than resolve', Object.values(SLA_TARGETS).every((t) => t.respondHours < t.resolveHours), true)

console.log('\nDeadlines are derived from the report time')
const raised = at('2026-03-10T09:00:00.000Z')
const d = slaDeadlinesFor('High', raised)
check('respond by is +8h', d.respondBy, '2026-03-10T17:00:00.000Z')
check('resolve by is +48h', d.resolveBy, '2026-03-12T09:00:00.000Z')
check('critical uses 2h', slaDeadlinesFor('Critical', raised).respondBy, '2026-03-10T11:00:00.000Z')
check('low uses 72h', slaDeadlinesFor('Low', raised).respondBy, '2026-03-13T09:00:00.000Z')

console.log('\nState: no deadline means no score')
check('no deadlines is none', slaStateOf(complaint(), at('2026-01-02T00:00:00.000Z')), 'none')
check('label admits the gap', slaLabel(complaint(), at('2026-01-02T00:00:00.000Z')), 'No SLA deadline on record for this complaint.')

console.log('\nState: an answered complaint on track')
const high = { slaRespondBy: '2026-01-01T08:00:00.000Z', slaResolveBy: '2026-01-03T00:00:00.000Z', respondedAt: '2026-01-01T02:00:00.000Z' }
check('fresh complaint is met', slaStateOf(complaint(high), at('2026-01-01T01:00:00.000Z')), 'met')
check('mid-window is met', slaStateOf(complaint(high), at('2026-01-02T00:00:00.000Z')), 'met')
check('last quarter is at risk', slaStateOf(complaint(high), at('2026-01-02T18:00:00.000Z')), 'atRisk')
check('past resolve deadline is breached', slaStateOf(complaint(high), at('2026-01-03T00:00:01.000Z')), 'breached')
check('exactly on the deadline is not yet breached', slaStateOf(complaint(high), at('2026-01-03T00:00:00.000Z')), 'atRisk')

console.log('\nState: an unanswered respond deadline breaches on its own')
const lowSlow = { slaRespondBy: '2026-01-04T00:00:00.000Z', slaResolveBy: '2026-01-08T00:00:00.000Z' }
check('before respond deadline', slaStateOf(complaint(lowSlow), at('2026-01-03T00:00:00.000Z')), 'met')
check('respond deadline passed, resolve not', slaStateOf(complaint(lowSlow), at('2026-01-04T00:00:01.000Z')), 'breached')
check('responded just in time clears it', slaStateOf(complaint({ ...lowSlow, respondedAt: '2026-01-04T00:00:00.000Z' }), at('2026-01-05T00:00:00.000Z')), 'met')

console.log('\nBreach latches and survives resolution')
const late = { ...high, status: 'Resolved', resolvedAt: '2026-01-04T00:00:00.000Z', slaBreached: true }
check('latched breach is still breached after resolving', slaStateOf(late, at('2026-01-10T00:00:00.000Z')), 'breached')
check('latched breach is breached even before the deadline', slaStateOf({ ...high, slaBreached: true }, at('2026-01-01T01:00:00.000Z')), 'breached')
const onTime = { ...high, status: 'Resolved', resolvedAt: '2026-01-02T00:00:00.000Z' }
check('resolved in time is met', slaStateOf(onTime, at('2026-01-10T00:00:00.000Z')), 'met')
check('label explains a latch', slaLabel(late, at('2026-01-10T00:00:00.000Z')), 'SLA deadline was missed. Resolving late does not clear the breach.')
check('label distinguishes an unanswered job', slaLabel(complaint({ ...lowSlow }), at('2026-01-05T00:00:00.000Z')), 'Past the response deadline — no technician has been assigned yet.')
check('label says when a resolved job was fine', slaLabel(onTime, at('2026-01-10T00:00:00.000Z')), 'Resolved within the SLA.')

console.log('\nEvery severity is scoreable end to end')
for (const sev of ['Critical', 'High', 'Medium', 'Low']) {
  const base = at('2026-01-01T00:00:00.000Z')
  const dd = slaDeadlinesFor(sev, base)
  const fields = { slaRespondBy: dd.respondBy, slaResolveBy: dd.resolveBy, respondedAt: '2026-01-01T00:30:00.000Z' }
  const fresh = slaStateOf(complaint(fields), at('2026-01-01T00:30:00.000Z'))
  const late_ = slaStateOf(complaint(fields), new Date(new Date(dd.resolveBy).getTime() + 1))
  check(`${sev}: fresh is met and overdue is breached`, [fresh, late_], ['met', 'breached'])
}

console.log('\nOpen status set matches the app')
check('Open is open', isComplaintOpen({ status: 'Open' }), true)
check('In Progress is open', isComplaintOpen({ status: 'In Progress' }), true)
check('Resolved is not open', isComplaintOpen({ status: 'Resolved' }), false)
check('Closed is not open', isComplaintOpen({ status: 'Closed' }), false)

console.log('\nCadence interval')
check('1 per year is 365 days', visitIntervalDays(1), 365)
check('2 per year is 183 days', visitIntervalDays(2), 183)
check('4 per year is 91 days', visitIntervalDays(4), 91)
check('12 per year is 30 days', visitIntervalDays(12), 30)
check('no cadence means no interval', visitIntervalDays(null), null)
check('zero is refused rather than dividing by zero', visitIntervalDays(0), null)
check('garbage is refused', visitIntervalDays('abc'), null)
check('an absurdly high cadence still books at least a day apart', visitIntervalDays(5000), 1)

console.log('\nCadence dates')
check('first visit is one 91-day interval after start', suggestFirstVisit('2026-01-01', 4), '2026-04-02')
check('first visit is null without a cadence', suggestFirstVisit('2026-01-01', null), null)
check('next visit advances by the interval', nextVisitAfter('2026-02-01', 4), '2026-05-03')
check('a leap day start survives', nextVisitAfter('2028-02-28', 12), '2028-03-29')
check('due exactly today', isVisitDue('2026-05-10', '2026-05-10'), true)
check('a missed visit is still due', isVisitDue('2026-05-01', '2026-05-10'), true)
check('a future visit is not due', isVisitDue('2026-05-20', '2026-05-10'), false)
check('no scheduled date is not due', isVisitDue(null, '2026-05-10'), false)

console.log('\ntoDateValue is local-time, not UTC')
check('late-evening local time keeps its own date', toDateValue(new Date(2026, 4, 10, 23, 30)), '2026-05-10')
check('early-morning local time keeps its own date', toDateValue(new Date(2026, 4, 10, 0, 30)), '2026-05-10')

// Regression for a real bug: assignComplaint() stamps responded_at and then
// asks isBreached() about the stamped object. Because isBreached() skips the
// response-miss branch once responded_at is set, a complaint assigned an hour
// after its respond deadline scored as "met" and never latched. The store now
// scores the pre-assignment state instead; these checks pin the two halves of
// that reasoning so the shortcut cannot come back.
console.log('\nA missed response cannot be laundered by answering it late')
const unansweredLate = complaint({
  slaRespondBy: '2026-01-01T08:00:00.000Z',
  slaResolveBy: '2026-01-03T00:00:00.000Z',
})
const assignedLate = { ...unansweredLate, respondedAt: '2026-01-01T09:00:00.000Z' }
check('unanswered past the respond deadline is breached', slaStateOf(unansweredLate, at('2026-01-01T09:00:00.000Z')), 'breached')
check('so the pre-assignment state is what must be scored', slaStateOf(unansweredLate, at('2026-01-01T09:00:00.000Z')) === 'breached', true)
check('the stamped object alone would wrongly read as met', slaStateOf(assignedLate, at('2026-01-01T09:00:00.000Z')), 'met')
check('answering within the deadline never breaches', slaStateOf(complaint({
  slaRespondBy: '2026-01-01T08:00:00.000Z',
  slaResolveBy: '2026-01-03T00:00:00.000Z',
}), at('2026-01-01T07:00:00.000Z')), 'met')
check('a complaint with no respond deadline is not breached by answering', slaStateOf({ ...unansweredLate, slaRespondBy: null, respondedAt: '2026-01-01T09:00:00.000Z' }, at('2026-01-01T09:00:00.000Z')), 'met')

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail > 0 ? 1 : 0)
