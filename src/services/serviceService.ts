import type { ServiceRecord } from '../types'
import { serviceRecords as seed } from '../data/services'
import { get, post } from './api'

let store: ServiceRecord[] = [...seed]

export function currentServices(): ServiceRecord[] {
  return store
}

export async function fetchServices(): Promise<ServiceRecord[]> {
  return get('/service-history', store)
}

export function fetchCustomerServices(customerId: string): Promise<ServiceRecord[]> {
  return get(`/customers/${customerId}/services`, store.filter((s) => s.customerId === customerId))
}

export function addService(input: Omit<ServiceRecord, 'id'>): Promise<ServiceRecord> {
  const created: ServiceRecord = { ...input, id: `SRV-${Date.now()}` }
  store = [created, ...store]
  return post('/service-history', input, created)
}