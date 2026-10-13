/**
 * Proof-of-work persistence: photo evidence, parts and sign-off.
 *
 * Split out of services/supabase.ts because this is the only part of the app
 * that puts bytes in Supabase Storage rather than rows in Postgres, and the
 * failure modes are different enough to be worth their own file.
 */
import { supabase, isSupabaseConfigured, handleError } from './supabase'
import type { JobAttachment, JobPart, JobSignature, AttachmentKind } from '../types'

export const EVIDENCE_BUCKET = 'job-evidence'

/**
 * The instruction printed when a write fails because migration 003 has not
 * been applied. Without it the error is a bare 400 from PostgREST and the
 * obvious conclusion — that the photo is too large, or the bucket is
 * misconfigured — is wrong.
 */
const PROOF_OF_WORK_MIGRATION =
  'phase 3: apply supabase/migrations/003-proof-of-work.sql (job_attachments, job_parts, job_signatures, and the job-evidence bucket)'

// Postgres numeric comes back over JSON as a string so large values keep their
// precision. Everywhere else in this app money is a number, so it is coerced
// here rather than leaking string maths into components.
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(n) ? n : 0
}

// ------------------------------------------------------------------
// Uploads
// ------------------------------------------------------------------

/**
 * Unguessable object name. A random component is the only thing keeping a
 * public bucket's contents from being guessable, so this deliberately does not
 * encode the visit id, the customer name, or the date.
 */
function objectName(serviceId: string, extension: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  return `${serviceId}/${rand}.${extension}`
}

/**
 * How long a minted display URL stays valid.
 *
 * Long enough that a visit's evidence keeps rendering while somebody is actually
 * looking at it, short enough that a link forwarded out of the app stops working
 * rather than becoming a durable public URL. The panel re-signs on an image load
 * failure, so a tab left open past this point recovers on its own.
 */
const SIGNED_URL_TTL = 60 * 60

/**
 * A temporary, authorised URL for one object in the private evidence bucket.
 *
 * Returns '' rather than a broken URL on failure, so a denied or expired object
 * renders as a missing image instead of an error icon per photo. Failures are
 * not logged loudly: a customer who should not see a photo is a policy decision
 * working correctly, not an error.
 */
async function signedUrl(storagePath: string): Promise<string> {
  if (!supabase || !storagePath) return ''
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL)
  if (error) {
    if (!/not found|does not exist|Signature|403|404/i.test(error.message)) handleError(error)
    return ''
  }
  return data.signedUrl ?? ''
}

/** Picks an extension from the real MIME type; never trusts the filename. */
function extensionFor(file: File): string {
  const type = file.type.toLowerCase()
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg'
  if (type === 'image/webp') return 'webp'
  if (type === 'image/gif') return 'gif'
  // An unrecognised type is stored as PNG rather than passed through, so a
  // device that mislabels a file cannot write something with an executable
  // extension into a bucket the browser will later render.
  return 'png'
}

