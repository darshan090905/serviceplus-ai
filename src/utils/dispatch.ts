import type { AuthAccount, ServiceRecord, ServiceTypeKey } from '../types'
import { SERVICE_TYPES } from '../constants'
import { isValidMinutes, minutesToLabel, startOfWeek, weekDates, isSameDay } from './dates'
import { findTechnician, technicianKey } from './technicians'

/**
 * The simplest viable way to place a visit on a week board.
 *
 * The goal isn't a drag-and-drop calendar, it's an obvious overview: which
 * technician is doing what, on which day, at what time, and whether two of
 * their visits overlap with one another. No dependencies, no canvas, just the
 * week in one view.
 *
 * A board slot is local wall-clock (date + startMinute). That matches the
 * storage decision: storing minutes-from-midnight beside a local date avoids the
 * UTC shift class of bug this codebase deliberately avoids.
 */

export interface TechnicianSlot {
  key: string
  account?: AuthAccount
  name: string
  technicianId?: string | null
  unresolved: boolean
  hasSkills?: boolean
}

export interface ServiceBlock {
  id: string
  date: string
  technicianId?: string | null
  technicianName: string
  startMinute: number | null
  endMinute: number | null
  durationMinutes: number | null
  overlaps: boolean
  serviceType: string
  customerId: string
  notes?: string
  technicianKey: string | null
  unresolved: boolean
}

export interface DayBlock {
  date: string
  blocks: ServiceBlock[]
}

export interface WeekView {
  weekStart: string
  days: DayBlock[]
  technicians: TechnicianSlot[]
}

export interface WeekBounds {
  start: string
  end: string
}

/** The week containing `anchor`. Returns a start and an exclusive-like end? No: the board renders exactly seven days, inclusive. */
export function weekBounds(anchor: string | Date): WeekBounds {
  const start = startOfWeek(anchor)
  if (!start) return { start: '', end: '' }
  const dates = weekDates(start)
  const end = dates[6] ?? start
  return { start, end }
}

/** Derives a start and end minute for a service, with sensible fallbacks. */
export function serviceMinutes(s: ServiceRecord, fallbackDuration = 60): { start: number | null; end: number | null; duration: number | null } {
  const start = isValidMinutes(s.startMinute) ? Math.round(s.startMinute!) : null
  const durationFromDb = isValidMinutes(s.durationMinutes) && s.durationMinutes! > 0 ? Math.round(s.durationMinutes!) : null
  const duration = durationFromDb ?? fallbackDuration
  if (start === null) {
    return { start: null, end: null, duration: durationFromDb }
  }
  let end = start + duration
  if (end > 1439) end = 1439
  if (end <= start) end = start + fallbackDuration
  return { start, end, duration: durationFromDb }
}

function emptyDay(date: string): DayBlock {
  return { date, blocks: [] }
}

/** Group services into a Monday–Sunday week, with overlap detection per technician per day. */
export function buildWeekView(services: ServiceRecord[], accounts: AuthAccount[], anchor: string | Date): WeekView {
  const bounds = weekBounds(anchor)
  const start = bounds.start
  if (!start) {
    return { weekStart: '', days: [], technicians: [] }
  }
  // An empty week still has a shape: seven day columns with nothing in them.
  // The board renders that as an empty state. What it must not do is fill those
  // columns, because a week that looks populated is a claim about the roster
  // that nobody made.
  const dates = weekDates(start)
  const dayMap = new Map<string, DayBlock>()
  for (const d of dates) dayMap.set(d, emptyDay(d))

  // Technicians: union of those who have profiles, plus those who appear on visits.
  const techMap = new Map<string, TechnicianSlot>()
  for (const a of accounts) {
    if (a.role !== 'technician') continue
    const key = technicianKey(a.technicianId ?? a.name)
    if (!key) continue
    if (!techMap.has(key)) {
      techMap.set(key, {
        key,
        account: a,
        name: a.technicianId ?? a.name ?? a.email,
        technicianId: a.technicianId ?? null,
        unresolved: false,
        hasSkills: Array.isArray(a.serviceTypes) && a.serviceTypes.length > 0,
      })
    }
  }

  const blocks: ServiceBlock[] = []
  for (const s of services) {
    if (!isSameDay(s.date, start) && !dates.some((d) => isSameDay(s.date, d))) continue
    const date = s.date.slice(0, 10)
    if (!dayMap.has(date)) dayMap.set(date, emptyDay(date))
    const t = findTechnician(s.technicianId ?? s.technician, accounts)
    const tKey = technicianKey(s.technicianId ?? s.technician ?? t?.technicianId ?? t?.name)
    const tm = serviceMinutes(s)
    const block: ServiceBlock = {
      id: s.id,
      date,
      technicianId: s.technicianId ?? t?.technicianId ?? null,
      technicianName: t?.technicianId ?? t?.name ?? s.technician,
      startMinute: tm.start,
      endMinute: tm.end,
      durationMinutes: tm.duration,
      overlaps: false,
      serviceType: s.serviceType,
      customerId: s.customerId,
      notes: s.notes,
      technicianKey: tKey,
      unresolved: !tKey || !t,
    }
    if (tKey && !techMap.has(tKey)) {
      techMap.set(tKey, {
        key: tKey,
        account: t,
        name: block.technicianName,
        technicianId: block.technicianId,
        unresolved: block.unresolved,
      })
    }
    blocks.push(block)
    dayMap.get(date)?.blocks.push(block)
  }

  // Overlap detection per technician per day, only when both have a start time.
  for (const db of dayMap.values()) {
    const byTech = new Map<string, ServiceBlock[]>()
    for (const b of db.blocks) {
      const k = b.technicianKey ?? b.technicianName.toLowerCase()
      const arr = byTech.get(k) ?? []
      arr.push(b)
      byTech.set(k, arr)
    }
    for (const arr of byTech.values()) {
      arr.sort((a, b) => {
        if (a.startMinute === b.startMinute) return a.id.localeCompare(b.id)
        if (a.startMinute === null) return 1
        if (b.startMinute === null) return -1
        return a.startMinute - b.startMinute
      })
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1]
        const cur = arr[i]
        if (prev.startMinute === null || cur.startMinute === null) continue
        if (prev.endMinute === null || cur.endMinute === null) continue
        if (cur.startMinute < prev.endMinute) {
          prev.overlaps = true
          cur.overlaps = true
        }
      }
    }
  }

  const days: DayBlock[] = dates.map((d) => dayMap.get(d) ?? emptyDay(d))
  const technicians: TechnicianSlot[] = [...techMap.values()].sort((a, b) => a.name.localeCompare(b.name))

  return { weekStart: start, days, technicians }
}

