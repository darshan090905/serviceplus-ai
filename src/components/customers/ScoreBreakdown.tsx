import type { CustomerHealth } from '../../types'

export function ScoreBreakdown({ health }: { health: CustomerHealth }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
        <span className="text-slate-600">Starting score</span>
        <span className="font-semibold text-slate-900">100</span>
      </div>
      {health.factors.map((f, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-slate-600">{f.label}</span>
          <span className={f.points >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
            {f.points >= 0 ? '+' : ''}
            {f.points}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2.5 font-medium">
        <span className="text-brand-700">Final score</span>
        <span className="text-lg font-bold text-brand-700">{health.score}</span>
      </div>
    </div>
  )
}