/**
 * Rejects images the camera app on a cheap phone routinely produces.
 *
 * The limit is 8MB because that is PostgREST's default statement timeout
 * ceiling, not because 8MB is a sensible photo. Rejecting up front beats
 * letting the upload die halfway and leaving a row pointing at an object that
 * was never written.
 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export type UploadResult<T> = { ok: true; value: T } | { ok: false; message: string }

export async function uploadPhoto(
  serviceId: string,
  file: File,
  opts: { caption?: string; takenBy?: string } = {},
): Promise<UploadResult<JobAttachment>> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, message: 'Database is not configured.' }
  if (!file.type.startsWith('image/')) return { ok: false, message: 'That file is not an image.' }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: `Photo is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 8MB.` }
  }

  const path = objectName(serviceId, extensionFor(file))
  const { error: upErr } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (upErr) {
    // A missing bucket and a missing table both surface as a 4xx from
    // PostgREST/Storage with unhelpful text, so both are reported as the
    // migration they are.
    if (/bucket|not found|404/i.test(upErr.message) || upErr.status === 404) {
      handleError(upErr)
      return { ok: false, message: PROOF_OF_WORK_MIGRATION }
    }
    handleError(upErr)
    return { ok: false, message: upErr.message }
  }

  const row = {
    id: `ATT${Date.now()}${Math.floor(Math.random() * 1000)}`,
    service_id: serviceId,
    kind: 'photo' as AttachmentKind,
    storage_path: path,
    caption: opts.caption ?? '',
    taken_by: opts.takenBy ?? '',
    created_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('job_attachments').insert(row).select().single()
  if (error) {
    // The image is in the bucket but the index row is not, so the file is now
    // unreachable garbage. Roll it back rather than leaking storage.
    void supabase.storage.from(EVIDENCE_BUCKET).remove([path])
    handleError(error)
    if (/does not exist|PGRST|42703/i.test(`${error.code ?? ''} ${error.message}`)) {
      return { ok: false, message: PROOF_OF_WORK_MIGRATION }
    }
    return { ok: false, message: error.message }
  }
  return { ok: true, value: attachmentFromRow(data) }
}

export async function uploadSignature(
  serviceId: string,
  blob: Blob,
  signedBy: string,
  roleNote: string,
): Promise<UploadResult<JobSignature>> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, message: 'Database is not configured.' }
  const name = signedBy.trim()
  if (!name) return { ok: false, message: 'A name is required for a sign-off.' }

  const path = objectName(serviceId, 'png')
  const { error: upErr } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, blob, { contentType: 'image/png', upsert: false })
  if (upErr) {
    handleError(upErr)
    if (/bucket|not found|404/i.test(upErr.message) || upErr.status === 404) {
      return { ok: false, message: PROOF_OF_WORK_MIGRATION }
    }
    return { ok: false, message: upErr.message }
  }

  // One signature per visit, so a customer correcting a spelling replaces the
  // old one instead of leaving two contradictory records.
  const { data, error } = await supabase
    .from('job_signatures')
    .upsert(
      {
        id: `SIG${Date.now()}`,
        service_id: serviceId,
        storage_path: path,
        signed_by: name,
        role_note: roleNote.trim(),
        created_at: new Date().toISOString(),
      },
      { onConflict: 'service_id' },
    )
    .select()
    .single()
  if (error) {
    void supabase.storage.from(EVIDENCE_BUCKET).remove([path])
    handleError(error)
    if (/does not exist|PGRST|42703/i.test(`${error.code ?? ''} ${error.message}`)) {
      return { ok: false, message: PROOF_OF_WORK_MIGRATION }
    }
    return { ok: false, message: error.message }
  }
  return { ok: true, value: signatureFromRow(data) }
}

export async function deleteAttachment(id: string, storagePath: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('job_attachments').delete().eq('id', id)
  if (error) {
    handleError(error)
    return false
  }
  // Row first, then object. A stray object in the bucket costs storage; a row
  // pointing at a deleted object renders a broken image in the customer's
  // portal, which is worse.
  if (storagePath) void supabase.storage.from(EVIDENCE_BUCKET).remove([storagePath])
  return true
}

export async function deleteServiceEvidence(serviceId: string): Promise<void> {
  if (!supabase) return
  const [attachments, signature] = await Promise.all([
    supabase.from('job_attachments').select('storage_path').eq('service_id', serviceId),
    supabase.from('job_signatures').select('storage_path').eq('service_id', serviceId),
  ])
  const paths = [
    ...(attachments.data ?? []).map((r) => r.storage_path as string),
    ...(signature.data ?? []).map((r) => r.storage_path as string),
  ].filter(Boolean)
  await Promise.all([
    supabase.from('job_attachments').delete().eq('service_id', serviceId),
    supabase.from('job_signatures').delete().eq('service_id', serviceId),
    supabase.from('job_parts').delete().eq('service_id', serviceId),
  ])
  if (paths.length) await supabase.storage.from(EVIDENCE_BUCKET).remove(paths)
}

// ------------------------------------------------------------------
// Parts
// ------------------------------------------------------------------

export async function addPartDb(part: JobPart): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('job_parts').upsert({
    id: part.id,
    service_id: part.serviceId,
    name: part.name,
    quantity: part.quantity,
    unit_price: part.unitPrice,
    cost_price: part.costPrice,
    serial_no: part.serialNo,
    created_at: part.createdAt,
  }, { onConflict: 'id' })
  if (error) {
    handleError(error)
    return false
  }
  return true
}

export async function deletePartDb(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('job_parts').delete().eq('id', id)
  if (error) {
    handleError(error)
    return false
  }
  return true
}

// ------------------------------------------------------------------
// Read
// ------------------------------------------------------------------

interface AttachmentRow {
  id: string
  service_id: string
  kind: string
  storage_path: string
  caption: string | null
  taken_by: string | null
  created_at: string
}

interface PartRow {
  id: string
  service_id: string
  name: string
  quantity: number | string | null
  unit_price: number | string | null
  cost_price: number | string | null
  serial_no: string | null
  created_at: string
}

interface SignatureRow {
  id: string
  service_id: string
  storage_path: string
  signed_by: string
  role_note: string | null
  created_at: string
}

function attachmentFromRow(r: AttachmentRow): JobAttachment {
  return {
    id: r.id,
    serviceId: r.service_id,
    kind: r.kind as AttachmentKind,
    storagePath: r.storage_path,
    url: '',
    caption: r.caption ?? '',
    takenBy: r.taken_by ?? '',
    createdAt: r.created_at,
  }
}

function partFromRow(r: PartRow): JobPart {
  return {
    id: r.id,
    serviceId: r.service_id,
    name: r.name,
    quantity: num(r.quantity),
    unitPrice: num(r.unit_price),
    costPrice: num(r.cost_price),
    serialNo: r.serial_no ?? '',
    createdAt: r.created_at,
  }
}

function signatureFromRow(r: SignatureRow): JobSignature {
  return {
    id: r.id,
    serviceId: r.service_id,
    storagePath: r.storage_path,
    url: '',
    signedBy: r.signed_by,
    roleNote: r.role_note ?? '',
    createdAt: r.created_at,
  }
}

export interface Evidence {
  attachments: JobAttachment[]
  parts: JobPart[]
  signature: JobSignature | null
}

/**
 * Every proof-of-work row for one visit, in one call.
 *
 * Tolerates a database without migration 003 applied: the tables 404, and the
 * visit still renders with an honest "nothing recorded yet" rather than an
 * error. That matters because an existing deployment will open this page
 * before the migration is pasted in.
 */
