import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AMCContract,
  AuthAccount,
  CallRecord,
  Complaint,
  ComplaintMessage,
  Customer,
  EmailRecord,
  EquipmentAsset,
  MessageSenderRole,
  Notification,
  Payment,
  PaymentMethod,
  RetentionAction,
  ServiceRecord,
  ServiceTypeKey,
} from '../types'
import { computeHealth } from '../utils/health'

// ------------------------------------------------------------------
// Supabase data access layer.
//
// The app keeps the exact same React types regardless of source. When
// VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set, all state is
// hydrated from Postgres on mount and every mutation is written back
// (upsert of the full collection — small demo data). When they are
// missing, nothing here is used and the in-memory demo store runs as
// before, so the build and dev server work without a backend.
// ------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const supabase: SupabaseClient | null = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

export const isSupabaseConfigured = (): boolean => supabase !== null

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isoMaybe(value: string | null): string | null {
  if (!value) return null
  return DATE_RE.test(value) ? `${value}T00:00:00.000Z` : value
}

function dbDate(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null
}

interface ProfileRow {
  id: string
  auth_uid: string | null
  name: string
  email: string
  role: 'customer' | 'technician'
  status: 'pending' | 'active' | 'rejected'
  customer_id: string | null
  technician_id: string | null
  company: string | null
  service_types: unknown
  city: string | null
  note: string | null
  requested_at: string | null
  approved_at: string | null
  is_demo: boolean | null
}

export function profileToAccount(row: ProfileRow): AuthAccount {
  return {
    id: row.id,
    authUid: row.auth_uid ?? undefined,
    name: row.name,
    email: row.email,
    password: '',
    role: row.role,
    status: row.status,
    customerId: row.customer_id ?? undefined,
    technicianId: row.technician_id ?? undefined,
    company: row.company ?? undefined,
    serviceTypes: Array.isArray(row.service_types) ? (row.service_types as ServiceTypeKey[]) : [],
    city: row.city ?? undefined,
    requestedAt: isoMaybe(row.requested_at) ?? new Date().toISOString(),
    approvedAt: isoMaybe(row.approved_at) ?? undefined,
    note: row.note ?? undefined,
    isDemo: row.is_demo ?? false,
  }
}

export function accountToProfile(a: AuthAccount): Partial<ProfileRow> {
  return {
    id: a.id,
    auth_uid: a.authUid ?? null,
    name: a.name,
    email: a.email.toLowerCase(),
    role: a.role,
    status: a.status,
    customer_id: a.customerId ?? null,
    technician_id: a.technicianId ?? null,
    company: a.company ?? null,
    service_types: (a.serviceTypes ?? []).length ? (a.serviceTypes ?? []) : [],
    city: a.city ?? null,
    note: a.note ?? null,
    requested_at: isoMaybe(a.requestedAt),
    approved_at: isoMaybe(a.approvedAt ?? null),
    is_demo: a.isDemo ?? false,
  }
}

interface CustomerRow {
  id: string
  name: string
  company: string
  email: string
  phone: string
  address: string
  city: string
  type: 'Individual' | 'Business'
  service_types: unknown
  joined: string | null
  factors: unknown
  /** Migration 004. Optional at the type level so a database without it still
   *  hydrates, and the write path below reports the missing migration. */
  gstin?: string | null
  state?: string | null
}

export function customerToRow(c: Customer): CustomerRow {
  return {
    id: c.id,
    name: c.name,
    company: c.company,
    email: c.email,
    phone: c.phone,
    address: c.address,
    city: c.city,
    type: c.type,
    service_types: c.serviceTypes,
    joined: dbDate(c.joined),
    factors: c.health.factors,
    gstin: c.gstin ?? null,
    state: c.state ?? null,
  }
}

export function customerFromRow(row: CustomerRow): Customer {
  const factors = Array.isArray(row.factors) ? (row.factors as Array<{ label: string; points: number }>) : []
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    type: row.type,
    serviceTypes: Array.isArray(row.service_types) ? (row.service_types as ServiceTypeKey[]) : [],
    joined: row.joined ?? new Date().toISOString().slice(0, 10),
    health: computeHealth(factors),
    // `select('*')` does not fail on a database that has not had migration 004
    // applied; the two columns are simply absent from the payload, so reading
    // them is safe before the migration and needs no fallback of its own.
    gstin: row.gstin ?? null,
    state: row.state ?? null,
  }
}

interface AmcRow {
  id: string
  customer_id: string
  service_type: string
  start_date: string | null
  end_date: string | null
  renewal_date: string | null
  amount: number
  status: string
  renewal_status: string
  asset_id?: string | null
  visits_per_year?: number | null
  next_visit_on?: string | null
}

function amcToRow(a: AMCContract): AmcRow {
  return {
    id: a.id,
    customer_id: a.customerId,
    service_type: a.serviceType,
    start_date: dbDate(a.startDate),
    end_date: dbDate(a.endDate),
    renewal_date: a.renewalDate ? dbDate(a.renewalDate) : null,
    amount: a.amount,
    status: a.status,
    renewal_status: a.renewalStatus,
    asset_id: a.assetId ?? null,
    visits_per_year: a.visitsPerYear ?? null,
    next_visit_on: a.nextVisitOn ? dbDate(a.nextVisitOn) : null,
  }
}

function amcFromRow(r: AmcRow): AMCContract {
  return {
    id: r.id,
    customerId: r.customer_id,
    serviceType: r.service_type as AMCContract['serviceType'],
    startDate: r.start_date ?? '',
    endDate: r.end_date ?? '',
    renewalDate: r.renewal_date ?? null,
    amount: Number(r.amount),
    status: r.status as AMCContract['status'],
    renewalStatus: r.renewal_status as AMCContract['renewalStatus'],
    assetId: r.asset_id ?? null,
    visitsPerYear: r.visits_per_year ?? null,
    nextVisitOn: r.next_visit_on ?? null,
  }
}

interface ServiceRow {
  id: string
  customer_id: string
  service_type: string
  date: string | null
  technician: string
  status: string
  rating: number | null
  notes: string
  check_in_at: string | null
  check_out_at: string | null
  arrived_lat: number | null
  arrived_lng: number | null
  customer_lat: number | null
  customer_lng: number | null
  location_shared_at: string | null
  asset_id?: string | null
  amc_id?: string | null
  technician_id?: string | null
  start_minute?: number | null
  duration_minutes?: number | null
}

