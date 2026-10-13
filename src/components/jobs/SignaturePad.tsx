import { useEffect, useRef, useState } from 'react'

interface Props {
  onCaptureChange?: (blob: Blob | null) => void
  disabled?: boolean
}

const WIDTH = 640
const HEIGHT = 200

/**
 * Captures a customer sign-off on a canvas.
 *
 * Hand-rolled rather than pulled from a signature library, for one reason: the
 * usual libraries are either canvas wrappers that save nothing (the signature
 * still has to be turned into a file) or paid e-signature products that require
 * an account, a server and a legal audit trail. This draws strokes and emits a
 * PNG, which is the whole job.
 *
 * Pointer events rather than mouse/touch events, so one handler covers stylus,
 * finger and mouse.
 */
export function SignaturePad({ onCaptureChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  // Seed the canvas with a transparent background and size it for the device's
  // pixel density. Without the ratio the signature is drawn at half size on a
  // modern screen and comes out blurry when scaled up.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = WIDTH * ratio
    canvas.height = HEIGHT * ratio
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    // Map client coordinates through the rendered size rather than assuming
    // the canvas is displayed 1:1, which it is not once CSS scales it.
    return {
      x: ((e.clientX - rect.left) / rect.width) * WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * HEIGHT,
    }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    // Capture the pointer so a stroke that leaves the canvas keeps drawing
    // instead of stopping dead at the edge.
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pointFrom(e)
    setHasInk(true)
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return
    const ctx = canvasRef.current?.getContext('2d')
    const from = last.current
    if (!ctx || !from) return
    const to = pointFrom(e)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    last.current = to
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    onCaptureChange?.(hasInk ? toBlob() : null)
  }

  const toBlob = (): Blob | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    // A PNG of a mostly-empty canvas compresses to a few KB, so there is no
    // reason to trade quality for a lossy format here.
    const data = canvas.toDataURL('image/png')
    const [meta, body] = data.split(',')
    const mime = /:(.*?);/.exec(meta)?.[1] ?? 'image/png'
    try {
      const binary = atob(body)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return new Blob([bytes], { type: mime })
    } catch {
      return null
    }
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    setHasInk(false)
    onCaptureChange?.(null)
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${HEIGHT}px`, touchAction: 'none' }}
          className="block cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          aria-label="Signature pad"
        />
        {!hasInk && (
          <p className="pointer-events-none -mt-[152px] mb-0 text-center text-xs text-slate-300">
            Sign here
          </p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {hasInk ? 'Signature captured.' : 'Nothing drawn yet.'}
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
