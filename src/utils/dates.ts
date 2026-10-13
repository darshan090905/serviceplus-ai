export const DAY_MS = 86_400_000
/** Minutes in a day. Used as an open upper bound for a time-of-day. */
export const MINUTES_IN_DAY = 1440

export function today(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Parses a date as a local calendar day.
 *
 * `new Date('2026-09-27')` is midnight *UTC*, which in IST is 05:30 the same
 * day but in any negative offset is the previous evening. Doing arithmetic on
 * that lands on the wrong day for most of the world, so a bare YYYY-MM-DD is
 * taken apart and rebuilt in local time instead.
 */
function parseDay(date: string | Date): Date {
  if (date instanceof Date) return date
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '')
  if (parts) return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return new Date(NaN)
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

// Local-date formatter. Plain `toISOString()` shifts the day for anyone east or
// west of UTC, which is how a "first day of the month" ends up as the 31st of
// the month before.
function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Shifts a date by whole days and returns a YYYY-MM-DD.
 *
 * Uses `setDate` rather than adding milliseconds, so the result stays on the
 * intended calendar day across a daylight-saving transition, where 23- and
 * 25-hour days would otherwise shift the answer.
 */
export function addDays(date: string | Date, days: number): string {
  const d = parseDay(date)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  return localDate(d)
}

export function daysFromNow(days: number): string {
  return addDays(today(), days)
}

export function daysAgo(days: number): string {
  return daysFromNow(-days)
}

/**
 * An instant, `hours` in the past, as a full ISO timestamp.
 *
 * Previously truncated to a date, which made `hoursAgo(2)` and `hoursAgo(30)`
 * return the same string — the time of day was the entire point of the name.
 */
export function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

export function daysBetween(dateA: string, dateB: string): number {
  const a = parseDay(dateA).getTime()
  const b = parseDay(dateB).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((a - b) / DAY_MS)
}

/** Whole days from today until `date`. Negative once it has passed. */
export function daysUntil(date: string): number {
  return daysBetween(date, localDate(today()))
}

/** Date-only equality, tolerating full ISO timestamps and empty values. */
export function isSameDay(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.slice(0, 10) === b.slice(0, 10)
}

/** Monday, as YYYY-MM-DD. The week runs Monday to Sunday. */
export function startOfWeek(date: string | Date): string {
  const d = parseDay(date)
  if (Number.isNaN(d.getTime())) return ''
  // `getDay()` is 0 for Sunday, so this maps Monday to 0 and Sunday to 6.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return localDate(d)
}

/** The seven dates of the week containing `anchor`, oldest first. */
export function weekDates(anchor: string | Date): string[] {
  const start = startOfWeek(anchor)
  if (!start) return []
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Position in a Monday-first week: Monday 0 … Sunday 6. */
export function weekDayIndex(date: string | Date): number {
  const d = parseDay(date)
  if (Number.isNaN(d.getTime())) return -1
  return (d.getDay() + 6) % 7
}

/**
 * Coerces a number of minutes into a usable time of day.
 *
 * For bounds arithmetic only — a visit that runs past midnight, a card dragged
 * off the bottom of the board. Use `minutesToLabel` to *display* a time: that
 * one refuses out-of-range values instead, so a corrupt figure is not dressed up
 * as a plausible-looking 11:59 pm.
 */
export function clampMinutes(minutes: number | null | undefined): number | null {
  if (minutes == null || !Number.isFinite(minutes)) return null
  if (minutes < 0) return 0
  if (minutes >= MINUTES_IN_DAY) return MINUTES_IN_DAY - 1
  return Math.round(minutes)
}

/** True only for a whole number of minutes inside a single day. */
export function isValidMinutes(minutes: number | null | undefined): boolean {
  return minutes != null && Number.isFinite(minutes) && minutes >= 0 && minutes < MINUTES_IN_DAY
}

/**
 * Minute-of-day to a display label, e.g. 570 → "9:30 am".
 *
 * Returns an empty string for anything invalid, for two reasons. An unset start
 * time has to read as blank rather than as midnight: a job with no start time is
 * not a job at 12:00 am, and on a dispatch board the difference is visible. And
 * a value outside the day is a data fault, so blanking it keeps the fault
 * visible rather than rendering something that merely looks like a real time.
 */
export function minutesToLabel(minutes: number | null | undefined): string {
  if (!isValidMinutes(minutes)) return ''
  const m = Math.round(minutes as number)
  const h24 = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mm}${h24 < 12 ? ' am' : ' pm'}`
}

/** "09:30" or "9:30 am" to minute-of-day. Returns null if unparseable. */
export function labelToMinutes(label: string): number | null {
  const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(label ?? '')
  if (!match) return null
  const h = Number(match[1])
  const m = match[2] ? Number(match[2]) : 0
  if (h > 23 || m > 59) return null
  const meridiem = match[3]?.toLowerCase()
  let hours24 = h
  if (meridiem === 'pm' && h < 12) hours24 = h + 12
  if (meridiem === 'am' && h === 12) hours24 = 0
  return hours24 * 60 + m
}

// Contracts are valid for whole months, so the admin picks a "from" and a "to"
// month and the exact dates are derived from them: the first day of the opening
// month through the last day of the closing month. These read/write plain
// YYYY-MM strings on purpose — going through Date/ISO would shift the day for
// anyone east or west of UTC.
export function monthValue(date: string): string {
  const iso = /^(\d{4})-(\d{2})/.exec(date ?? '')
  if (iso) return `${iso[1]}-${iso[2]}`
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthStart(month: string): string {
  return `${month}-01`
}

export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return ''
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

// Inclusive month count, so Sep 2026 → Sep 2027 is 13 months of validity.
export function monthsBetween(fromMonth: string, toMonth: string): number {
  const [fy, fm] = fromMonth.split('-').map(Number)
  const [ty, tm] = toMonth.split('-').map(Number)
  if (!fy || !fm || !ty || !tm) return 0
  return (ty - fy) * 12 + (tm - fm) + 1
}


// Inclusive YYYY-MM-DD bounds of a calendar quarter, counting back from the
// quarter containing `ref`: 0 = the current quarter, 1 = the one before it.
// Used to compare KPI periods against each other instead of inventing a trend.
export function quarterWindow(offset = 0, ref: Date = new Date()): { start: string; end: string } {
  const quarter = Math.floor(ref.getMonth() / 3) - offset
  const year = ref.getFullYear() + Math.floor(quarter / 4)
  const firstMonth = (((quarter % 4) + 4) % 4) * 3
  return {
    start: localDate(new Date(year, firstMonth, 1)),
    end: localDate(new Date(year, firstMonth + 3, 0)),
  }
}

// Inclusive month windows ending with the month containing `ref`, oldest first.
// Built from plain YYYY-MM so no Date round-trip can shift a boundary.
export function monthWindows(count: number, ref: Date = new Date()): Array<{ month: string; label: string; start: string; end: string }> {
  const windows = []
  for (let back = count - 1; back >= 0; back -= 1) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - back, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-IN', { month: 'short' })
    windows.push({
      month,
      label: count > 6 || d.getMonth() === 0 ? `${label} ${String(d.getFullYear()).slice(2)}` : label,
      start: monthStart(month),
      end: monthEnd(month),
    })
  }
  return windows
}

// Date-only comparison that tolerates full ISO timestamps and empty values.
export function inRange(date: string | null | undefined, start: string, end: string): boolean {
  if (!date) return false
  const day = date.slice(0, 10)
  return day >= start && day <= end
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatShortDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Date with the time of day, for evidence and sign-off records.
 *
 * formatDate() drops the clock, which is right for a visit date and wrong for
 * "this photo was taken at 4:12pm" — a technician arriving at 4:10 and leaving
 * at 4:15 is the difference between one visit and two.
 */
export function formatDateTime(date: string | Date): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
}

/**
 * Whole days relative to today, in whichever direction they actually lie.
 *
 * `daysUntil` is positive for a date in the *future*, so treating that branch as
 * a past one rendered tomorrow as "Yesterday" and anything further out as
 * "3d ago" — an upcoming visit dated as though it had already happened, which
 * is the wrong sign on the one figure a scheduler reads at a glance.
 */
export function relativeTime(dateStr: string): string {
  const diff = daysUntil(dateStr)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1) return `in ${diff}d`
  return `${Math.abs(diff)}d ago`
}

export function timeAgo(dateStr: string): string {
  const then = new Date(dateStr).getTime()
  const now = Date.now()
  const mins = Math.round((now - then) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatShortDate(dateStr)
}