function serviceToRow(s: ServiceRecord): ServiceRow {
  return {
    id: s.id,
    customer_id: s.customerId,
    service_type: s.serviceType,
    date: dbDate(s.date),
    technician: s.technician,
    status: s.status,
    rating: s.rating,
    notes: s.notes,
    check_in_at: isoMaybe(s.checkInAt ?? null),
    check_out_at: isoMaybe(s.checkOutAt ?? null),
    arrived_lat: s.arrivedLat ?? null,
    arrived_lng: s.arrivedLng ?? null,
    customer_lat: s.customerLat ?? null,
    customer_lng: s.customerLng ?? null,
    location_shared_at: isoMaybe(s.locationSharedAt ?? null),
    asset_id: s.assetId ?? null,
    amc_id: s.amcId ?? null,
    technician_id: s.technicianId ?? null,
    start_minute: s.startMinute ?? null,
    duration_minutes: s.durationMinutes ?? null,
  }
}

function serviceFromRow(r: ServiceRow): ServiceRecord {
  return {
    id: r.id,
    customerId: r.customer_id,
    serviceType: r.service_type as ServiceRecord['serviceType'],
    date: r.date ?? '',
    technician: r.technician,
    status: r.status as ServiceRecord['status'],
    rating: r.rating,
    notes: r.notes,
    checkInAt: isoMaybe(r.check_in_at),
    checkOutAt: isoMaybe(r.check_out_at),
    arrivedLat: r.arrived_lat ?? undefined,
    arrivedLng: r.arrived_lng ?? undefined,
    customerLat: r.customer_lat ?? undefined,
    customerLng: r.customer_lng ?? undefined,
    locationSharedAt: isoMaybe(r.location_shared_at),
    assetId: r.asset_id ?? null,
    amcId: r.amc_id ?? null,
    technicianId: r.technician_id ?? null,
    startMinute: r.start_minute ?? null,
    durationMinutes: r.duration_minutes ?? null,
  }
}

interface ComplaintRow {
  id: string
  customer_id: string
  category: string
  description: string
  severity: string
  status: string
  created: string | null
  assigned_to: string
  service_type: string | null
  resolution: string | null
  analysis: unknown
  satisfaction: number | null
  feedback: string | null
  latitude: number | null
  longitude: number | null
  location_address: string | null
  location_shared_at: string | null
  assigned_at: string | null
  arrived_at: string | null
  arrival_lat: number | null
  arrival_lng: number | null
  work_started_at: string | null
  work_completed_at: string | null
  resolved_at: string | null
  asset_id?: string | null
  sla_respond_by?: string | null
  sla_resolve_by?: string | null
  sla_breached?: boolean | null
  responded_at?: string | null
  service_id?: string | null
  assigned_to_id?: string | null
}

function complaintToRow(c: Complaint): ComplaintRow {
  return {
    id: c.id,
    customer_id: c.customerId,
    category: c.category,
    description: c.description,
    severity: c.severity,
    status: c.status,
    created: isoMaybe(c.created),
    assigned_to: c.assignedTo,
    service_type: c.serviceType ?? null,
    resolution: c.resolution ?? null,
    analysis: c.analysis ?? null,
    satisfaction: c.satisfaction ?? null,
    feedback: c.feedback ?? null,
    latitude: c.latitude ?? null,
    longitude: c.longitude ?? null,
    location_address: c.locationAddress ?? null,
    location_shared_at: isoMaybe(c.locationSharedAt ?? null),
    assigned_at: isoMaybe(c.assignedAt ?? null),
    arrived_at: isoMaybe(c.arrivedAt ?? null),
    arrival_lat: c.arrivalLat ?? null,
    arrival_lng: c.arrivalLng ?? null,
    work_started_at: isoMaybe(c.workStartedAt ?? null),
    work_completed_at: isoMaybe(c.workCompletedAt ?? null),
    resolved_at: isoMaybe(c.resolvedAt ?? null),
    asset_id: c.assetId ?? null,
    sla_respond_by: isoMaybe(c.slaRespondBy ?? null),
    sla_resolve_by: isoMaybe(c.slaResolveBy ?? null),
    sla_breached: c.slaBreached ?? false,
    responded_at: isoMaybe(c.respondedAt ?? null),
    service_id: c.serviceId ?? null,
    assigned_to_id: c.assignedToId ?? null,
  }
}

function complaintFromRow(r: ComplaintRow): Complaint {
  return {
    id: r.id,
    customerId: r.customer_id,
    category: r.category as Complaint['category'],
    description: r.description,
    severity: r.severity as Complaint['severity'],
    status: r.status as Complaint['status'],
    created: isoMaybe(r.created) ?? new Date().toISOString(),
    assignedTo: r.assigned_to,
    serviceType: r.service_type as ServiceTypeKey | undefined,
    resolution: r.resolution ?? undefined,
    analysis: r.analysis as Complaint['analysis'],
    satisfaction: r.satisfaction ?? undefined,
    feedback: r.feedback ?? undefined,
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined,
    locationAddress: r.location_address ?? undefined,
    locationSharedAt: isoMaybe(r.location_shared_at),
    assignedAt: isoMaybe(r.assigned_at),
    arrivedAt: isoMaybe(r.arrived_at),
    arrivalLat: r.arrival_lat ?? undefined,
    arrivalLng: r.arrival_lng ?? undefined,
    workStartedAt: isoMaybe(r.work_started_at),
    workCompletedAt: isoMaybe(r.work_completed_at),
    resolvedAt: isoMaybe(r.resolved_at),
    assetId: r.asset_id ?? null,
    slaRespondBy: isoMaybe(r.sla_respond_by ?? null),
    slaResolveBy: isoMaybe(r.sla_resolve_by ?? null),
    slaBreached: r.sla_breached ?? false,
    respondedAt: isoMaybe(r.responded_at ?? null),
    serviceId: r.service_id ?? null,
    assignedToId: r.assigned_to_id ?? null,
  }
}

export async function updateComplaintDb(c: Complaint): Promise<boolean> {
  if (!supabase) return false
  return upsertWithOptionalFallback('complaints', complaintToRow(c) as unknown as Record<string, unknown>, [
    { column: 'sla_respond_by', migration: VISITS_SLA_MIGRATION },
    { column: 'sla_resolve_by', migration: VISITS_SLA_MIGRATION },
    { column: 'sla_breached', migration: VISITS_SLA_MIGRATION },
    { column: 'responded_at', migration: VISITS_SLA_MIGRATION },
    { column: 'service_id', migration: DISPATCH_MIGRATION },
    { column: 'assigned_to_id', migration: DISPATCH_MIGRATION },
  ])
}

