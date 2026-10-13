// Geolocation, distance and on-site duration helpers — no external API keys.
// Customer addresses are geocoded through the free OpenStreetMap Nominatim
// service and cached for the session; the browser provides the live position.

export interface GeoPoint {
  lat: number
  lng: number
}

const geocodeCache = new Map<string, GeoPoint>()

export function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

// Opens turn-by-turn directions to a saved pin in Google Maps (keyless web
// link). The customer's lat/lng is the destination so the technician never
// has to type an address.
export function navigateUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`
}

const reverseCache = new Map<string, string>()

// Reverse geocode a point into a human-readable address via OpenStreetMap
// Nominatim (keyless). Returns null when it fails so callers can show the
// raw coordinates instead of blocking the flow.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat},${lng}`
  const cached = reverseCache.get(key)
  if (cached) return cached
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&zoom=18`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { display_name?: string }
    if (!data || typeof data.display_name !== 'string') return null
    reverseCache.set(key, data.display_name)
    return data.display_name
  } catch {
    return null
  }
}

export async function geocode(query: string): Promise<GeoPoint | null> {
  const key = query.trim().toLowerCase()
  if (!key) return null
  const cached = geocodeCache.get(key)
  if (cached) return cached
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const rows = (await res.json()) as Array<{ lat: string; lon: string }>
    if (!Array.isArray(rows) || rows.length === 0) return null
    const hit = { lat: Number(rows[0].lat), lng: Number(rows[0].lon) }
    if (!Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) return null
    geocodeCache.set(key, hit)
    return hit
  } catch {
    return null
  }
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function distanceLabel(km: number): string {
  if (!Number.isFinite(km)) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

export function formatDuration(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—'
  const rounded = Math.max(0, Math.round(min))
  if (rounded < 60) return `${rounded} min`
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`
}

export function serviceDurationMin(s: { checkInAt?: string | null; checkOutAt?: string | null }): number | null {
  if (!s.checkInAt || !s.checkOutAt) return null
  const start = Date.parse(s.checkInAt)
  const end = Date.parse(s.checkOutAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return (end - start) / 60000
}

function diffMin(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (!Number.isFinite(ta) || !Number.isFinite(tb) || tb < ta) return null
  return (tb - ta) / 60000
}

// Hands-on work time for a complaint: work completed − work started.
export function complaintWorkMin(c: { workStartedAt?: string | null; workCompletedAt?: string | null }): number | null {
  return diffMin(c.workStartedAt, c.workCompletedAt)
}

// End-to-end complaint cycle time: work completed − assigned. Used for the
// admin "average time taken to complete a complaint" metric.
export function complaintCycleMin(c: { assignedAt?: string | null; workCompletedAt?: string | null }): number | null {
  return diffMin(c.assignedAt, c.workCompletedAt)
}

export function currentCoords(timeoutMs = 8000): Promise<GeoPoint | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    const done = (pos: GeolocationPosition | null) => {
      if (pos && Number.isFinite(pos.coords.latitude) && Number.isFinite(pos.coords.longitude)) {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      } else {
        resolve(null)
      }
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => done(pos),
      () => done(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    )
  })
}