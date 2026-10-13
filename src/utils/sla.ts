import type { Complaint, Severity } from '../types'

/**
 * Service level targets, per complaint severity.
 *
 * `respondHours` is the deadline for putting a technician on the job.
 * `resolveHours` is the deadline for closing it.
 *
 * Every consumer reads these through this module — no screen, report or
 * escalation rule should ever hardcode a number of hours. That is the whole
 * point: if the targets ever become admin-editable, this is the only file
 * that has to learn where to read them from, instead of a dozen screens each
 * carrying their own copy that quietly disagrees with the others.
 */
export interface SlaTarget {
  respondHours: number
  resolveHours: number
}

export const SLA_TARGETS: Record<Severity, SlaTarget> = {
  Critical: { respondHours: 2, resolveHours: 24 },
  High: { respondHours: 8, resolveHours: 48 },
  Medium: { respondHours: 24, resolveHours: 72 },
  Low: { respondHours: 72, resolveHours: 168 },
}

const MS = 3_600_000

export function slaFor(severity: Severity | string): SlaTarget {
  return SLA_TARGETS[severity as Severity] ?? SLA_TARGETS.Medium
}

function addHours(from: Date, hours: number): string {
  return new Date(from.getTime() + hours * MS).toISOString()
}

/**
 * The deadlines to store the moment a complaint is raised. Computed from the
 * creation instant, not from whenever the row happened to be written, so a
 * complaint imported or re-saved hours later still carries an honest clock.
 */
export function slaDeadlinesFor(severity: Severity | string, createdAt: Date): { respondBy: string; resolveBy: string } {
  const target = slaFor(severity)
  return {
    respondBy: addHours(createdAt, target.respondHours),
    resolveBy: addHours(createdAt, target.resolveHours),
  }
}

export type SlaState = 'none' | 'met' | 'atRisk' | 'breached'

/** How close a complaint is to breaching: the last 25% of its window. */
const AT_RISK_RATIO = 0.75

export type SlaSubject = Pick<
  Complaint,
  'status' | 'created' | 'slaResolveBy' | 'slaRespondBy' | 'respondedAt' | 'slaBreached'
>

/**
 * Where a complaint stands against its SLA right now.
 *
 * `breached` is sticky: once a deadline passes the complaint counts as breached
 * for good, even if it is then resolved, because "we fixed it, eventually" is
 * a different fact from "we fixed it on time". A complaint with no deadline
 * predates the feature and is reported as `none` rather than being scored as
 * though it had been on time.
 */
export function slaStateOf(complaint: SlaSubject, now: Date = new Date()): SlaState {
  const resolveBy = complaint.slaResolveBy ? new Date(complaint.slaResolveBy) : null
  const respondBy = complaint.slaRespondBy ? new Date(complaint.slaRespondBy) : null
  if (!resolveBy && !respondBy) return 'none'
  if (complaint.slaBreached) return 'breached'

  const closed = complaint.status === 'Resolved' || complaint.status === 'Closed'

  // An unanswered respond deadline is a breach on its own — the clock is still
  // running for the resolve deadline, but the customer has already been left
  // waiting past what they were promised.
  if (respondBy && !complaint.respondedAt && now.getTime() > respondBy.getTime()) return 'breached'
  if (!closed && resolveBy && now.getTime() > resolveBy.getTime()) return 'breached'
  if (closed) return 'met'

  // The window runs from the moment the complaint was raised to its resolve
  // deadline, so "at risk" means the same thing for every severity: the last
  // quarter of the time the customer was given.
  const deadline = resolveBy ?? respondBy
  if (!deadline) return 'met'
  const created = new Date(complaint.created).getTime()
  if (Number.isNaN(created)) return 'met'
  const span = deadline.getTime() - created
  if (span <= 0) return 'met'
  return (now.getTime() - created) / span >= AT_RISK_RATIO ? 'atRisk' : 'met'
}

/** True while the complaint is open and past its own SLA. */
export function isBreached(complaint: SlaSubject, now: Date = new Date()): boolean {
  return slaStateOf(complaint, now) === 'breached'
}

/** Hours until the resolve deadline. Negative once it has passed. */
export function hoursToResolveDeadline(complaint: Pick<Complaint, 'slaResolveBy'>, now: Date = new Date()): number | null {
  if (!complaint.slaResolveBy) return null
  const due = new Date(complaint.slaResolveBy).getTime()
  if (Number.isNaN(due)) return null
  return Math.round(((due - now.getTime()) / MS) * 10) / 10
}

export function isComplaintOpen(complaint: Pick<Complaint, 'status'>): boolean {
  return complaint.status === 'Open' || complaint.status === 'In Progress'
}

/** Every open complaint currently past its own SLA, worst first. */
export function breachedComplaints(complaints: Complaint[], now: Date = new Date()): Complaint[] {
  return complaints
    .filter((c) => isComplaintOpen(c) && isBreached(c, now))
    .sort((a, b) => {
      const ra = a.slaResolveBy ? new Date(a.slaResolveBy).getTime() : Infinity
      const rb = b.slaResolveBy ? new Date(b.slaResolveBy).getTime() : Infinity
      return ra - rb
    })
}

export function slaLabel(complaint: SlaSubject, now: Date = new Date()): string {
  const state = slaStateOf(complaint, now)
  const closed = complaint.status === 'Resolved' || complaint.status === 'Closed'
  const respondBy = complaint.slaRespondBy ? new Date(complaint.slaRespondBy) : null
  // "Nobody has been assigned" is a different failure from "the fix took too
  // long", and the remedy is different, so the two are named separately.
  const respondMissed = !!respondBy && !complaint.respondedAt && now.getTime() > respondBy.getTime()

  if (state === 'none') return 'No SLA deadline on record for this complaint.'
  if (state === 'breached') {
    if (closed) return 'SLA deadline was missed. Resolving late does not clear the breach.'
    if (respondMissed) return 'Past the response deadline — no technician has been assigned yet.'
    return 'Past the resolution deadline.'
  }
  const h = hoursToResolveDeadline(complaint, now)
  if (state === 'atRisk') {
    if (respondMissed) return 'Response deadline is now.'
    return h === null ? 'Close to the SLA deadline.' : `Due in ${h}h`
  }
  if (closed) return 'Resolved within the SLA.'
  if (respondBy && !complaint.respondedAt) {
    const left = Math.round((respondBy.getTime() - now.getTime()) / MS)
    return `On track — respond within ${left}h`
  }
  return h === null ? 'On track.' : `On track — due in ${h}h`
}