/**
 * Updates only the columns it is given.
 *
 * Deliberately not an upsert of the whole row: two people editing a customer in
 * different tabs would otherwise each write their stale copy of the address and
 * the phone number over the other's change, because a full-row upsert has no
 * idea which fields the other save touched. A patch of just the edited fields
 * is the only shape that cannot lose a concurrent edit elsewhere.
 */
export async function updateCustomerDb(
  customerId: string,
  updates: Partial<Pick<Customer, 'name' | 'company' | 'email' | 'phone' | 'address' | 'city' | 'type' | 'gstin' | 'state'>>,
): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase
    .from('customers')
    .update({
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.company !== undefined && { company: updates.company }),
      ...(updates.email !== undefined && { email: updates.email }),
      ...(updates.phone !== undefined && { phone: updates.phone }),
      ...(updates.address !== undefined && { address: updates.address }),
      ...(updates.city !== undefined && { city: updates.city }),
      ...(updates.type !== undefined && { type: updates.type }),
      ...(updates.gstin !== undefined && { gstin: updates.gstin }),
      ...(updates.state !== undefined && { state: updates.state }),
    })
    .eq('id', customerId)
    .select('id')
  if (error) {
    // The two tax columns are the ones that can be missing on an older
    // database, so the message names the migration instead of leaking a 42703
    // column-code at the user.
    if (error.code === 'PGRST204' || error.code === '42703' || /gstin|state/i.test(error.message)) {
      handleError({ ...error, message: `The customers table is missing gstin/state. Apply supabase/migrations/004-gst-invoices.sql in the Supabase SQL Editor. Original error: ${error.message}` })
      return false
    }
    handleError(error)
    return false
  }
  return (data ?? []).length > 0
}

export async function updateNotificationDb(n: Notification): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('notifications').upsert(notificationToRow(n), { onConflict: 'id' })
  if (error) {
    handleError(error)
    return false
  }
  return true
}

export async function deleteNotificationDb(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('notifications').delete().eq('id', id)
  if (error) {
    handleError(error)
    return false
  }
  return true
}

export async function clearNotificationsDb(): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('notifications').delete().neq('id', '__clear_all__')
  if (error) {
    handleError(error)
    return false
  }
  return true
}

interface ComplaintMessageRow {
  id: string
  complaint_id: string
  sender_role: string
  sender_name: string
  body: string
  created_at: string | null
}

const MESSAGE_SENDER_ROLES: ReadonlyArray<MessageSenderRole> = ['customer', 'admin', 'technician']

function messageFromRow(r: ComplaintMessageRow): ComplaintMessage {
  return {
    id: r.id,
    complaintId: r.complaint_id,
    senderRole: (MESSAGE_SENDER_ROLES as ReadonlyArray<string>).includes(r.sender_role) ? (r.sender_role as MessageSenderRole) : 'admin',
    senderName: r.sender_name,
    body: r.body,
    createdAt: isoMaybe(r.created_at) ?? new Date().toISOString(),
  }
}

export async function insertMessageDb(message: ComplaintMessage): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('complaint_messages').insert({
    id: message.id,
    complaint_id: message.complaintId,
    sender_role: message.senderRole,
    sender_name: message.senderName,
    body: message.body,
  })
  if (error) {
    handleError(error)
    return false
  }
  return true
}

interface PaymentRow {
  id: string
  invoice: string
  customer_id: string
  amc_id: string
  amount: number
  due_date: string | null
  paid_date: string | null
  status: string
  method: string
  reference_id: string | null
}

function paymentToRow(p: Payment): PaymentRow {
  return {
    id: p.id,
    invoice: p.invoice,
    customer_id: p.customerId,
    amc_id: p.amcId,
    amount: p.amount,
    due_date: dbDate(p.dueDate),
    paid_date: dbDate(p.paidDate),
    status: p.status,
    method: p.method,
    reference_id: p.referenceId ?? null,
  }
}

function paymentFromRow(r: PaymentRow): Payment {
  return {
    id: r.id,
    invoice: r.invoice,
    customerId: r.customer_id,
    amcId: r.amc_id,
    amount: Number(r.amount),
    dueDate: r.due_date ?? '',
    paidDate: r.paid_date,
    status: r.status as Payment['status'],
    method: r.method as Payment['method'],
    referenceId: r.reference_id ?? undefined,
  }
}

interface NotificationRow {
  id: string
  title: string
  description: string
  time: string | null
  type: string
  read: boolean
  customer_id: string | null
  link: string | null
}

function notificationToRow(n: Notification): NotificationRow {
  return {
    id: n.id,
    title: n.title,
    description: n.description,
    time: dbDate(n.time),
    type: n.type,
    read: n.read,
    customer_id: n.customerId ?? null,
    link: n.link ?? null,
  }
}

const NOTIFICATION_TYPES: ReadonlyArray<Notification['type']> = ['Risk', 'AMC', 'Complaint', 'Payment', 'System', 'Service']

function notificationFromRow(r: NotificationRow): Notification {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    time: r.time ?? new Date().toISOString().slice(0, 10),
    type: (NOTIFICATION_TYPES as ReadonlyArray<string>).includes(r.type) ? (r.type as Notification['type']) : 'System',
    read: r.read,
    customerId: r.customer_id ?? undefined,
    link: r.link ?? undefined,
  }
}

interface EmailRow {
  id: string
  recipient: string
  to_email: string
  subject: string
  body: string
  type: string
  sent_at: string | null
  read: boolean
  status?: string
  customer_id?: string | null
}

function emailToRow(e: EmailRecord): EmailRow {
  // `status` is intentionally omitted: it's owned by the outbox worker (n8n)
  // which flips rows queued -> sent. If the browser upserted its stale local
  // copy it would resurrect 'queued' and the worker would re-send the email
  // every minute. New rows fall back to the DB default ('queued').
  return {
    id: e.id,
    recipient: e.to,
    to_email: e.toEmail,
    subject: e.subject,
    body: e.body,
    type: e.type,
    sent_at: dbDate(e.sentAt),
    read: e.read,
  }
}

const EMAIL_TYPES: ReadonlyArray<EmailRecord['type']> = ['critical-assignment', 'assignment', 'escalation', 'resolution', 'reminder', 'system', 'payment-reminder']

