import { useMemo } from 'react'
import { useAppStore } from '../../store/AppStore'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDate, daysUntil } from '../../utils/dates'
import { formatINR } from '../../utils/format'

export function PortalAmcPage() {
  const { session, amcs } = useAppStore()

  const mine = useMemo(
    () => amcs.filter((a) => a.customerId === session?.customerId).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [amcs, session?.customerId],
  )

  const primary = mine.find((a) => a.status !== 'Renewed')

  return (
    <div>
      <PageHeader
        title="My AMC Contract"
        subtitle="Details of your service agreement and renewal status."
      />

      {mine.length === 0 ? (
        <Card className="p-10"><EmptyState title="No AMC contract" description="We could not find an active service contract for your account." /></Card>
      ) : (
        <div className="space-y-4">
          {primary && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Service Type', value: primary.serviceType },
                { label: 'Contract ID', value: primary.id },
                { label: 'Annual Value', value: formatINR(primary.amount) },
                { label: 'Status', value: primary.status },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
                  <p className="text-xs text-slate-400">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>
          )}

          {mine.map((amc) => {
            const days = daysUntil(amc.endDate)
            return (
              <Card key={amc.id} title={`${amc.id} — ${amc.serviceType}`}>
                <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-slate-400">Start date</p>
                    <p className="font-medium">{formatDate(amc.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">End date</p>
                    <p className="font-medium">{formatDate(amc.endDate)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Amount</p>
                    <p className="font-medium">{formatINR(amc.amount)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Status</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <StatusBadge kind="amc" value={amc.status} />
                      {days >= 0 && days <= 60 && (
                        <Badge tone="warning">expires in {days} days</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Renewal status: <Badge tone={amc.renewalStatus === 'Done' ? 'success' : amc.renewalStatus === 'Pending' || amc.renewalStatus === 'Started' ? 'warning' : 'neutral'}>{amc.renewalStatus}</Badge>
                </p>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}