import type { CustomerHealth, RiskFactor, RiskLevel } from '../types'

export const HEALTH_THRESHOLDS = {
  Healthy: { min: 80, max: 100 },
  Watch: { min: 60, max: 79 },
  'At Risk': { min: 40, max: 59 },
  Critical: { min: 0, max: 39 },
} as const

export function levelForScore(score: number): RiskLevel {
  if (score >= 80) return 'Healthy'
  if (score >= 60) return 'Watch'
  if (score >= 40) return 'At Risk'
  return 'Critical'
}

export function computeHealth(factors: RiskFactor[]): CustomerHealth {
  const score = Math.max(
    0,
    Math.min(100, factors.reduce((total, factor) => total + factor.points, 100)),
  )
  return {
    score,
    level: levelForScore(score),
    factors,
  }
}

export function riskBadgeTone(level: RiskLevel): string {
  switch (level) {
    case 'Healthy':
      return 'success'
    case 'Watch':
      return 'warning'
    case 'At Risk':
      return 'danger'
    case 'Critical':
      return 'critical'
  }
}