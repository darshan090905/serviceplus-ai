/**
 * First-time-fix and revisit metrics.
 *
 * These numbers are easy to fake by accident, so the rules are stated up front
 * and the module refuses to claim a fix it cannot point at.
 *
 *   fix visit  — a completed visit on the same (customer, unit, service type)
 *                that happened *after* a complaint was raised, within the
 *                window. A repair follows the fault report, so an earlier visit
 *                says nothing about this complaint.
 *
 *   one visit, one complaint — a visit is attributed to the *earliest*
 *                unanswered complaint on that key. A crew that attends one
 *                machine once has not fixed two separate faults, and without
 *                this rule a single visit would score every open complaint as
 *                resolved. When a complaint is linked to its visit directly
 *                (Complaint.serviceId) that link wins and the guess is skipped.
 *
 *   first-time fix — a complaint with a fix visit that was not itself a
 *                recurrence of a fault that had already been fixed.
 *
 *   revisit     — a complaint raised after an earlier complaint on the same key
 *                was fixed, within the window. The fault came back after
 *                somebody declared it sorted, which is the only real evidence of
 *                a failed repair in this data.
 *
 *   unknown     — no fix visit. Counted in the total, never in the numerator.
 *                Scoring an unrecorded month as 100% first-time-fix is how a
 *                service business hides a problem from itself.
 */
import type { Complaint, ServiceRecord } from '../types'
import { daysBetween } from './dates'

/** Default window for "the fault came back". Thirty days is the usual default. */
export const DEFAULT_REVISIT_WINDOW_DAYS = 30

export interface FtfOptions {
  revisitWindowDays?: number
}

export interface ComplaintFtf {
  complaintId: string
  /** A completed visit was attributed to this complaint inside the window. */
  hasFixVisit: boolean
  linkedVisitId: string | null
  /** Days from the complaint to its fix visit. */
  daysToFix: number | null
  /** True when this came from an explicit serviceId link rather than a guess. */
  linkedExplicitly: boolean
  isRevisit: boolean
  isFirstTimeFix: boolean
}

export interface FtfCounts {
  totalComplaints: number
  /** Complaints with no fix visit. In the total, out of the rate. */
  unknown: number
  firstTimeFixes: number
  revisits: number
  /** Percentage of *scored* complaints that were a first-time fix. */
  ftfRate: number
}

/**
 * What counts as "the same thing".
 *
 * A different unit is a different problem even for the same customer and service
 * type, so the unit is part of the key. A complaint with no unit recorded still
 * groups on customer and service type alone, because dropping it would exclude
 * every visit that was not tied to a machine, and dropping records is how a
 * metric starts looking better than the work actually was.
 */
function faultKey(customerId: string, assetId: string | null | undefined, serviceType: string | null | undefined): string {
  return [customerId, assetId || '_no_unit', serviceType || '_no_type'].join('|')
}

function day(value: string): string {
  return value.slice(0, 10)
}

export function computeComplaintFtf(
  complaints: Complaint[],
  services: ServiceRecord[],
  opts: FtfOptions = {},
): ComplaintFtf[] {
  const window = opts.revisitWindowDays ?? DEFAULT_REVISIT_WINDOW_DAYS

  // Completed visits only. A scheduled or cancelled visit is a plan, not a repair.
  const visitsByKey = new Map<string, ServiceRecord[]>()
  for (const s of services) {
    if (s.status !== 'Completed') continue
    const key = faultKey(s.customerId, s.assetId, s.serviceType)
    const list = visitsByKey.get(key) ?? []
    list.push(s)
    visitsByKey.set(key, list)
  }
  for (const list of visitsByKey.values()) list.sort((a, b) => (day(a.date) < day(b.date) ? -1 : day(a.date) > day(b.date) ? 1 : 0))

  const groups = new Map<string, Complaint[]>()
  for (const c of complaints) {
    const key = faultKey(c.customerId, c.assetId, c.serviceType)
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }
  for (const list of groups.values()) list.sort((a, b) => (day(a.created) < day(b.created) ? -1 : day(a.created) > day(b.created) ? 1 : 0))

  const results = new Map<string, ComplaintFtf>()

  for (const [key, group] of groups) {
    const visits = visitsByKey.get(key) ?? []
    const assigned = new Map<string, { visit: ServiceRecord; days: number }>()

    // An explicit complaint -> service link is the real answer; trust it first.
    for (const c of group) {
      if (!c.serviceId) continue
      const v = visits.find((s) => s.id === c.serviceId)
      if (!v) continue
      const raised = day(c.created)
      if (day(v.date) <= raised) continue
      const days = daysBetween(day(v.date), raised)
      if (days > window) continue
      assigned.set(c.id, { visit: v, days })
    }

    // Then let each remaining visit answer the earliest complaint still waiting.
    // Walking visits in date order means the first crew through the door is the
    // one recorded against the first unanswered complaint.
    for (const v of visits) {
      if ([...assigned.values()].some((a) => a.visit.id === v.id)) continue
      for (const c of group) {
        if (assigned.has(c.id)) continue
        const raised = day(c.created)
        if (day(v.date) <= raised) continue
        const days = daysBetween(day(v.date), raised)
        if (days > window) continue
        assigned.set(c.id, { visit: v, days })
        break
      }
    }

    // A complaint is a revisit when the same fault had already been fixed and
    // then came back inside the window.
    const fixDayById = new Map<string, string>()
    for (const c of group) {
      const hit = assigned.get(c.id)
      if (hit) fixDayById.set(c.id, day(hit.visit.date))
    }

    for (const c of group) {
      const raised = day(c.created)
      const hit = assigned.get(c.id) ?? null
      const isRevisit = group.some((other) => {
        if (other.id === c.id) return false
        if (day(other.created) >= raised) return false
        const fixedOn = fixDayById.get(other.id)
        if (!fixedOn) return false
        // Came back after that repair, and soon enough to blame the repair.
        return raised >= fixedOn && daysBetween(raised, fixedOn) <= window
      })
      results.set(c.id, {
        complaintId: c.id,
        hasFixVisit: hit !== null,
        linkedVisitId: hit ? hit.visit.id : null,
        daysToFix: hit ? hit.days : null,
        linkedExplicitly: Boolean(hit && c.serviceId === hit.visit.id),
        isRevisit,
        isFirstTimeFix: hit !== null && !isRevisit,
      })
    }
  }

  return complaints.map((c) => results.get(c.id)).filter((r): r is ComplaintFtf => Boolean(r))
}

export function computeFtfCounts(map: ComplaintFtf[]): FtfCounts {
  const total = map.length
  const scored = map.filter((m) => m.hasFixVisit).length
  const firstTimeFixes = map.filter((m) => m.isFirstTimeFix).length
  const revisits = map.filter((m) => m.isRevisit).length
  // Denominator is what can be judged. "No data" and "everything went well" are
  // different claims and this function refuses to conflate them.
  const ftfRate = scored === 0 ? 0 : Math.round((firstTimeFixes / scored) * 100)
  return { totalComplaints: total, unknown: total - scored, firstTimeFixes, revisits, ftfRate }
}
