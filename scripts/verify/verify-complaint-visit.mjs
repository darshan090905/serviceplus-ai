#!/usr/bin/env node
/**
 * Phase 6 logic harness: a complaint assignment has to produce dispatch work.
 *
 * The defect: complaints and services were separate records with nothing between
 * them. Assigning a complaint wrote `complaints.assigned_to` and queued a call,
 * and the dispatch board reads only `services` — so an administrator could
 * assign a job, the technician got told by phone, and the board they plan their
 * day from showed nothing at all. Two people looking at the same work, and one
 * of them sees an empty day.
 *
 * `visitForComplaint` is the rule that closes the gap, kept pure so it can be
 * tested here without a database. Each check below is one of the decisions that
 * could have gone quietly wrong, and a plausible-looking wrong answer.
 */
import { visitForComplaint } from '../../src/utils/dispatch.ts'
import { SERVICE_TYPES } from '../../src/constants/index.ts'
import { buildWeekView, blockTimeLabel } from '../../src/utils/dispatch.ts'

let pass = 0
let fail = 0
const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b)
function check(label, actual, expected) {
  if (same(actual, expected)) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`) }
}

const base = {
  complaint: { id: 'CMP-1', customerId: 'C-1', description: 'AC not cooling', serviceType: 'AC Service', serviceId: null },
  technician: 'Surya Raj',
  technicianId: 'TECH-1',
  date: '2026-09-28',
  id: 'SRV1759000000000',
}

console.log('\nIt builds a visit at all')
const v = visitForComplaint(base)
check('returns a visit', v !== null, true)
check('carries the complaint id in its notes', /CMP-1/.test(v.notes), true)
check('carries the description', /not cooling/.test(v.notes), true)
check('is for the right customer', v.customerId, 'C-1')
check('is scheduled', v.status, 'Scheduled')
check('has no rating yet', v.rating, null)

console.log('\nIt lands on the week being worked, not the week it was reported')
// The trap: a complaint can sit unanswered for days, and filing the visit on the
// original complaint date puts it in the past, where nobody planning the week
// will ever see it.
check('uses the date it was given', v.date, '2026-09-28')
check('is not the complaint date', v.date !== '2026-09-20', true)
const board = buildWeekView([v], [], '2026-09-28')
check('appears on this week board', board.days.some((d) => d.blocks.some((b) => b.id === v.id)), true)
const oldWeek = buildWeekView([v], [], '2026-09-20')
check('does not appear on last week board', oldWeek.days.some((d) => d.blocks.some((b) => b.id === v.id)), false)

console.log('\nIt does not invent a time')
// Assigning somebody is not knowing when they can attend. A made-up slot would
// let the overlap detector report conflicts that are artefacts of the guess.
check('has no start time', v.startMinute, null)
check('has no planned duration', v.durationMinutes, null)
check('renders as Unscheduled', blockTimeLabel(board.days.flatMap((d) => d.blocks).find((b) => b.id === v.id)), 'Unscheduled')

console.log('\nIt is not counted as an AMC visit')
// The trap: the complaint may be against an AMC-covered asset, and counting it
// as that contract's visit double-counts contract visits and corrupts the FTF
// and renewal figures built on them.
check('carries no amc id', v.amcId, null)
const withAmc = visitForComplaint({ ...base, complaint: { ...base.complaint, amcId: 'AMC-1' } })
check('ignores an amc even if one is offered', withAmc.amcId, null)

console.log('\nIts service type is a real one')
// The trap: complaint.category is a quality label ("Billing", "Technician"), not
// a service type, so passing it through would put a nonsense value on the board.
check('keeps a real service type', SERVICE_TYPES.includes(v.serviceType), true)
const byCategory = visitForComplaint({
  ...base,
  complaint: { id: 'CMP-2', customerId: 'C-1', description: 'charged twice', serviceType: null, serviceId: null },
})
check('falls back to a catalogue entry when none is known', SERVICE_TYPES.includes(byCategory.serviceType), true)
check('fallback is the first catalogue entry', byCategory.serviceType, SERVICE_TYPES[0])
const nonsense = visitForComplaint({
  ...base,
  complaint: { id: 'CMP-3', customerId: 'C-1', description: 'x', serviceType: 'Billing', serviceId: null },
})
check('rejects "Billing" as a service type', SERVICE_TYPES.includes(nonsense.serviceType), true)

console.log('\nThe technician is recorded as an id, not just a name')
check('stores the technician name', v.technician, 'Surya Raj')
check('stores the resolved profile id', v.technicianId, 'TECH-1')
const noId = visitForComplaint({ ...base, technicianId: null })
check('tolerates an unresolved id rather than guessing', noId.technicianId, null)
check('but keeps the name so the visit is still attributable', noId.technician, 'Surya Raj')

console.log('\nIt refuses rather than inventing')
check('no customer means no visit', visitForComplaint({ ...base, complaint: { ...base.complaint, customerId: '' } }), null)
check('no technician means no visit', visitForComplaint({ ...base, technician: '' }), null)
check('a blank description does not stop the visit', visitForComplaint({ ...base, complaint: { ...base.complaint, description: '' } }) !== null, true)

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