function emailFromRow(r: EmailRow): EmailRecord {
  return {
    id: r.id,
    to: r.recipient,
    toEmail: r.to_email,
    subject: r.subject,
    body: r.body,
    type: (EMAIL_TYPES as ReadonlyArray<string>).includes(r.type) ? (r.type as EmailRecord['type']) : 'system',
    sentAt: r.sent_at ?? new Date().toISOString().slice(0, 10),
    read: r.read,
    status: (r.status as EmailRecord['status']) ?? 'queued',
    customerId: r.customer_id ?? null,
  }
}

interface CallRow {
  id: string
  to_name: string
  complaint_id: string | null
  type: string
  message: string
  status: string
  created_at: string | null
  read: boolean
  customer_id?: string | null
}

function callToRow(c: CallRecord): CallRow {
  return {
    id: c.id,
    to_name: c.toName,
    complaint_id: c.complaintId ?? null,
    type: c.type,
    message: c.message,
    status: c.status,
    created_at: isoMaybe(c.createdAt),
    read: c.read,
  }
}

const CALL_TYPES: ReadonlyArray<CallRecord['type']> = ['assignment']
const CALL_STATUSES: ReadonlyArray<CallRecord['status']> = ['queued', 'ringing', 'answered', 'missed']

function callFromRow(r: CallRow): CallRecord {
  return {
    id: r.id,
    toName: r.to_name,
    complaintId: r.complaint_id ?? undefined,
    type: (CALL_TYPES as ReadonlyArray<string>).includes(r.type) ? (r.type as CallRecord['type']) : 'assignment',
    message: r.message,
    status: (CALL_STATUSES as ReadonlyArray<string>).includes(r.status) ? (r.status as CallRecord['status']) : 'queued',
    createdAt: isoMaybe(r.created_at) ?? new Date().toISOString(),
    read: r.read,
    customerId: r.customer_id ?? null,
  }
}

export async function updateCallDb(c: CallRecord): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('outbox_calls').upsert(callToRow(c), { onConflict: 'id' })
  if (error) {
    handleError(error)
    return false
  }
  return true
}

export async function deleteComplaintDb(id: string): Promise<boolean> {
  if (!supabase) return false
  const each = supabase.from('complaints').delete().eq('id', id)
  const calls = supabase.from('outbox_calls').delete().eq('complaint_id', id)
  const notif = supabase.from('notifications').delete().ilike('link', `%/complaints/${id}`)
  const mail = supabase.from('outbox_emails').delete().ilike('subject', `% ${id}`)
  const [e, c, n, m] = await Promise.all([each, calls, notif, mail])
  if (e.error) { handleError(e.error); return false }
  if (c.error) handleError(c.error)
  if (n.error) handleError(n.error)
  if (m.error) handleError(m.error)
  return true
}

// Contracts are written one row at a time (never through the bulk snapshot) so
// a delete can never be undone by a tab still holding the old array in memory.
export interface AssetRow {
  id: string
  customer_id: string
  name: string
  category: string
  model: string | null
  serial_no: string | null
  capacity: string | null
  installed_on: string | null
  warranty_until: string | null
  location_note: string | null
  status: string
  created_at: string | null
}

export function assetToRow(a: EquipmentAsset): AssetRow {
  return {
    id: a.id,
    customer_id: a.customerId,
    name: a.name,
    category: a.category,
    model: a.model || null,
    serial_no: a.serialNo || null,
    capacity: a.capacity || null,
    installed_on: a.installedOn ? dbDate(a.installedOn) : null,
    warranty_until: a.warrantyUntil ? dbDate(a.warrantyUntil) : null,
    location_note: a.locationNote || null,
    status: a.status,
    created_at: isoMaybe(a.createdAt),
  }
}

export function assetFromRow(r: AssetRow): EquipmentAsset {
  return {
    id: r.id,
    customerId: r.customer_id,
    name: r.name,
    category: (r.category ?? 'Other') as EquipmentAsset['category'],
    model: r.model ?? '',
    serialNo: r.serial_no ?? '',
    capacity: r.capacity ?? '',
    installedOn: dbDate(r.installed_on),
    warrantyUntil: dbDate(r.warranty_until),
    locationNote: r.location_note ?? '',
    status: (r.status ?? 'Active') as EquipmentAsset['status'],
    createdAt: isoMaybe(r.created_at) ?? new Date().toISOString(),
  }
}

// Machine rows follow the same rule as contracts and visits: single-row upserts
// and an explicit delete, never the bulk snapshot. A tab still holding a stale
// asset list therefore cannot resurrect a machine that was just deleted.
export async function upsertAssetDb(asset: EquipmentAsset): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('assets').upsert(assetToRow(asset), { onConflict: 'id' })
  if (error) {
    handleError(error)
    return false
  }
  return true
}

// Retiring a machine is a status change, so the rows that point at it are kept —
// only the pointer is cleared. A machine with service history stays visible on
// the customer's record instead of vanishing along with its past.
export async function deleteAssetDb(id: string): Promise<boolean> {
  if (!supabase) return false
  const [amcs, services, complaints, each] = await Promise.all([
    supabase.from('amcs').update({ asset_id: null }).eq('asset_id', id),
    supabase.from('services').update({ asset_id: null }).eq('asset_id', id),
    supabase.from('complaints').update({ asset_id: null }).eq('asset_id', id),
    supabase.from('assets').delete().eq('id', id),
  ])
  if (each.error) { handleError(each.error); return false }
  for (const r of [amcs, services, complaints]) if (r.error) handleError(r.error)
  return true
}

// Columns added after the first release. PostgREST rejects an entire statement
// when it sees a column the database does not have, so on an un-migrated
// database the whole edit would be lost. Each is retried once without it, and
// the log names the exact statement that is missing.
const RENEWAL_DATE_MIGRATION = 'alter table amcs add column if not exists renewal_date date;'
const VISITS_SLA_MIGRATION = 'alter table amcs add column if not exists visits_per_year int; alter table amcs add column if not exists next_visit_on date; alter table complaints add column if not exists sla_respond_by timestamptz; alter table complaints add column if not exists sla_resolve_by timestamptz; alter table complaints add column if not exists sla_breached boolean not null default false; alter table complaints add column if not exists responded_at timestamptz; alter table services add column if not exists amc_id text;'
const DISPATCH_MIGRATION =
  'alter table services add column if not exists technician_id text;'
  + ' alter table services add column if not exists start_minute integer;'
  + ' alter table services add column if not exists duration_minutes integer;'
  + ' alter table complaints add column if not exists assigned_to_id text;'
  + ' alter table complaints add column if not exists service_id text;'
  + ' create index if not exists services_date_idx on services (date);'
  + ' create index if not exists services_technician_date_idx on services (technician_id, date);'
