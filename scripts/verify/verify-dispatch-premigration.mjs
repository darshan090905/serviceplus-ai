/**
 * Premigration guard: the board must not fabricate data.
 *
 * The rule here is the same one used everywhere in this codebase: empty state is
 * not a bug. If there are no services and no technicians, the week view must be
 * empty rather than inventing a week, inventing technicians, or inferring names
 * from nothing. This runs before migration 005 is applied to prove the logic
 * degrades honestly.
 */
import { buildWeekView, isUnresolvedTechnician, blockTimeLabel, serviceMinutes } from '../../src/utils/dispatch.ts'
import { weekDates } from '../../src/utils/dates.ts'
import { technicianKey } from '../../src/utils/technicians.ts'

let pass = 0
let fail = 0
const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b)
function check(label, actual, expected) {
  if (same(actual, expected)) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`) }
}

console.log('\nEmpty board')
{
  const v = buildWeekView([], [], '2026-09-27')
  // Seven empty columns is correct and is not "inventing" anything: the calendar
  // genuinely has seven days. What must stay empty is the content.
  check('the week is a real, correctly-aligned seven days', v.days.length, 7)
  check('it starts on a Monday', v.weekStart, '2026-09-21')
  check('every day is empty', v.days.every((d) => d.blocks.length === 0), true)
  check('no technicians are invented', v.technicians.length, 0)
  check('a garbage date yields no week at all', buildWeekView([], [], 'nonsense').days.length, 0)
}

console.log('\nUnresolved technicians')
{
  const services = [
    { id: 's1', customerId: 'C-1', serviceType: 'AC Service', date: '2026-09-27', technician: 'Ravi Kumar', status: 'Scheduled', rating: null, notes: '' },
  ]
  const v = buildWeekView(services, [], '2026-09-27')
  check('an unrecognised name becomes an unresolved slot', v.technicians.length >= 1, true)
  if (v.technicians.length) {
    check('the slot is marked unresolved', v.technicians[0].unresolved, true)
    check('no account was invented', v.technicians[0].account, undefined)
  }
  const day = v.days.find((d) => d.date === '2026-09-27')
  check('the block is marked unresolved', day?.blocks[0]?.unresolved, true)
  check('isUnresolvedTechnician sees it', isUnresolvedTechnician(services[0], []), true)
}

console.log('\nOverlaps and times')
{
  const services = [
    { id: 's1', customerId: 'C-1', serviceType: 'AC Service', date: '2026-09-22', technician: 'Ravi Kumar', status: 'Completed', rating: null, notes: '', startMinute: 540, durationMinutes: 90 }, // 9:00–10:30
    { id: 's2', customerId: 'C-2', serviceType: 'AC Service', date: '2026-09-22', technician: 'Ravi Kumar', status: 'Scheduled', rating: null, notes: '', startMinute: 600, durationMinutes: 60 }, // 10:00–11:00 overlaps
    { id: 's3', customerId: 'C-3', serviceType: 'AC Service', date: '2026-09-22', technician: 'Ravi Kumar', status: 'Scheduled', rating: null, notes: '', startMinute: null },
  ]
  const v = buildWeekView(services, [], '2026-09-21') // Monday start
  const day = v.days.find((d) => d.date === '2026-09-22')
  const b1 = day?.blocks.find((b) => b.id === 's1')
  const b2 = day?.blocks.find((b) => b.id === 's2')
  const b3 = day?.blocks.find((b) => b.id === 's3')
  check('s1 overlaps s2', b1?.overlaps === true && b2?.overlaps === true, true)
  check('an unscheduled block shows Unscheduled', blockTimeLabel(b3), 'Unscheduled')
  const m = serviceMinutes(services[2])
  check('unscheduled has no start/end', m.start === null && m.end === null, true)
}

console.log('\nKeys normalise')
{
  check('email is never a valid technician key', technicianKey('ravi@example.com'), null)
  check('spaces collapse', technicianKey(' Ravi  Kumar '), 'ravi kumar')
  check('empty becomes null', technicianKey(''), null)
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
