import type { Complaint } from '../types'
import { complaintsData as seed } from '../data/complaints'
import { get, post } from './api'

let store: Complaint[] = [...seed]

export function currentComplaints(): Complaint[] {
  return store
}

export async function fetchComplaints(): Promise<Complaint[]> {
  return get('/complaints', store)
}

export async function fetchComplaint(id: string): Promise<Complaint> {
  const complaint = await get(`/complaints/${id}`, store.find((c) => c.id === id) as Complaint)
  if (!complaint) throw new Error('Complaint not found')
  return complaint
}

export function createComplaint(input: Omit<Complaint, 'id'>): Promise<Complaint> {
  const created: Complaint = { ...input, id: `CMP-${Date.now()}` }
  store = [created, ...store]
  return post('/complaints', input, created)
}

export function updateComplaint(id: string, updates: Partial<Complaint>): Complaint {
  store = store.map((c) => (c.id === id ? { ...c, ...updates } : c))
  const updated = store.find((c) => c.id === id)
  if (!updated) throw new Error('Complaint not found')
  return updated
}

export function fetchCustomerComplaints(customerId: string): Promise<Complaint[]> {
  return get(`/customers/${customerId}/complaints`, store.filter((c) => c.customerId === customerId))
}