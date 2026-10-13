import type { AuthAccount, ServiceTypeKey } from '../types'

// ------------------------------------------------------------------
// Auth service contract.
//
// n8n backend mapping (when VITE_API_BASE_URL is set, these calls map
// to real endpoints and accounts are persisted in PostgreSQL):
//   register -> POST  /auth/signup
//   login    -> POST  /auth/login        (returns JWT + session)
//   approve  -> POST  /accounts/:id/approve
//   reject   -> POST  /accounts/:id/reject
//   update   -> PATCH /accounts/:id
//   remove   -> DELETE /accounts/:id
//
// Until then, registrar and approval state live in memory and are
// mirrored into React state by AppStore. Signup is ALWAYS pending;
// only an admin's approval activates the account. Passwords are
// demo-only — the backend must hash with bcrypt.
// ------------------------------------------------------------------

export type RegisterRole = 'customer' | 'technician'

export interface RegisterInput {
  name: string
  email: string
  password: string
  role: RegisterRole
  company?: string
  serviceTypes?: ServiceTypeKey[]
  city?: string
}

export function nextAccountId(accounts: AuthAccount[]): string {
  const max = accounts.reduce((m, a) => Math.max(m, Number(a.id.split('-')[1]) || 0), 0)
  return `ACC-${max + 1}`
}

export function buildPendingAccount(input: RegisterInput, accounts: AuthAccount[]): AuthAccount {
  return {
    id: nextAccountId(accounts),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
    role: input.role,
    status: 'pending',
    company: input.company?.trim() || undefined,
    serviceTypes: input.role === 'customer' ? input.serviceTypes : undefined,
    city: input.city?.trim() || undefined,
    requestedAt: new Date().toISOString(),
  }
}

export function register(accounts: AuthAccount[], input: RegisterInput): AuthAccount[] {
  return [buildPendingAccount(input, accounts), ...accounts]
}

export function approve(
  accounts: AuthAccount[],
  id: string,
  meta: { customerId?: string; technicianId?: string },
): AuthAccount[] {
  return accounts.map((a) =>
    a.id === id
      ? {
          ...a,
          status: 'active' as const,
          customerId: meta.customerId ?? a.customerId,
          technicianId: meta.technicianId ?? a.technicianId,
          approvedAt: new Date().toISOString(),
        }
      : a,
  )
}

export function reject(accounts: AuthAccount[], id: string, note?: string): AuthAccount[] {
  return accounts.map((a) =>
    a.id === id ? { ...a, status: 'rejected' as const, note, approvedAt: new Date().toISOString() } : a,
  )
}

export function updateAccount(
  accounts: AuthAccount[],
  id: string,
  updates: { email?: string; password?: string },
): AuthAccount[] {
  return accounts.map((a) =>
    a.id === id ? { ...a, email: updates.email?.trim().toLowerCase() ?? a.email, password: updates.password ?? a.password } : a,
  )
}

export function removeAccount(accounts: AuthAccount[], id: string): AuthAccount[] {
  return accounts.filter((a) => a.id !== id)
}