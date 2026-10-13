/**
 * First-time-fix and revisit metrics.
 *
 * A rework figure is one of the easiest things in a service app to get quietly
 * wrong, because it is almost always computed from whatever data happens to be
 * there. Most of these assertions are about *refusing* to claim a fix: a
 * complaint with no visit after it is an unknown, not a success, and counting
 * unknowns as fixes is how a month where nobody recorded anything gets reported
 * as 100% first-time-fix.
 */
import { computeComplaintFtf, computeFtfCounts, DEFAULT_REVISIT_WINDOW_DAYS } from '../../src/utils/ftf.ts'

let pass = 0
let fail = 0
const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b)
function check(label, actual, expected) {
  if (same(actual, expected)) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`) }
}

const svc = (id, date, over = {}) => ({
  id, customerId: 'C-1', assetId: 'A-1', serviceType: 'AC Service', date,
  technician: 'Ravi', status: 'Completed', rating: null, notes: '', ...over,
})
const cmp = (id, created, over = {}) => ({
  id, customerId: 'C-1', assetId: 'A-1', serviceType: 'AC Service', created,
  category: 'Repair', description: 'x', severity: 'Medium', status: 'Resolved',
  assignedTo: 'Ravi', ...over,
})

console.log('\nA repair happens after the fault is reported')
{
  // The single most important thing to get right. A visit from March says
  // nothing about a complaint raised in September.
  const out = computeComplaintFtf([cmp('c1', '2026-09-10')], [svc('s1', '2026-03-01')])
  check('an unrelated earlier visit is not a fix', out[0].hasFixVisit, false)
  check('so it is not a first-time fix', out[0].isFirstTimeFix, false)
  check('and it is not a revisit either', out[0].isRevisit, false)
  check('no visit is linked', out[0].linkedVisitId, null)
}

console.log('\nNo history means no claim')
{
  const counts = computeFtfCounts(computeComplaintFtf([cmp('c1', '2026-09-10')], []))
  check('a complaint with no visit is not a first-time fix', counts.firstTimeFixes, 0)
  check('it is recorded as unknown', counts.unknown, 1)
  check('and still counted in the total', counts.totalComplaints, 1)
  // The one that matters: 1 of 1 unknown must not report as 100%.
  check('an all-unknown month reports 0%, not 100%', counts.ftfRate, 0)
}

console.log('\nNothing at all')
{
  const counts = computeFtfCounts(computeComplaintFtf([], []))
  check('no complaints, no rate', counts.ftfRate, 0)
  check('no complaints, no total', counts.totalComplaints, 0)
  check('no complaints, nothing unknown', counts.unknown, 0)
}

console.log('\nA visit after the complaint is the fix')
{
  const near = computeComplaintFtf([cmp('c1', '2026-09-10')], [svc('s1', '2026-09-20')])
  check('ten days later is a fix visit', near[0].hasFixVisit, true)
  check('with the gap recorded', near[0].daysToFix, 10)
  check('the visit is identified', near[0].linkedVisitId, 's1')
  check('and with no prior complaint it is a first-time fix', near[0].isFirstTimeFix, true)
  check('and not a revisit', near[0].isRevisit, false)
}

console.log('\nThe window is inclusive at both ends')
{
  const at30 = computeComplaintFtf([cmp('c1', '2026-09-10')], [svc('s1', '2026-10-10')])
  check('exactly thirty days later still counts', at30[0].hasFixVisit, true)
  const at31 = computeComplaintFtf([cmp('c1', '2026-09-10')], [svc('s1', '2026-10-11')])
  check('thirty-one days later does not', at31[0].hasFixVisit, false)
  const custom = computeComplaintFtf([cmp('c1', '2026-09-10')], [svc('s1', '2026-09-25')], { revisitWindowDays: 7 })
  check('a shorter window is honoured', custom[0].hasFixVisit, false)
  check('the default is thirty days', DEFAULT_REVISIT_WINDOW_DAYS, 30)
}

console.log('\nOnly completed visits count')
{
  const scheduled = computeComplaintFtf([cmp('c1', '2026-09-10')], [svc('s1', '2026-09-12', { status: 'Scheduled' })])
  check('a scheduled visit is not a fix', scheduled[0].hasFixVisit, false)
  const cancelled = computeComplaintFtf([cmp('c1', '2026-09-10')], [svc('s1', '2026-09-12', { status: 'Cancelled' })])
  check('a cancelled visit is not a fix', cancelled[0].hasFixVisit, false)
  const inProgress = computeComplaintFtf([cmp('c1', '2026-09-10')], [svc('s1', '2026-09-12', { status: 'In Progress' })])
  check('an in-progress visit is not a fix yet', inProgress[0].hasFixVisit, false)
}

console.log('\nThe same fault coming back is a rework')
{
  // Complaint on the 1st, fixed on the 3rd, same fault reported again on the
  // 10th. The 3rd did not fix it, so the 10th is a revisit.
  const complaints = [cmp('c1', '2026-09-01'), cmp('c2', '2026-09-10')]
  const services = [svc('s1', '2026-09-03'), svc('s2', '2026-09-12')]
  const out = computeComplaintFtf(complaints, services)
  const first = out.find((o) => o.complaintId === 'c1')
  const second = out.find((o) => o.complaintId === 'c2')
  check('the original was a first-time fix', first.isFirstTimeFix, true)
  check('it is not a revisit', first.isRevisit, false)
  check('the recurrence is a revisit', second.isRevisit, true)
  check('and not a first-time fix', second.isFirstTimeFix, false)
  const counts = computeFtfCounts(out)
  check('one fix and one rework', [counts.firstTimeFixes, counts.revisits], [1, 1])
  check('so the rate is 50%', counts.ftfRate, 50)
}

console.log('\nOne visit cannot fix two open faults')
{
  // Two complaints, one visit. From the data alone this is ambiguous, so the
  // visit is credited to the earlier complaint and the later one is scored as
  // the recurrence it actually is. Crediting both would report a 100%
  // first-time-fix for a machine that was attended exactly once.
  const complaints = [cmp('c1', '2026-09-01'), cmp('c2', '2026-09-10')]
  const services = [svc('s1', '2026-09-12')]
  const out = computeComplaintFtf(complaints, services)
  const first = out.find((o) => o.complaintId === 'c1')
  const second = out.find((o) => o.complaintId === 'c2')
  check('the visit answers the earlier complaint', first.hasFixVisit, true)
  check('which is a first-time fix', first.isFirstTimeFix, true)
  check('and is not double-counted on the later one', second.hasFixVisit, false)
  // c2 was raised on the 10th and the crew arrived on the 12th, so it was
  // still open when they did. A fault reported while the repair is pending
  // is not evidence that the repair failed.
  check('and is not blamed as a rework, it was reported before the repair', second.isRevisit, false)
  const counts = computeFtfCounts(out)
  check('one scored, one unknown', [counts.totalComplaints - counts.unknown, counts.unknown], [1, 1])
  check('the rate covers only the judged complaint', counts.ftfRate, 100)
}

console.log('" + chr(92) + "nAn explicit link beats the guess')
{
  // Without serviceId the earliest-unanswered rule would hand c1 the 5th, since
  // that is the first visit after it. The recorded link says otherwise, and a
  // recorded fact has to beat a guess.
  const complaints = [cmp('c1', '2026-09-01', { serviceId: 's2' }), cmp('c2', '2026-09-10')]
  const services = [svc('s1', '2026-09-05'), svc('s2', '2026-09-20')]
  const out = computeComplaintFtf(complaints, services)
  const first = out.find((o) => o.complaintId === 'c1')
  const second = out.find((o) => o.complaintId === 'c2')
  check('c1 keeps the visit it was linked to, not the earlier one', first.linkedVisitId, 's2')
  check('and is flagged as explicitly linked', first.linkedExplicitly, true)
  check('c2 had no visit of its own', second.hasFixVisit, false)
  check('and no repair to have failed', second.isRevisit, false)
}

console.log('\nA fault returning long after is not a bad repair')
{
  // Fixed on the 3rd, same symptom again on 1 November. Fifty-nine days later is
  // not evidence that September's visit failed; blaming it would be a guess
  // dressed up as a metric.
  const complaints = [cmp('c1', '2026-09-01'), cmp('c2', '2026-11-01')]
  const services = [svc('s1', '2026-09-03'), svc('s2', '2026-11-03')]
  const out = computeComplaintFtf(complaints, services)
  const second = out.find((o) => o.complaintId === 'c2')
  check('the recurrence falls outside the window', second.isRevisit, false)
  check('so it counts as a fresh first-time fix', second.isFirstTimeFix, true)
  check('with its own visit recorded', second.linkedVisitId, 's2')
}

console.log('\nDifferent machines are different problems')
{
  const out = computeComplaintFtf([cmp('c1', '2026-09-10', { assetId: 'A-2' })], [svc('s1', '2026-09-12', { assetId: 'A-1' })])
  check('a different unit is not a fix for this one', out[0].hasFixVisit, false)
}

console.log('\nDifferent service types are different problems')
{
  const out = computeComplaintFtf([cmp('c1', '2026-09-10', { serviceType: 'Refrigeration' })], [svc('s1', '2026-09-12', { serviceType: 'AC Service' })])
  check('a different service type is not a fix for this one', out[0].hasFixVisit, false)
}

console.log('\nThe earliest visit after the complaint is the one that counts')
{
  const out = computeComplaintFtf(
    [cmp('c1', '2026-09-10')],
    [svc('s1', '2026-01-05'), svc('s2', '2026-09-15'), svc('s3', '2026-09-25')],
  )
  check('the first response is linked, not the last', out[0].linkedVisitId, 's2')
  check('and the gap is to that visit', out[0].daysToFix, 5)
}

console.log('\nA visit on the day itself is not yet a fix')
{
  // Reported and attended the same day: the repair cannot have happened yet, so
  // this is unknown rather than a fix. Claiming a same-day FTF would flatter
  // any business that attends emergencies.
  const sameDay = computeComplaintFtf([cmp('c1', '2026-09-10')], [svc('s1', '2026-09-10')])
  check('a same-day visit is not scored as a fix', sameDay[0].hasFixVisit, false)
}

console.log('\nThe rate only counts what can be judged')
{
  const out = computeFtfCounts(computeComplaintFtf(
    [cmp('c1', '2026-09-10'), cmp('c2', '2026-09-10'), cmp('c3', '2026-09-10')],
    [svc('s1', '2026-09-15')],
  ))
  check('one complaint was answerable', out.totalComplaints - out.unknown, 1)
  check('and it was a first-time fix', out.firstTimeFixes, 1)
  check('so the rate is 100% of what was judged', out.ftfRate, 100)
  check('not 33% of everything', out.totalComplaints, 3)
  check('and the unknowns are still reported', out.unknown, 2)
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