const ASSET_MIGRATION = 'create table if not exists assets (id text primary key, customer_id text not null, name text not null, category text not null default \'Other\', model text, serial_no text, capacity text, installed_on date, warranty_until date, location_note text, status text not null default \'Active\', created_at timestamptz not null default now()); alter table amcs add column if not exists asset_id text; alter table services add column if not exists asset_id text; alter table complaints add column if not exists asset_id text; grant all on table assets to anon, authenticated, service_role; alter table assets enable row level security; drop policy if exists "assets_all_authenticated" on assets; create policy "assets_all_authenticated" on assets for all using (auth.role() = \'authenticated\');'

function isMissingColumn(error: { code?: string; message?: string }, column: string): boolean {
  return new RegExp(column, 'i').test(error.message ?? '') && /PGRST|42703|column|does not exist/i.test(`${error.code ?? ''} ${error.message ?? ''}`)
}

async function upsertWithOptionalFallback(
  table: string,
  row: Record<string, unknown>,
  optional: ReadonlyArray<{ column: string; migration: string }>,
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' })
  if (!error) return true
  const missing = optional.filter((o) => isMissingColumn(error, o.column))
  if (!missing.length) {
    handleError(error)
    return false
  }
  const stripped = { ...row }
  for (const m of missing) delete stripped[m.column]
  const retry = await supabase.from(table).upsert(stripped, { onConflict: 'id' })
  if (retry.error) {
    handleError(retry.error)
    return false
  }
  console.warn(
    `[supabase] ${table}.${missing.map((m) => m.column).join(', ')} is missing — that value was not saved.\nApply: ${missing.map((m) => m.migration).join(' ')}`,
  )
  return true
}

export async function upsertAmcDb(amc: AMCContract): Promise<boolean> {
  return upsertWithOptionalFallback('amcs', amcToRow(amc) as unknown as Record<string, unknown>, [
    { column: 'renewal_date', migration: RENEWAL_DATE_MIGRATION },
    { column: 'asset_id', migration: ASSET_MIGRATION },
    { column: 'visits_per_year', migration: VISITS_SLA_MIGRATION },
    { column: 'next_visit_on', migration: VISITS_SLA_MIGRATION },
  ])
}

// Service rows persist only through this single-row upsert (add, update and the
// customer's satisfaction rating), never through the bulk persistAll write.
export async function upsertServiceDb(service: ServiceRecord): Promise<boolean> {
  return upsertWithOptionalFallback('services', serviceToRow(service) as unknown as Record<string, unknown>, [
    { column: 'asset_id', migration: ASSET_MIGRATION },
    // Without this, marking a visit complete would fail outright on a database
    // that has not had migration 002 applied yet.
    { column: 'amc_id', migration: VISITS_SLA_MIGRATION },
    // Migration 005. Without these the whole visit write fails on a database
    // that has not had 005 applied, and the failure looks like a permissions
    // problem rather than a missing column.
    { column: 'technician_id', migration: DISPATCH_MIGRATION },
    { column: 'start_minute', migration: DISPATCH_MIGRATION },
    { column: 'duration_minutes', migration: DISPATCH_MIGRATION },
  ])
}

// Hard-delete a contract. payments.amc_id is a plain text column with no
// foreign key, so payments already recorded against the contract are detached
// instead of deleted — the invoice and money history stay, they just no longer
// point at a contract that is gone. The empty string is what the rest of the app
// already uses for "no contract" (see paymentToRow/paymentFromRow), so the bulk
// upsert rewrites the same value instead of fighting this write.
// Notifications and queued outbox emails that referenced the contract are
// removed explicitly, since the upsert persist layer never deletes rows.
export async function deleteServiceDb(id: string): Promise<boolean> {
  if (!supabase) return false
  const pattern = (value: string) => `%${value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  const each = supabase.from('services').delete().eq('id', id)
  const notif = supabase.from('notifications').delete().ilike('link', pattern(`/services/${id}`))
  const mail = supabase.from('outbox_emails').delete().ilike('subject', pattern(id))
  const [e, n, m] = await Promise.all([each, notif, mail])
  if (e.error) { handleError(e.error); return false }
  if (n.error) handleError(n.error)
  if (m.error) handleError(m.error)
  return true
}

export async function deleteAmcDb(id: string): Promise<boolean> {
  if (!supabase) return false
  const pattern = (value: string) => `%${value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  const unlink = supabase.from('payments').update({ amc_id: '' }).eq('amc_id', id)
  const each = supabase.from('amcs').delete().eq('id', id)
  const notif = supabase.from('notifications').delete().ilike('link', pattern(`/amc-contracts/${id}`))
  const mail = supabase.from('outbox_emails').delete().ilike('subject', pattern(id))
  const [u, e, n, m] = await Promise.all([unlink, each, notif, mail])
  if (e.error) { handleError(e.error); return false }
  if (u.error) handleError(u.error)
  if (n.error) handleError(n.error)
  if (m.error) handleError(m.error)
  return true
}

export async function updateEmailDb(e: EmailRecord): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('outbox_emails').upsert(emailToRow(e), { onConflict: 'id' })
  if (error) {
    handleError(error)
    return false
  }
  return true
}

export async function deleteEmailDb(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('outbox_emails').delete().eq('id', id)
  if (error) {
    handleError(error)
    return false
  }
  return true
}

export async function deleteCallDb(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('outbox_calls').delete().eq('id', id)
  if (error) {
    handleError(error)
    return false
  }
  return true
}

interface RetentionRow {
  id: string
  customer_id: string
  primary_risk: string
  recommended_action: string
  steps: unknown
  reason: string
  priority: number
  status: string
  owner: string
  revenue_at_risk: number
  requires_approval: boolean
  renewal_offer?: unknown
}

function retentionToRow(r: RetentionAction): RetentionRow {
  return {
    id: r.id,
    customer_id: r.customerId,
    primary_risk: r.primaryRisk,
    recommended_action: r.recommendedAction,
    steps: r.steps,
    reason: r.reason,
    priority: r.priority,
    status: r.status,
    owner: r.owner,
    revenue_at_risk: r.revenueAtRisk,
    requires_approval: r.requiresApproval,
    renewal_offer: r.renewalOffer ?? null,
  }
}

