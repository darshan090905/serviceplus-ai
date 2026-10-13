import { useNavigate } from 'react-router-dom'
import type { AMCContract, Customer } from '../../types'
import { DataTable, type Column } from '../ui/DataTable'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { StatusBadge } from '../ui/StatusBadge'
import { formatINR, formatDate, daysUntil } from '../../utils'
import { HealthRing } from '../customers/HealthRing'

interface ExpiringRow {
  amc: AMCContract
  customer: Customer
}

export function ExpiringAmcTable({ rows }: { rows: Array<{ amc: AMCContract; customer: Customer }> }) {
  const navigate = useNavigate()

  const columns: Array<Column<ExpiringRow>> = [
    {
      key: 'customer',
      header: 'Customer',
      render: ({ customer }) => (
        <span className="font-medium text-slate-900">
          {customer.name}
          <span className="block text-xs font-normal text-slate-400">{customer.company}</span>
        </span>
      ),
    },
    { key: 'amc', header: 'AMC', render: ({ amc }) => <span className="text-slate-600">{amc.id}</span> },
    { key: 'expiry', header: 'Expiry', render: ({ amc }) => <span className="text-slate-600">{formatDate(amc.endDate)}</span> },
    {
      key: 'days',
      header: 'Days Left',
      render: ({ amc }) => {
        const days = daysUntil(amc.endDate)
        return <Badge tone={days <= 14 ? 'danger' : 'warning'}>{days} days</Badge>
      },
    },
    { key: 'value', header: 'Value', align: 'right', render: ({ amc }) => <span className="font-medium text-slate-900">{formatINR(amc.amount)}</span> },
    {
      key: 'health',
      header: 'Health',
      render: ({ customer }) => (
        <span className="flex items-center gap-2">
          <HealthRing score={customer.health.score} level={customer.health.level} size={28} />
          <StatusBadge kind="risk" value={customer.health.level} />
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: ({ customer }) => (
        <Button size="sm" variant="outline" onClick={() => navigate(`/customers/${customer.id}`)}>
          View
        </Button>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={rows}
      rowKey={(r) => r.amc.id}
      onRowClick={(r) => navigate(`/customers/${r.customer.id}`)}
    />
  )
}