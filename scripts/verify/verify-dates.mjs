#!/usr/bin/env node
/**
 * Phase 5 logic harness: date arithmetic.
 *
 * The original defect here was invisible in UTC and wrong in India. `today()`
 * returns local midnight, but it was then formatted with `toISOString()`, which
 * is UTC — so in IST that is the *previous* day at 18:30, and `daysFromNow(0)`
 * returned yesterday. Every warranty countdown, AMC expiry badge and "overdue"
 * filter was built on that, so a contract read as expiring a day early and an
 * asset that had just expired still counted as in warranty.
 *
 * A UTC-only test passes against the broken code, which is the point: these
 * checks are re-run under several timezones in subprocesses so that the one the
 * developer happens to be in cannot decide the result.
 */
import { execFileSync } from 'node:child_process'
import {
  addDays, daysAgo, daysBetween, daysFromNow, daysUntil, hoursAgo, isSameDay,
  labelToMinutes, minutesToLabel, monthEnd, monthStart, monthValue, monthsBetween,
  relativeTime, startOfWeek, weekDates, weekDayIndex, clampMinutes, isValidMinutes, MINUTES_IN_DAY,
} from '../../src/utils/dates.ts'

// --tz-check is the entry point the parent shells out to.
if (process.argv.includes('--tz-check')) {
  const local = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const problems = []
  if (daysFromNow(0) !== local) problems.push(`daysFromNow(0)=${daysFromNow(0)} want ${local}`)
  if (daysUntil(daysFromNow(0)) !== 0) problems.push(`daysUntil(today)=${daysUntil(daysFromNow(0))} want 0`)
  if (daysUntil(daysFromNow(1)) !== 1) problems.push(`daysUntil(tomorrow)=${daysUntil(daysFromNow(1))} want 1`)
  if (daysUntil(daysFromNow(-1)) !== -1) problems.push(`daysUntil(yesterday)=${daysUntil(daysFromNow(-1))} want -1`)
  if (daysAgo(0) !== local) problems.push(`daysAgo(0)=${daysAgo(0)} want ${local}`)
  if (problems.length) { console.error(problems.join('\n')); process.exit(1) }
  process.exit(0)
}

