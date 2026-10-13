import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { HealthDistribution } from '../../types'
import { riskColors, tooltipStyle } from './chartTheme'

const order: Array<keyof HealthDistribution> = ['Healthy', 'Watch', 'At Risk', 'Critical']

export function HealthDonut({ distribution }: { distribution: HealthDistribution }) {
  const data = order
    .map((key) => ({ name: key, value: distribution[key] }))
    .filter((d) => d.value > 0)
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={56}
              outerRadius={80}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={riskColors[entry.name]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [value, name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {order.map((key) => (
          <li key={key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: riskColors[key] }} aria-hidden />
              {key}
            </span>
            <span className="font-semibold text-slate-900">{distribution[key]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-400">{total} customers · health score distribution</p>
    </div>
  )
}