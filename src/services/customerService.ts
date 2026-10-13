import type { Customer } from '../types'
import { customers as seed } from '../data/customers'
import { get, post } from './api'

let store: Customer[] = [...seed]

export function currentCustomers(): Customer[] {
  return store
}

export async function fetchCustomers(): Promise<Customer[]> {
  return get('/customers', store)
}

export async function fetchCustomer(id: string): Promise<Customer> {
  const customer = await get(`/customers/${id}`, store.find((c) => c.id === id) as Customer)
  if (!customer) throw new Error('Customer not found')
  return customer
}

export function addCustomer(
  input: Omit<Customer, 'id' | 'health'>,
): Promise<Customer> {
  const created: Customer = {
    ...input,
    id: `C-${Date.now()}`,
    health: { score: 100, level: 'Healthy', factors: [] },
  }
  store = [created, ...store]
  return post('/customers', input, created)
}