/** When start time is missing, slot at the end of the day so it is obvious, but mark as unresolved in time. */
export function timeOrder(b: ServiceBlock): number {
  if (b.startMinute === null) return 24 * 60
  return b.startMinute
}

/** Render a block's time label, or 'Unscheduled' if no start time exists. */
export function blockTimeLabel(b: ServiceBlock): string {
  if (b.startMinute === null) return 'Unscheduled'
  const start = minutesToLabel(b.startMinute)
  if (b.endMinute === null || b.endMinute <= b.startMinute) return start
  return `${start}–${minutesToLabel(b.endMinute)}`
}

/** True if the service has a resolvable technician id. */
export function isUnresolvedTechnician(s: ServiceRecord, accounts: AuthAccount[]): boolean {
  const t = findTechnician(s.technicianId ?? s.technician, accounts)
  const k = technicianKey(s.technicianId ?? s.technician ?? t?.technicianId ?? t?.name)
  return !k || !t
}

// ------------------------------------------------------------------
// Turning a complaint into dispatchable work
// ------------------------------------------------------------------

/**
 * Why a complaint assignment produces a board entry.
 *
 * A complaint and a service visit are separate records, and until now nothing
 * connected them: assigning a complaint set `complaints.assigned_to` and queued
 * a call, and the dispatch board reads only `services`, so the work an
 * administrator assigned never appeared on the board a technician works from.
 * Two people looking at the same job and one of them sees nothing. This builds
 * the missing visit so the assignment is visible where the day is planned.
 *
 * It is a pure function, deliberately. The store calls it and does the
 * persisting, so the rules below can be tested without a database.
 */
export interface ComplaintVisitInput {
  complaint: {
    id: string
    customerId: string
    description: string
    /** The service the customer reported the problem against, when recorded. */
    serviceType?: string | null
    /** Set when this complaint already owns a visit; reused instead of duplicating. */
    serviceId?: string | null
  }
  technician: string
  technicianId?: string | null
  /** Local date the work was assigned, so the visit lands on the week being worked. */
  date: string
  /** Injected so the id is reproducible in tests. */
  id: string
}

/**
 * The visit an assigned complaint should create, or null when it should not
 * create one.
 *
 * Four decisions worth stating, because each is a place this could have gone
 * quietly wrong:
 *
 * `date` is the day of assignment, not the day the complaint was raised. A
 * complaint can sit unanswered for a week, and putting the visit on the
 * original date would file it in the past where nobody planning the week will
 * ever see it.
 *
 * `startMinute` is null, so the visit shows as unscheduled. Assigning somebody
 * is not the same as knowing when they can attend, and inventing a time would
 * let the overlap detector report conflicts that are only artefacts of a
 * guessed slot.
 *
 * `amcId` is null even when the complaint is against an AMC-covered asset. This
 * is a reactive job, not a preventive one, and counting it as the AMC's visit
 * would double-count contract visits and corrupt the FTF and renewal figures
 * built on them.
 *
 * `serviceType` falls back to the first catalogue entry rather than to the
 * complaint's free-text category, which is a quality label ("Billing",
 * "Technician") and not a service type at all.
 */
export function visitForComplaint(input: ComplaintVisitInput): ServiceRecord | null {
  const { complaint, technician, technicianId, date, id } = input
  if (!complaint.customerId || !technician) return null
  const known = (SERVICE_TYPES as readonly string[]).includes(complaint.serviceType ?? '')
    ? (complaint.serviceType as ServiceTypeKey)
    : SERVICE_TYPES[0]
  return {
    id,
    customerId: complaint.customerId,
    amcId: null,
    serviceType: known,
    date,
    technician,
    technicianId: technicianId ?? null,
    startMinute: null,
    durationMinutes: null,
    status: 'Scheduled',
    rating: null,
    notes: `Raised from complaint ${complaint.id}: ${complaint.description}`.slice(0, 500),
    assetId: null,
  }
}
