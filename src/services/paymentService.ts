import type { Payment } from '../types'
import { paymentsData as seed } from '../data/payments'
import { get, post } from './api'

let store: Payment[] = [...seed]

export function currentPayments(): Payment[] {
  return store
}

export async function fetchPayments(): Promise<Payment[]> {
  return get('/payments', store)
}

export function addPayment(input: Omit<Payment, 'id'>): Promise<Payment> {
  const created: Payment = { ...input, id: `PAY-${Date.now()}` }
  store = [created, ...store]
  return post('/payments', input, created)
}

export function recordPayment(id: string, updates: Partial<Payment>): Payment {
  store = store.map((p) => (p.id === id ? { ...p, ...updates } : p))
  const updated = store.find((p) => p.id === id)
  if (!updated) throw new Error('Payment not found')
  return updated
}