function retentionFromRow(r: RetentionRow): RetentionAction {
  return {
    id: r.id,
    customerId: r.customer_id,
    primaryRisk: r.primary_risk as RetentionAction['primaryRisk'],
    recommendedAction: r.recommended_action,
    steps: Array.isArray(r.steps) ? (r.steps as string[]) : [],
    reason: r.reason,
    priority: r.priority,
    status: r.status as RetentionAction['status'],
    owner: r.owner,
    revenueAtRisk: Number(r.revenue_at_risk),
    requiresApproval: r.requires_approval,
    renewalOffer: r.renewal_offer && typeof r.renewal_offer === 'object' ? r.renewal_offer as RetentionAction['renewalOffer'] : undefined,
  }
}

export interface HydratedData {
  customers: Customer[]
  assets: EquipmentAsset[]
  amcs: AMCContract[]
  services: ServiceRecord[]
  complaints: Complaint[]
  payments: Payment[]
  notifications: Notification[]
  emails: EmailRecord[]
  calls: CallRecord[]
  messages: ComplaintMessage[]
  retention: RetentionAction[]
  accounts: AuthAccount[]
  /**
   * Collections that could not be read on this attempt, because their table is
   * not migrated yet. They come back as an empty list, which is indistinguishable
   * from "genuinely no rows" — so the caller must NOT treat their emptiness as
   * deletion. For example a transient failure on `assets` would otherwise wipe
   * the equipment register off the screen.
   */
  incomplete: ReadonlyArray<keyof Omit<HydratedData, 'incomplete'>>
}

export function handleError(err: unknown): void {
  // Not DEV-only. Every write path in the app calls this and then discards the
  // result (`void updateCallDb(...)`), so a rejected insert had no consequence
  // the app could see and no trace in production: assigning a complaint would
  // persist the assignment, silently fail to queue the technician's AI call,
  // and look like a working feature that just never notified anybody.
  console.error('[supabase]', err)
}

export async function hydrateAll(): Promise<HydratedData | null> {
  if (!supabase) return null
  try {
    // A single unreadable table must not blank the whole app.
    //
    // This used to return null if *any* of the nine core queries failed, and
    // every caller treats null as "leave the screen exactly as it is". So one
    // revoked policy, one unapplied migration or one renamed column turned
    // every admin screen into an empty list — and because `handleError` only
    // logs in DEV, production showed nothing at all. It looked identical to
    // "the data is gone", including complaints and their technician dropdowns.
    //
    // Each table is now collected independently: a failure is reported through
    // `incomplete` (surfaced in the UI) and that collection reads as empty,
    // while every table that did load is still returned.
    const incomplete: Array<keyof Omit<HydratedData, 'incomplete'>> = []
    const collect = <T>(res: { data: T[] | null; error: { message?: string } | null }, key: keyof Omit<HydratedData, 'incomplete'>, label: string): T[] => {
      if (res.error) {
        incomplete.push(key)
        // Deliberately not DEV-only: a silent empty table in production is the
        // exact failure this is here to make visible.
        console.error(`[supabase] ${label} unreadable:`, res.error.message ?? res.error)
        return []
      }
      return res.data ?? []
    }

    const [customers, amcs, services, complaints, payments, notifications, emails, retention, profiles] = await Promise.all([
      supabase.from('customers').select('*').order('id'),
      supabase.from('amcs').select('*'),
      supabase.from('services').select('*'),
      supabase.from('complaints').select('*'),
      supabase.from('payments').select('*'),
      supabase.from('notifications').select('*'),
      supabase.from('outbox_emails').select('*'),
      supabase.from('retention_actions').select('*'),
      supabase.from('profiles').select('*'),
    ])

    // Only give up when nothing at all could be read — that is a real session
    // or connectivity problem, and returning null keeps the last good screen
    // instead of replacing it with a page of empty lists.
    const coreQueries = [customers, amcs, services, complaints, payments, notifications, emails, retention, profiles] as Array<{ data: unknown[] | null; error: { message?: string } | null }>
    if (coreQueries.every((q) => q.error)) {
      handleError(coreQueries.find((q) => q.error)?.error)
      return null
    }

    let calls: CallRecord[] = []
    try {
      const { data: callRows, error: callsErr } = await supabase.from('outbox_calls').select('*')
      if (!callsErr) calls = (callRows ?? []).map(callFromRow)
      else {
        incomplete.push('calls')
        if (import.meta.env.DEV) console.warn('[supabase] outbox_calls unavailable:', callsErr.message)
      }
    } catch (err) {
      incomplete.push('calls')
      handleError(err)
    }
    // Machines are fetched defensively for the same reason: until the assets
    // migration is applied the table does not exist, and the rest of the app
    // must still boot with an empty equipment list.
    let assets: EquipmentAsset[] = []
    try {
      const { data: assetRows, error: assetsErr } = await supabase.from('assets').select('*').order('id')
      if (!assetsErr) assets = (assetRows ?? []).map(assetFromRow)
      else {
        incomplete.push('assets')
        if (import.meta.env.DEV) console.warn('[supabase] assets unavailable:', assetsErr.message)
      }
    } catch (err) {
      incomplete.push('assets')
      handleError(err)
    }
    // The complaint chat is fetched the same safe way — if the migration
    // hasn't run yet, the app still boots and the chat just shows empty.
    let messages: ComplaintMessage[] = []
    try {
      const { data: messageRows, error: messagesErr } = await supabase.from('complaint_messages').select('*').order('created_at')
      if (!messagesErr) messages = (messageRows ?? []).map(messageFromRow)
      else {
        incomplete.push('messages')
        if (import.meta.env.DEV) console.warn('[supabase] complaint_messages unavailable:', messagesErr.message)
      }
    } catch (err) {
      incomplete.push('messages')
      handleError(err)
    }
    return {
      customers: collect(customers, 'customers', 'customers').map(customerFromRow),
      assets,
      amcs: collect(amcs, 'amcs', 'amcs').map(amcFromRow),
      services: collect(services, 'services', 'services').map(serviceFromRow),
      complaints: collect(complaints, 'complaints', 'complaints').map(complaintFromRow),
      payments: collect(payments, 'payments', 'payments').map(paymentFromRow),
      notifications: collect(notifications, 'notifications', 'notifications').map(notificationFromRow),
      emails: collect(emails, 'emails', 'outbox_emails').map(emailFromRow),
      calls,
      messages,
      retention: collect(retention, 'retention', 'retention_actions').map(retentionFromRow),
      accounts: collect(profiles, 'accounts', 'profiles').map(profileToAccount),
      incomplete,
    }
  } catch (err) {
    handleError(err)
    return null
  }
}

