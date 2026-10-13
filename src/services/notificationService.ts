import type { Notification } from '../types'
import { notificationsData as seed } from '../data/notifications'
import { get } from './api'

let store: Notification[] = [...seed]

export function currentNotifications(): Notification[] {
  return store
}

export async function fetchNotifications(): Promise<Notification[]> {
  return get('/notifications', store)
}

export function markAsRead(id: string): Notification[] {
  store = store.map((n) => (n.id === id ? { ...n, read: true } : n))
  return store
}

export function markAllRead(): Notification[] {
  store = store.map((n) => ({ ...n, read: true }))
  return store
}