import type { AuthAccount, Role, Session } from '../types'
import { CURRENT_USER } from '../constants'

const ADMIN_EMAIL = CURRENT_USER.email
const ADMIN_PASSWORD = 'admin123'

export const DEMO_TECHNICIANS = [] as const

export interface TechnicianAccount {
  name: string
  email: string
  password: string
}

export const technicianAccounts: TechnicianAccount[] = []

export const technicianByEmail = new Map(technicianAccounts.map((t) => [t.email, t]))

const technicianForService = new Map<string, string>()

export function assignTechnicianFor(serviceType: string): string {
  return technicianForService.get(serviceType) ?? ''
}

export function technicianEmail(name: string): string | undefined {
  return technicianAccounts.find((t) => t.name === name)?.email
}

export const seedAuthAccounts: AuthAccount[] = []

export const demoAccounts: Array<{ email: string; label: string; role: Role; password: string }> = [
  { email: ADMIN_EMAIL, label: 'Admin · Service Operations', role: 'admin', password: ADMIN_PASSWORD },
]

export type LoginOutcome =
  | { ok: true; session: Session; role: Role }
  | { ok: false; code: 'invalid' | 'pending' | 'rejected' | 'unknown'; message: string }

export function loginWithCredentials(
  email: string,
  password: string,
  accounts: AuthAccount[],
  expectedRole?: Role,
): LoginOutcome {
  const normalized = email.trim().toLowerCase()

  if (normalized === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
    if (expectedRole && expectedRole !== 'admin') {
      return { ok: false, code: 'invalid', message: `This account is registered as an Admin. Please select the Admin tab to log in.` }
    }
    return { ok: true, role: 'admin', session: { name: CURRENT_USER.name, email: CURRENT_USER.email, role: 'admin' } }
  }

  const account = accounts.find((a) => a.email.toLowerCase() === normalized)
  if (!account) {
    return { ok: false, code: 'unknown', message: 'No account found with this email. Create one below.' }
  }

  if (password !== account.password) {
    return { ok: false, code: 'invalid', message: 'Invalid email or password. Try the quick login buttons below.' }
  }

  if (expectedRole && (account.role as string) !== expectedRole) {
    const roleTitle = account.role === 'customer' ? 'Customer' : 'Technician'
    return { ok: false, code: 'invalid', message: `This account is registered as a ${roleTitle}. Please select the ${roleTitle} tab to log in.` }
  }

  if (account.status === 'pending') {
    return { ok: false, code: 'pending', message: 'Your account is awaiting admin approval. You will receive an email once approved.' }
  }

  if (account.status === 'rejected') {
    return { ok: false, code: 'rejected', message: 'Your signup was not approved.' + (account.note ? ` ${account.note}` : ' Please contact support.') }
  }

  if (account.role === 'customer') {
    return {
      ok: true,
      role: 'customer',
      session: { name: account.name, email: account.email, role: 'customer', customerId: account.customerId ?? account.id },
    }
  }
  return {
    ok: true,
    role: 'technician',
    session: { name: account.name, email: account.email, role: 'technician', technicianId: account.technicianId ?? account.name },
  }
}

export function asCustomer(customer: { id: string; name: string; email: string }): Session {
  return { name: customer.name, email: customer.email, role: 'customer', customerId: customer.id }
}

export function asAdmin(): Session {
  return { name: CURRENT_USER.name, email: CURRENT_USER.email, role: 'admin' }
}

export function asTechnician(name: string): Session | undefined {
  const account = technicianAccounts.find((t) => t.name === name)
  if (!account) return undefined
  return { name: account.name, email: account.email, role: 'technician', technicianId: account.name }
}

export function homeFor(role: Role): string {
  if (role === 'admin') return '/dashboard'
  if (role === 'technician') return '/tech'
  return '/portal'
}