export async function persistAll(data: Omit<HydratedData, 'calls' | 'emails' | 'complaints' | 'notifications' | 'messages' | 'amcs' | 'services' | 'assets' | 'incomplete'>): Promise<void> {
  if (!supabase) return
  try {
    const results = await Promise.all([
      supabase.from('customers').upsert(data.customers.map(customerToRow), { onConflict: 'id' }),
      supabase.from('payments').upsert(data.payments.map(paymentToRow), { onConflict: 'id' }),
      // Call, email, complaint and notification rows are intentionally NOT part
      // of this bulk write. Calls/emails persist only through single-row
      // upserts and deletes; complaints/notifications persist only through
      // updateComplaintDb/updateNotificationDb and their deletes. AMC rows work
      // the same way through upsertAmcDb/deleteAmcDb, and service rows through
      // upsertServiceDb — that one matters most for satisfaction, because a bulk
      // write from a tab that has not yet seen a customer's star rating would
      // push the stale null straight back over it. Asset rows work the same way
      // through upsertAssetDb/deleteAssetDb. A tab holding stale local
      // copies can therefore never resurrect a row that was just answered,
      // sent, delivered, resolved, rated, or deleted by another tab.
      supabase.from('retention_actions').upsert(data.retention.map(retentionToRow), { onConflict: 'id' }),
    ])
    for (const r of results) {
      if (r.error) handleError(r.error)
    }
  } catch (err) {
    handleError(err)
  }
}

export async function resetData(): Promise<boolean> {
  if (!supabase) return false
  try {
    // assets before customers: assets.customer_id is a bare text column with no
    // foreign key, so nothing cascades it and clearing customers alone would
    // leave orphaned machines behind.
    const tables = ['retention_actions', 'outbox_emails', 'outbox_calls', 'notifications', 'complaint_messages', 'payments', 'complaints', 'services', 'amcs', 'assets', 'customers', 'profiles'] as const
    for (const t of tables) {
      const { error } = await supabase.from(t).delete().neq('id', '__no_rows__')
      if (error && !error.message.includes('does not exist')) handleError(error)
    }
    return true
  } catch (err) {
    handleError(err)
    return false
  }
}

// ------------------------------------------------------------------
// Checkout / realtime helpers for the fake cross-device payment flow.
//
// A UPI "Pay Now" flow assigns each pending payment a random
// reference_id and renders a scannable QR that opens the public
// /pay/:referenceId page on the customer's phone. That page calls
// pay_complete() (a security-definer Postgres function) which flips the
// row to Paid. Every open tab subscribes to Postgres Changes on the
// payments table, so the portal and the admin dashboard update live.
// ------------------------------------------------------------------

export async function setPaymentReference(id: string, referenceId: string): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.from('payments').update({ reference_id: referenceId }).eq('id', id).select('id')
  if (error) {
    handleError(error)
    return false
  }
  return (data?.length ?? 0) > 0
}

export async function fetchPaymentByReference(referenceId: string): Promise<Payment | null> {
  if (!supabase) return null
  // Uses the security-definer get_payment_by_reference() RPC instead of a
  // direct SELECT so unauthenticated visitors can never enumerate the whole
  // payments table — they can only read the exact row their QR references.
  const { data, error } = await supabase.rpc('get_payment_by_reference', { p_ref: referenceId }).maybeSingle()
  if (error || !data) {
    if (error) handleError(error)
    return null
  }
  return paymentFromRow(data as unknown as PaymentRow)
}

// Revert a mistakenly-sent payment request: deletes the payment row plus the
// matching customer notification and outbox email so a reload can't resurrect
// them (the upsert persist layer never removes rows on its own).
export async function revertPaymentRows(id: string, invoice: string): Promise<void> {
  if (!supabase) return
  const payment = supabase.from('payments').delete().eq('id', id)
  const { data: notif } = await supabase.from('notifications').select('id').ilike('title', `%${invoice}%`)
  const { data: mail } = await supabase.from('outbox_emails').select('id').ilike('subject', `%${invoice}%`)
  const notifDel = notif?.length ? supabase.from('notifications').delete().in('id', notif.map((n) => n.id)) : Promise.resolve({ error: null })
  const mailDel = mail?.length ? supabase.from('outbox_emails').delete().in('id', mail.map((e) => e.id)) : Promise.resolve({ error: null })
  const [p, n, e] = await Promise.all([payment, notifDel, mailDel])
  if (p.error) handleError(p.error)
  if (n.error) handleError(n.error)
  if (e.error) handleError(e.error)
}

export async function updateProfileRows(id: string, updates: { email?: string; status?: string; note?: string; approved_at?: string; customer_id?: string; technician_id?: string; service_types?: string[] }): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.from('profiles').update(updates).eq('id', id).select('id')
  if (error) { handleError(error); return false }
  return (data?.length ?? 0) > 0
}

export async function deleteAccountRows(id: string, customerId?: string, email?: string): Promise<void> {
  if (!supabase) return
  await supabase.from('profiles').delete().eq('id', id)
  if (customerId) {
    // Delete customer notifications too — the accounts delete path previously
    // left them behind (the customer delete path did this), so orphaned rows
    // reappeared on the Notifications page after every reload.
    const notif = supabase.from('notifications').delete().eq('customer_id', customerId)
    const customer = supabase.from('customers').delete().eq('id', customerId)
    const [n, c] = await Promise.all([notif, customer])
    if (n.error) handleError(n.error)
    if (c.error) handleError(c.error)
  }
  if (email) {
    const { data: mail } = await supabase.from('outbox_emails').select('id').eq('to_email', email)
    if (mail?.length) {
      const { error } = await supabase.from('outbox_emails').delete().in('id', mail.map((e) => e.id))
      if (error) handleError(error)
    }
  }
}