let pass = 0
let fail = 0
const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b)
function check(label, actual, expected) {
  if (same(actual, expected)) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`) }
}
const localToday = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()

console.log('\nToday is today')
check('daysFromNow(0) is the local date, not the UTC one', daysFromNow(0), localToday)
check('daysAgo(0) agrees with it', daysAgo(0), localToday)
check('daysUntil(today) is zero', daysUntil(daysFromNow(0)), 0)
check('daysUntil(tomorrow) is one', daysUntil(daysFromNow(1)), 1)
check('daysUntil(yesterday) is minus one', daysUntil(daysFromNow(-1)), -1)
check('daysBetween is symmetric', daysBetween(daysFromNow(3), daysFromNow(1)), 2)
check('daysBetween tolerates a full timestamp', daysBetween(`${daysFromNow(1)}T18:30:00Z`, daysFromNow(0)), 1)
check('daysBetween on nonsense is zero, not NaN', daysBetween('not-a-date', daysFromNow(0)), 0)

console.log('\nTime of day survives hoursAgo')
{
  const two = hoursAgo(2)
  const thirty = hoursAgo(30)
  check('hoursAgo returns a timestamp, not a bare date', two.includes('T'), true)
  check('two hours and thirty hours differ', two !== thirty, true)
  // Each call reads the clock separately, so differencing two of them measures
  // how long the test itself took. Anchored on a single read with a tolerance
  // instead, which is both deterministic and actually about the return value.
  const now = Date.now()
  const within = (iso, expected) => Math.abs(new Date(iso).getTime() - expected) < 5_000
  check('two hours ago is about two hours ago', within(two, now - 2 * 3_600_000), true)
  check('thirty hours ago is about thirty hours ago', within(thirty, now - 30 * 3_600_000), true)
}

console.log('\nRelative time points the right way')
{
  check('past is "ago"', relativeTime(daysFromNow(-3)), '3d ago')
  check('yesterday', relativeTime(daysFromNow(-1)), 'Yesterday')
  check('today', relativeTime(daysFromNow(0)), 'Today')
  // The bug: a future date hit the same branch and was labelled in the past.
  check('tomorrow is not "Yesterday"', relativeTime(daysFromNow(1)), 'Tomorrow')
  check('three days out reads as future', relativeTime(daysFromNow(3)), 'in 3d')
}

console.log('\nWeek arithmetic')
{
  const thisWeek = weekDates(daysFromNow(0))
  check('a week is seven days', thisWeek.length, 7)
  check('the week runs Monday to Sunday', thisWeek.map(weekDayIndex).join(','), '0,1,2,3,4,5,6')
  check('the days are consecutive', new Set(thisWeek).size, 7)
  check('the first day is a Monday', weekDayIndex(thisWeek[0]), 0)
  check('the last day is a Sunday', weekDayIndex(thisWeek[6]), 6)
  check('the week is strictly ascending', thisWeek.every((d, i) => i === 0 || d > thisWeek[i - 1]), true)
  check('every day in the week agrees with it', thisWeek.every((d) => startOfWeek(d) === thisWeek[0]), true)
  check('Sunday belongs to the week that started six days earlier', startOfWeek('2026-09-27'), '2026-09-21')
  check('Monday is its own start', startOfWeek('2026-09-21'), '2026-09-21')
  check('a mid-week date resolves back to its Monday', startOfWeek('2026-09-24'), '2026-09-21')
  check('nonsense has no week', startOfWeek('nope'), '')
  check('nonsense has no weekday index', weekDayIndex('nope'), -1)
}

console.log('\nAdding days')
{
  check('month rollover', addDays('2026-01-31', 1), '2026-02-01')
  check('year rollover', addDays('2026-12-31', 1), '2027-01-01')
  check('leap day', addDays('2028-02-28', 1), '2028-02-29')
  check('non-leap skips 29 Feb', addDays('2027-02-28', 1), '2027-03-01')
  check('backwards', addDays('2026-03-01', -1), '2026-02-28')
  check('a leap year keeps 366 days apart', daysBetween(addDays('2028-01-01', 365), '2028-01-01'), 365)
  check('nonsense plus days is still nonsense', addDays('nope', 3), '')
}

console.log('\nMinute of day')
{
  check('morning', minutesToLabel(570), '9:30 am')
  check('midnight is twelve, not zero', minutesToLabel(0), '12:00 am')
  check('the last minute of the day', minutesToLabel(MINUTES_IN_DAY - 1), '11:59 pm')
  check('noon', minutesToLabel(720), '12:00 pm')
  // An unset start time must read as blank. Rendering it as midnight would put
  // every unscheduled job in the same slot at the top of the board.
  check('unset is blank, not midnight', minutesToLabel(null), '')
  check('unset for undefined is blank too', minutesToLabel(undefined), '')
  // A formatter must not dress a corrupt value up as a real time, which is why
  // these differ from clampMinutes below.
  check('out of range is blank, not clamped', minutesToLabel(5000), '')
  check('negative is blank, not clamped', minutesToLabel(-30), '')
  check('a fraction of a minute is rounded, not refused', minutesToLabel(570.4), '9:30 am')
  check('parses a 12-hour label', labelToMinutes('9:30 am'), 570)
  check('parses a 24-hour label', labelToMinutes('09:30'), 570)
  check('parses an afternoon hour', labelToMinutes('13:00'), 780)
  check('parses 12 am as midnight', labelToMinutes('12 am'), 0)
  check('parses 12 pm as noon', labelToMinutes('12 pm'), 720)
  check('refuses an impossible hour', labelToMinutes('25:00'), null)
  check('refuses an impossible minute', labelToMinutes('10:99'), null)
  check('refuses nonsense', labelToMinutes('half ten'), null)
  // Round trip, which is what the board's time picker depends on.
  check('labels round-trip', [0, 570, 720, 815, 1439].map((m) => labelToMinutes(minutesToLabel(m))), [0, 570, 720, 815, 1439])
}

console.log('\nDay comparison')
{
  check('same day across a timestamp', isSameDay('2026-09-27', '2026-09-27T10:00:00Z'), true)
  check('different days', isSameDay('2026-09-27', '2026-09-28'), false)
  check('no date is not the same day as one', isSameDay(null, '2026-09-27'), false)
  check('no date either way', isSameDay(undefined, undefined), false)
}

console.log('\nMonths, unchanged')
{
  check('month of a date', monthValue('2026-09-27'), '2026-09')
  check('month start', monthStart('2026-09'), '2026-09-01')
  check('month end, 30 days', monthEnd('2026-09'), '2026-09-30')
  check('month end, 31 days', monthEnd('2026-10'), '2026-10-31')
  check('February in a leap year', monthEnd('2028-02'), '2028-02-29')
  check('February otherwise', monthEnd('2026-02'), '2026-02-28')
  check('validity is inclusive', monthsBetween('2026-09', '2027-09'), 13)
}

console.log('\nIndependent of the clock the developer is on')
{
  // UTC is where the old code looked correct, so it is included only to show it
  // did not get fixed by accident. The extreme offsets are the ones that catch
  // a UTC assumption: UTC+14 has already rolled over, UTC-11 has not.
  for (const tz of ['UTC', 'Asia/Kolkata', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Niue']) {
    let ok = true
    let detail = ''
    try {
      // `process.argv[1]` rather than `__filename`: tsx runs this as an ES module.
      // `--import tsx` re-applies the loader in the child, without which it cannot
      // resolve the `.ts` import at the top of this file.
      execFileSync(process.execPath, ['--import', 'tsx', process.argv[1], '--tz-check'], { env: { ...process.env, TZ: tz }, stdio: 'pipe' })
    } catch (err) {
      ok = false
      detail = String(err.stderr || err.message).trim().split('\n')[0]
    }
    check(`today is today in ${tz}`, ok, true)
    if (!ok) console.log(`       ${detail}`)
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
