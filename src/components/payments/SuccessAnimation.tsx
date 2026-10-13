import { useEffect, useMemo, type CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { playSuccessSound } from '../../utils/sound'

interface ConfettiPiece {
  left: number
  delay: number
  px: number
  py: number
  rot: number
  color: string
}

const CONFETTI_COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6']

export function SuccessAnimation({ size = 120 }: { size?: number }) {
  const pieces = useMemo<ConfettiPiece[]>(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: 6 + (i / 13) * 88,
        delay: 0.25 + (i % 4) * 0.06,
        px: (i % 2 === 0 ? -1 : 1) * (30 + (i % 5) * 14),
        py: -(70 + (i % 3) * 26),
        rot: (i % 2 === 0 ? -1 : 1) * (120 + i * 20),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [],
  )

  useEffect(() => {
    const t = window.setTimeout(() => playSuccessSound(), 60)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className="relative my-4 flex items-center justify-center" style={{ height: size * 1.6, width: size * 1.6 }}>
      {pieces.map((pc, i) => (
        <span
          key={i}
          className="pay-confetti-piece absolute block h-2.5 w-1.5 rounded-sm"
          style={
            {
              left: `${pc.left}%`,
              top: '45%',
              background: pc.color,
              animationDelay: `${pc.delay}s`,
              '--px': `${pc.px}px`,
              '--py': `${pc.py}px`,
              '--rot': `${pc.rot}deg`,
            } as CSSProperties
          }
        />
      ))}

      <div className="animate-pay-pop-in flex items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40" style={{ width: size, height: size }}>
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 48 48" fill="none" className="pay-ring-draw">
          <circle cx="24" cy="24" r="22" stroke="rgba(255,255,255,0.45)" strokeWidth="3" fill="none" />
        </svg>
        <span className="absolute flex items-center justify-center" aria-hidden>
          <Check className="pay-check-draw text-white" style={{ width: size * 0.42, height: size * 0.42, strokeWidth: 3 }} />
        </span>
      </div>
    </div>
  )
}