import type { RetentionAction, RetentionStatus } from '../types'
import { retentionActions as seed } from '../data/retention'
import { get, post } from './api'

let store: RetentionAction[] = [...seed]

export function currentRetentionActions(): RetentionAction[] {
  return store
}

export async function fetchRetention(): Promise<RetentionAction[]> {
  return get('/retention/recommendations', store)
}

export async function fetchRetentionAction(id: string): Promise<RetentionAction> {
  const action = await get(
    '/retention/recommendations',
    store.find((a) => a.id === id) as RetentionAction,
  )
  if (!action) throw new Error('Retention action not found')
  return action
}

export function updateRetentionActionStatus(id: string, status: RetentionStatus): Promise<void> {
  store = store.map((a) => (a.id === id ? { ...a, status } : a))
  return post('/retention/action', { id, status }, undefined)
}