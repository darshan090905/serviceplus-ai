import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  align?: 'left' | 'right'
  className?: string
}

interface DataTableProps<T> {
  columns: Array<Column<T>>
  data: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  empty?: ReactNode
  pagination?: ReactNode
  dense?: boolean
}

export function DataTable<T>({ columns, data, rowKey, onRowClick, empty, pagination, dense }: DataTableProps<T>) {
  return (
    <div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-left">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500',
                    col.align === 'right' && 'text-right',
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.length === 0 && (
              <tr>
                <td colSpan={columns.length}>{empty ?? <span className="block py-10 text-center text-sm text-slate-400">No records found.</span>}</td>
              </tr>
            )}
            {data.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/60', onRowClick && 'cursor-pointer')}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'whitespace-nowrap px-4 py-3 text-slate-700',
                      col.align === 'right' && 'text-right',
                      !dense && 'py-3.5',
                      col.className,
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && <div className="border-t border-slate-100 px-4 py-3">{pagination}</div>}
    </div>
  )
}