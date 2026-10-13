/**
 * Preventive visit cadence.
 *
 * The interval is derived from a year of 365.25 days rather than 365 so a
 * twice-yearly contract lands on 183 days instead of drifting a day earlier
 * every time the AMC is extended, and the result is rounded to whole days
 * because a service can only be booked on a date.
 *
 * n8n's 07-generate-scheduled-visits workflow implements the same arithmetic
 * in JS. Keep the two in step: this file is the readable reference.
 */

/** Cadences an admin actually picks, in visits per year. */
export const VISIT_CADENCES = [1, 2, 3, 4, 6, 12] as const

const DAYS_PER_YEAR = 365.25

/**
 * Whole days between preventive visits. Returns null when there is no cadence to
 * work from, which is what keeps contracts that never had one from silently
 * generating a visit every single day.
 */
export function visitIntervalDays(visitsPerYear: number | null | undefined): number | null {
  const n = Number(visitsPerYear)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.max(1, Math.round(DAYS_PER_YEAR / n))
}

/** The first visit a contract should get, one full interval after it starts. */
export function suggestFirstVisit(startDate: string, visitsPerYear: number | null | undefined): string | null {
  const interval = visitIntervalDays(visitsPerYear)
  if (interval === null) return null
  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) return null
  const next = new Date(start)
  next.setDate(next.getDate() + interval)
  return toDateValue(next)
}

/** The date of the visit after `from`, given the contract's cadence. */
export function nextVisitAfter(from: string, visitsPerYear: number | null | undefined): string | null {
  const interval = visitIntervalDays(visitsPerYear)
  if (interval === null) return null
  const date = new Date(from)
  if (Number.isNaN(date.getTime())) return null
  date.setDate(date.getDate() + interval)
  return toDateValue(date)
}

/** `YYYY-MM-DD` in local time, matching how the rest of the app stores dates. */
export function toDateValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Whether an AMC is due a visit on `today`. A contract whose `nextVisitOn` is in
 * the past is still due — a workflow that has been offline for a week should
 * book the visit it missed, not skip it.
 */
export function isVisitDue(nextVisitOn: string | null | undefined, todayValue: string): boolean {
  if (!nextVisitOn) return false
  return nextVisitOn <= todayValue
}
