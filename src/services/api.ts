const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  constructor(message = 'Unable to complete this action. Please try again.') {
    super(message)
    this.name = 'ApiError'
  }
}

export function delay<T>(data: T, ms = 450): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms))
}

export function delayError(ms = 450): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new ApiError()), ms))
}

export { API_BASE }

const TIMEOUT_MS = 10_000

async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function get<T>(path: string, fallback: T): Promise<T> {
  if (API_BASE) {
    const res = await fetchWithTimeout(`${API_BASE}${path}`)
    if (!res.ok) throw new ApiError()
    return (await res.json()) as T
  }
  return delay(fallback)
}

export async function post<TInput, TResponse>(path: string, _payload: TInput, fallback: TResponse): Promise<TResponse> {
  if (API_BASE) {
    const res = await fetchWithTimeout(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_payload),
    })
    if (!res.ok) throw new ApiError()
    return (await res.json()) as TResponse
  }
  return delay(fallback)
}