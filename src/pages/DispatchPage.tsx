import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../store/AppStore'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'
import { buildWeekView, blockTimeLabel, timeOrder } from '../utils/dispatch'
import { formatDate, addDays, daysFromNow } from '../utils/dates'

/**
 * Dispatch board: one week, seven days, every technician who has work or a
 * profile.
 *
 * The point is to make double-booking visible. Two overlapping visits on the
 * same technician's day are marked, because that is the mistake a paper list
 * hides and a week view does not. Nothing here is invented: technicians come
 * from real accounts and real visit records, and a week with nothing in it
 * renders empty rather than filled with a made-up roster.
 */
export function DispatchPage() {
  const { services, accounts } = useAppStore()
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState<string>(() => daysFromNow(0))

  const view = useMemo(() => buildWeekView(services, accounts, anchor), [services, accounts, anchor])

  const blocks = useMemo(() => view.days.flatMap((d) => d.blocks), [view.days])
  const conflicts = blocks.filter((b) => b.overlaps)
  const unscheduled = blocks.filter((b) => b.startMinute === null)

  const go = (delta: number) => setAnchor((prev) => addDays(prev, delta))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatch Board"
        subtitle="Week view of scheduled visits by technician. Overlaps are flagged."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => go(-7)} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(daysFromNow(0))}>
              This week
            </Button>
            <Button variant="ghost" size="sm" onClick={() => go(7)} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span className="font-medium text-slate-900">
          {view.weekStart ? `${formatDate(view.weekStart)} – ${formatDate(view.days[view.days.length - 1]?.date ?? view.weekStart)}` : 'No week selected'}
        </span>
        <span className="text-slate-400">|</span>
        <span>{blocks.length} visit{blocks.length === 1 ? '' : 's'}</span>
        {conflicts.length > 0 && (
          <Badge tone="danger" icon={<AlertTriangle className="h-3 w-3" />}>
            {conflicts.length} overlapping
          </Badge>
        )}
        {unscheduled.length > 0 && <span className="text-slate-500">{unscheduled.length} without a start time</span>}
      </div>

      {view.weekStart === '' ? (
        <EmptyState title="No week to show" description="The selected date could not be read." />
      ) : view.technicians.length === 0 ? (
        <EmptyState
          title="No technicians yet"
          description="Add technician accounts, or record a visit with a technician name, and they will appear here."
        />
      ) : (
        <div className="space-y-4">
          {view.technicians.map((tech) => (
            <div key={tech.key} className="rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
                <span className="font-medium text-slate-900">{tech.name}</span>
                {tech.unresolved && (
                  <Badge tone="warning">unmatched profile</Badge>
                )}
                {tech.hasSkills ? null : (
                  <span className="text-xs text-slate-500">no service types recorded</span>
                )}
              </div>
              <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
                {view.days.map((day) => {
                  const dayBlocks = day.blocks
                    .filter((b) => b.technicianKey === tech.key)
                    .sort((a, b) => timeOrder(a) - timeOrder(b))
                  return (
                    <div key={day.date} className="min-h-[7rem] border-b border-slate-100 p-3 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
                      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                        {formatDate(day.date)}
                      </div>
                      <div className="space-y-1.5">
                        {dayBlocks.length === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          dayBlocks.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => navigate(`/services/${b.id}`)}
                              className={`block w-full rounded border px-2 py-1.5 text-left text-xs transition hover:bg-slate-50 ${
                                b.overlaps ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'
                              }`}
                            >
                              <div className="font-medium text-slate-900">{b.serviceType}</div>
                              <div className={b.startMinute === null ? 'text-amber-700' : 'text-slate-500'}>
                                {b.startMinute === null ? 'No start time' : blockTimeLabel(b)}
                              </div>
                              {b.overlaps && <div className="mt-0.5 text-red-700">Overlaps another visit</div>}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {blocks.length === 0 && (
            <EmptyState
              title="Nothing scheduled this week"
              description="No visits fall in these seven days. Move to another week, or schedule a visit."
            />
          )}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <CalendarDays className="h-3.5 w-3.5" />
        Times are local wall-clock. A visit with no start time is shown as unscheduled rather than guessed to a
        time nobody entered.
      </p>
    </div>
  )
}
