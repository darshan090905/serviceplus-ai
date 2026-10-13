import { useSyncExternalStore } from 'react'

/**
 * Admin alert preferences. These used to be plain component state: every toggle
 * looked real, nothing read them, and a page refresh forgot all of it. They are
 * now the single source the dashboard's priority actions are built from, so
 * turning a toggle off genuinely removes the alert.
 */
export interface Prefs {
  amcExpiry: boolean
  highRisk: boolean
  paymentOverdue: boolean
  complaintEscalation: boolean
  weeklyReports: boolean
}

const STORAGE_KEY = 'servicepulse.prefs'

const defaults: Prefs = {
  amcExpiry: true,
  highRisk: true,
  paymentOverdue: true,
  complaintEscalation: true,
  weeklyReports: false,
}

function coerce(raw: unknown): Prefs {
  if (!raw || typeof raw !== 'object') return defaults
  const value = raw as Record<string, unknown>
  return {
    amcExpiry: typeof value.amcExpiry === 'boolean' ? value.amcExpiry : defaults.amcExpiry,
    highRisk: typeof value.highRisk === 'boolean' ? value.highRisk : defaults.highRisk,
    paymentOverdue: typeof value.paymentOverdue === 'boolean' ? value.paymentOverdue : defaults.paymentOverdue,
    complaintEscalation:
      typeof value.complaintEscalation === 'boolean' ? value.complaintEscalation : defaults.complaintEscalation,
    weeklyReports: typeof value.weeklyReports === 'boolean' ? value.weeklyReports : defaults.weeklyReports,
  }
}

function read(): Prefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? coerce(JSON.parse(raw)) : defaults
  } catch {
    return defaults
  }
}

let current: Prefs = typeof window === 'undefined' ? defaults : read()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function getPrefs(): Prefs {
  return current
}

export function savePrefs(next: Prefs): void {
  current = coerce(next)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // A blocked or full storage still leaves the in-memory value correct for
    // this session; the dashboard just forgets the choice on the next load.
  }
  emit()
}

export function resetPrefs(): void {
  savePrefs(defaults)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      current = read()
      emit()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs)
}

export { defaults as defaultPrefs }
