import type { AMCContract } from '../types'
import { amcContracts as seed } from '../data/amcs'
import { get, post } from './api'

let store: AMCContract[] = [...seed]

export function currentAmcs(): AMCContract[] {
  return store
}

export async function fetchAmcs(): Promise<AMCContract[]> {
  return get('/amc-contracts', store)
}

export async function fetchAmc(id: string): Promise<AMCContract> {
  const amc = await get(`/amc-contracts/${id}`, store.find((c) => c.id === id) as AMCContract)
  if (!amc) throw new Error('AMC not found')
  return amc
}

export function addAmc(input: Omit<AMCContract, 'id'>): Promise<AMCContract> {
  const created: AMCContract = { ...input, id: `AMC-${Date.now()}` }
  store = [created, ...store]
  return post('/amc-contracts', input, created)
}