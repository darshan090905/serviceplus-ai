import type { AuthAccount, ServiceTypeKey, ServiceTypeKey as ServiceType } from '../types'

/**
 * One place to answer "is this record assigned to this technician?".
 *
 * Three screens used to decide that independently and disagree. ServicesPage
 * keyed accounts by `technicianId ?? name` but keyed visits by the free-text
 * `services.technician`, so the two only lined up when the text happened to be
 * the id; TechJobsPage compared `assigned === myName || assigned === me ||
 * assigned.toLowerCase() === myName.toLowerCase()`, which lowercased only one
 * side and so matched "ravi" to "Ravi" but never to " Ravi ". The result was a
 * technician who could see a visit on one screen and not on another, and a
 * "unassigned" placeholder that counted as a person.
 *
 * The record columns stay free text — renaming the column on every table would
 * mean backfilling history that no longer exists — so the comparison is
 * normalised here instead, once, and every caller goes through it.
 */

/** Placeholders that occupy the column without naming anybody. */
const UNASSIGNED = new Set(['', 'unassigned', 'unassigned ', 'none', 'null', 'undefined', 'tbd', '-'])

/** The same person, however they were typed. */
export function technicianKey(value: string | null | undefined): string | null {
  if (value == null) return null
  const key = value.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!key || UNASSIGNED.has(key)) return null
  // An email in the assignment column is an unresolved address, not a
  // technician. It was being read as a name and creating a phantom technician
  // row in the dispatch list.
  if (key.includes('@')) return null
  return key
}

/** Who is asking. Either field is enough; a profile carries both. */
export interface TechnicianIdentity {
  technicianId?: string | null
  name?: string | null
}

/**
 * True when `assigned` names the given technician.
 *
 * A technician matches on their id or their name, case- and space-insensitively.
 */
export function isAssignedTo(assigned: string | null | undefined, who: TechnicianIdentity): boolean {
  const target = technicianKey(assigned)
  if (!target) return false
  const keys = [technicianKey(who.technicianId), technicianKey(who.name)].filter(Boolean) as string[]
  return keys.includes(target)
}

/**
 * The profiles that can be assigned a job, i.e. approved or active technicians.
 *
 * Demo profiles are excluded. The dispatch board needs a second technician
 * column to be legible at all, so the seed creates an example technician; but a
 * profile is otherwise indistinguishable from a real one, and it would appear
 * in the service form's dropdown and in complaint assignment, where real work
 * could be handed to somebody who does not exist and cannot sign in.
 *
 * This is the only place that decision is made, so a new picker cannot forget
 * to exclude demos the way a filter copied into each screen would. The board
 * still draws their column, because it builds its columns from the visits
 * themselves rather than from this list.
 */
export function activeTechnicians(accounts: AuthAccount[]): AuthAccount[] {
  return accounts.filter((a) => a.role === 'technician' && a.status === 'active' && !a.isDemo)
}

/**
 * The profile a free-text assignment refers to.
 *
 * Prefers an id match over a name match, because a name is not unique and an id
 * is. Returns undefined rather than guessing when nothing matches: an
 * unrecognised name is a data problem to surface, not a technician to invent.
 */
export function findTechnician(assigned: string | null | undefined, accounts: AuthAccount[]): AuthAccount | undefined {
  const key = technicianKey(assigned)
  if (!key) return undefined
  const pool = activeTechnicians(accounts)
  return (
    pool.find((a) => technicianKey(a.technicianId) === key) ??
    pool.find((a) => technicianKey(a.name) === key)
  )
}

/** Every way this technician is spelled in the existing data. */
export function technicianAliases(who: TechnicianIdentity): string[] {
  const out: string[] = []
  for (const value of [who.technicianId, who.name]) {
    const key = technicianKey(value)
    if (key && !out.includes(key)) out.push(key)
  }
  return out
}

/**
 * True when a technician is allowed to take a given job.
 *
 * A technician with no declared skills is not excluded — the field was added
 * long after the accounts were, so an empty list means "not yet recorded" rather
 * than "can do nothing", and treating it as "none" would hide half the team from
 * dispatch on day one.
 */
export function canService(who: TechnicianIdentity, serviceType: ServiceTypeKey | string): boolean {
  const skills = (who as { serviceTypes?: ServiceTypeKey[] }).serviceTypes
  if (!skills || skills.length === 0) return true
  return skills.some((s) => s.toLowerCase() === String(serviceType).toLowerCase())
}

export type { ServiceType }

/**
 * The profile id behind a free-text technician name, or null.
 *
 * Used when writing: a visit picked from a dropdown should store the id, not
 * the label, so a later rename of the technician does not orphan every visit
 * that was booked under the old name. Returns null when the name matches no
 * profile — an unrecognised name stays unlinked instead of being attached to
 * whoever happens to sort first.
 */
export function resolveTechnicianId(assigned: string | null | undefined, accounts: AuthAccount[]): string | null {
  return findTechnician(assigned, accounts)?.technicianId ?? null
}