// Delete a customer record and everything tied to it. amcs/services/
// complaints/payments/retention_actions cascade with the customer row; the
// customer's notifications, outbox emails and signup profile (if any) have no
// FK and are removed explicitly so nothing survives a reload.
export async function deleteCustomerRows(customerId: string, email?: string): Promise<void> {
  if (!supabase) return
  const notif = supabase.from('notifications').delete().eq('customer_id', customerId)
  const mail = email ? supabase.from('outbox_emails').delete().eq('to_email', email.toLowerCase()) : Promise.resolve({ error: null })
  const profile = supabase.from('profiles').delete().eq('customer_id', customerId)
  const customer = supabase.from('customers').delete().eq('id', customerId)
  const [n, m, p, c] = await Promise.all([notif, mail, profile, customer])
  if (n.error) handleError(n.error)
  if (m.error) handleError(m.error)
  if (p.error) handleError(p.error)
  if (c.error) handleError(c.error)
}

export async function completePayment(referenceId: string, method: PaymentMethod): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('pay_complete', { p_ref: referenceId, p_method: method })
  if (error) handleError(error)
  return !error
}

export function subscribePayments(onChange: (payment: Payment) => void): () => void {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('payments-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'payments' },
      (payload) => {
        const row = payload.new as PaymentRow | undefined
        if (row) onChange(paymentFromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'payments' },
      (payload) => {
        const row = payload.new as PaymentRow | undefined
        if (row) onChange(paymentFromRow(row))
      },
    )
    .subscribe()
  return () => {
    void supabase!.removeChannel(channel)
  }
}

export type ComplaintChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

export function subscribeComplaints(onChange: (event: ComplaintChangeEvent, complaint: Complaint) => void): () => void {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('complaints-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'complaints' },
      (payload) => {
        const row = payload.new as ComplaintRow | undefined
        if (row) onChange('INSERT', complaintFromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'complaints' },
      (payload) => {
        const row = payload.new as ComplaintRow | undefined
        if (row) onChange('UPDATE', complaintFromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'complaints' },
      (payload) => {
        const row = payload.old as ComplaintRow | undefined
        if (row) onChange('DELETE', complaintFromRow(row))
      },
    )
    .subscribe()
  return () => {
    void supabase!.removeChannel(channel)
  }
}

export type NotificationChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

export function subscribeNotifications(onChange: (event: NotificationChangeEvent, notification: Notification) => void): () => void {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('notifications-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      (payload) => {
        const row = payload.new as NotificationRow | undefined
        if (row) onChange('INSERT', notificationFromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications' },
      (payload) => {
        const row = payload.new as NotificationRow | undefined
        if (row) onChange('UPDATE', notificationFromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'notifications' },
      (payload) => {
        const row = payload.old as NotificationRow | undefined
        if (row) onChange('DELETE', notificationFromRow(row))
      },
    )
    .subscribe()
  return () => {
    void supabase!.removeChannel(channel)
  }
}

export function subscribeEmails(onChange: (event: NotificationChangeEvent, email: EmailRecord) => void): () => void {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('outbox-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'outbox_emails' },
      (payload) => {
        const row = payload.new as EmailRow | undefined
        if (row) onChange('INSERT', emailFromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'outbox_emails' },
      (payload) => {
        const row = payload.new as EmailRow | undefined
        if (row) onChange('UPDATE', emailFromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'outbox_emails' },
      (payload) => {
        const row = payload.old as EmailRow | undefined
        if (row?.id) onChange('DELETE', emailFromRow(row))
      },
    )
    .subscribe()
  return () => {
    void supabase!.removeChannel(channel)
  }
}

export function subscribeCalls(onChange: (event: NotificationChangeEvent, call: CallRecord) => void): () => void {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('calls-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'outbox_calls' },
      (payload) => {
        const row = payload.new as CallRow | undefined
        if (row) onChange('INSERT', callFromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'outbox_calls' },
      (payload) => {
        const row = payload.new as CallRow | undefined
        if (row) onChange('UPDATE', callFromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'outbox_calls' },
      (payload) => {
        const row = payload.old as CallRow | undefined
        if (row?.id) onChange('DELETE', callFromRow(row))
      },
    )
    .subscribe()
  return () => {
    void supabase!.removeChannel(channel)
  }
}

export type ServiceChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

/**
 * Live service updates, so a visit booked by one person shows up on the
 * dispatch board without anyone refreshing.
 *
 * This is an accelerator, not the source of truth. If the socket never connects
 * the app still works, because the store keeps its existing poll running; a
 * dispatch board that goes blank when a websocket drops would be worse than one
 * that updates a few seconds late.
 */
export function subscribeServices(onChange: (event: ServiceChangeEvent, service: ServiceRecord) => void): () => void {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('services-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'services' },
      (payload) => {
        const row = payload.new as ServiceRow | undefined
        if (row) onChange('INSERT', serviceFromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'services' },
      (payload) => {
        const row = payload.new as ServiceRow | undefined
        if (row) onChange('UPDATE', serviceFromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'services' },
      (payload) => {
        const row = payload.old as ServiceRow | undefined
        if (row?.id) onChange('DELETE', serviceFromRow(row))
      },
    )
    .subscribe()
  return () => {
    void supabase!.removeChannel(channel)
  }
}

export type AccountChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

export function subscribeAccounts(onChange: (event: AccountChangeEvent, account: AuthAccount) => void): () => void {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('accounts-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'profiles' },
      (payload) => {
        const row = payload.new as ProfileRow | undefined
        if (row) onChange('INSERT', profileToAccount(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles' },
      (payload) => {
        const row = payload.new as ProfileRow | undefined
        if (row) onChange('UPDATE', profileToAccount(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'profiles' },
      (payload) => {
        const row = payload.old as ProfileRow | undefined
        if (row) onChange('DELETE', profileToAccount(row))
      },
    )
    .subscribe()
  return () => {
    void supabase!.removeChannel(channel)
  }
}

export type MessageChangeEvent = 'INSERT' | 'DELETE'

// Live complaint chat: anyone subscribed (admin, customer portal, tech portal)
// receives a new message row as soon as it lands, so all open tabs update the
// thread in real time. DELETE only exists so a complaint delete cascades.
export function subscribeMessages(onChange: (event: MessageChangeEvent, message: ComplaintMessage) => void): () => void {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('complaint-chat-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'complaint_messages' },
      (payload) => {
        const row = payload.new as ComplaintMessageRow | undefined
        if (row) onChange('INSERT', messageFromRow(row))
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'complaint_messages' },
      (payload) => {
        const row = payload.old as ComplaintMessageRow | undefined
        if (row?.id) onChange('DELETE', messageFromRow(row))
      },
    )
    .subscribe()
  return () => {
    void supabase!.removeChannel(channel)
  }
}