export async function loadEvidence(serviceId: string): Promise<Evidence> {
  const empty: Evidence = { attachments: [], parts: [], signature: null }
  if (!isSupabaseConfigured() || !supabase) return empty
  const [attachments, parts, signature] = await Promise.all([
    supabase.from('job_attachments').select('*').eq('service_id', serviceId).order('created_at'),
    supabase.from('job_parts').select('*').eq('service_id', serviceId).order('created_at'),
    supabase.from('job_signatures').select('*').eq('service_id', serviceId).maybeSingle(),
  ])
  for (const r of [attachments, parts, signature]) {
    // Missing table is an unapplied migration and is handled by the empty
    // return below; anything else is worth logging. A failed query has no
    // `.error` to read at all, which is why the type needs widening here.
    if (r.error && !/does not exist|PGRST|42P01/i.test(`${(r.error as { code?: string }).code ?? ''} ${r.error.message}`)) handleError(r.error)
  }
  const out: Evidence = {
    attachments: (attachments.data ?? []).map((r) => attachmentFromRow(r as AttachmentRow)),
    parts: (parts.data ?? []).map((r) => partFromRow(r as PartRow)),
    signature: signature.data ? signatureFromRow(signature.data as SignatureRow) : null,
  }
  // The bucket is private, so the object name alone renders nothing. One signed
  // URL per object, minted here rather than in the component, so the admin
  // page, the technician job page and the customer portal all get working
  // images without each of them owning an async loading state of its own.
  //
  // createSignedUrl is a network round trip per object and these are issued
  // under the caller's own token, so the storage read policy is what decides
  // whether a given photo is returned at all: staff see everything, a customer
  // sees only their own visits, and a signed-out visitor gets nothing.
  const paths = [
    ...out.attachments.map((a) => a.storagePath),
    ...(out.signature ? [out.signature.storagePath] : []),
  ]
  const signed = await Promise.all(paths.map(signedUrl))
  out.attachments.forEach((a, i) => {
    a.url = signed[i] ?? ''
  })
  if (out.signature) {
    out.signature.url = signed[out.attachments.length] ?? ''
  }
  return out
}

export { PROOF_OF_WORK_MIGRATION }
