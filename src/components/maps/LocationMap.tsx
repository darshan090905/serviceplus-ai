import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Loader2, LocateFixed } from 'lucide-react'
import { currentCoords, type GeoPoint } from '../../utils/geo'

const PIN_SVG = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 24 36"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg>`

const pinIcon = (color = '#0284c7') =>
  L.divIcon({
    className: '',
    html: PIN_SVG(color),
    iconSize: [28, 38],
    iconAnchor: [14, 36],
  })

const MUMBAI: GeoPoint = { lat: 19.076, lng: 72.8777 }

interface LocationMapProps {
  points?: GeoPoint[]
  value?: GeoPoint | null
  onPick?: (pt: GeoPoint) => void
  interactive?: boolean
  className?: string
  zoom?: number
}

export function LocationMap({ points = [], value, onPick, interactive = false, className = 'h-60', zoom = 13 }: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const pinLayerRef = useRef<L.LayerGroup | null>(null)
  const dataRef = useRef({ points, value, onPick, interactive, zoom })
  dataRef.current = { points, value, onPick, interactive, zoom }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const map = L.map(el, {
      center: [MUMBAI.lat, MUMBAI.lng],
      zoom: dataRef.current.zoom,
      scrollWheelZoom: false,
      attributionControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)
    pinLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    if (dataRef.current.interactive) {
      markerRef.current = L.marker([MUMBAI.lat, MUMBAI.lng], { icon: pinIcon('#0284c7'), draggable: true })
        .addTo(map)
        .on('dragend', () => {
          const pos = markerRef.current?.getLatLng()
          if (pos) dataRef.current.onPick?.({ lat: pos.lat, lng: pos.lng })
        })
      map.on('click', (e: L.LeafletMouseEvent) => {
        const pt = { lat: e.latlng.lat, lng: e.latlng.lng }
        markerRef.current?.setLatLng([pt.lat, pt.lng])
        dataRef.current.onPick?.(pt)
      })
    }

    const fit = () => {
      const { points, value } = dataRef.current
      const seen = points.length ? points : value ? [value] : []
      if (seen.length > 0) {
        const bounds = L.latLngBounds(seen.map((p) => [p.lat, p.lng]))
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: dataRef.current.zoom })
      }
    }
    fit()

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      pinLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const { points, value, interactive } = dataRef.current

    pinLayerRef.current?.clearLayers()
    for (const p of points) {
      L.marker([p.lat, p.lng], { icon: pinIcon('#dc2626') }).addTo(pinLayerRef.current!)
    }
    if (interactive && value && markerRef.current) {
      markerRef.current.setLatLng([value.lat, value.lng])
      if (!points.length) map.setView([value.lat, value.lng], dataRef.current.zoom)
    }
    if (!interactive && (points.length || value)) {
      const pts = points.length ? points : value ? [value] : []
      map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [30, 30], maxZoom: dataRef.current.zoom })
    }
  }, [points, value])

  const useMyLocation = async () => {
    const pt = await currentCoords()
    if (pt) {
      markerRef.current?.setLatLng([pt.lat, pt.lng])
      mapRef.current?.setView([pt.lat, pt.lng], dataRef.current.zoom)
      dataRef.current.onPick?.(pt)
    } else {
      dataRef.current.onPick?.({ lat: NaN, lng: NaN })
    }
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-200 ${className}`}>
      <div ref={containerRef} className="h-full w-full" aria-label="Map" />
      {interactive && (
        <button
          type="button"
          onClick={() => void useMyLocation()}
          className="absolute right-2 top-2 z-[500] inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow hover:bg-slate-50"
        >
          <LocateFixed className="h-3.5 w-3.5 text-brand-600" aria-hidden />
          Use my location
        </button>
      )}
    </div>
  )
}

export function LocationMapLoading() {
  return (
    <div className="flex h-60 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
      <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden />
    </div>
  )
}