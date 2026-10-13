import type { RiskLevel } from '../../types'
import { cn } from '../../utils/cn'

const ringColors: Record<RiskLevel, string> = {
  Healthy: 'text-emerald-500',
  Watch: 'text-amber-500',
  'At Risk': 'text-orange-500',
  Critical: 'text-red-500',
}

export function HealthRing({
  score,
  level,
  size = 40,
  showLabel = true,
}: {
  score: number
  level: RiskLevel
  size?: number
  showLabel?: boolean
}) {
  const stroke = size / 8
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`Health score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="fill-none stroke-slate-100" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          className={cn('fill-none transition-all', ringColors[level])}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {showLabel && (
        <span className={cn('absolute font-bold', size >= 40 ? 'text-xs' : 'text-[10px]', ringColors[level])}>{score}</span>
      )}
    </span>
  )
}