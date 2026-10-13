import { useEffect, useRef, useState } from 'react'
import { MessagesSquare, Send } from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { timeAgo } from '../../utils/dates'
import { cn } from '../../utils/cn'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Service Desk',
  customer: 'Customer',
  technician: 'Technician',
}

export function ComplaintChat({ complaintId }: { complaintId: string }) {
  const { session, messages, sendMessage } = useAppStore()
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const thread = messages
    .filter((m) => m.complaintId === complaintId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const myRole = session?.role ?? 'admin'

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread.length])

  const submit = () => {
    const body = draft.trim()
    if (!body) return
    sendMessage(complaintId, myRole, body)
    setDraft('')
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <MessagesSquare className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">Live Chat</p>
          <p className="text-xs text-slate-400">Service desk, customer and technician on one thread</p>
        </div>
      </div>

      <div ref={scrollRef} role="log" aria-live="polite" className="scrollbar-thin max-h-72 min-h-[168px] overflow-y-auto space-y-3 bg-slate-50/60 px-4 py-4">
        {thread.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No messages yet — anyone can start the conversation.
          </p>
        ) : (
          thread.map((m) => {
            const mine = m.senderRole === myRole
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%]', mine && 'text-right')}>
                  <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                    <span
                      className={cn(
                        'inline-block h-1.5 w-1.5 rounded-full',
                        m.senderRole === 'admin' ? 'bg-brand-500' : m.senderRole === 'technician' ? 'bg-sky-500' : 'bg-emerald-500',
                      )}
                    />
                    {ROLE_LABEL[m.senderRole] ?? m.senderName} · {m.senderName} · {timeAgo(m.createdAt)}
                  </p>
                  <div
                    className={cn(
                      'inline-block rounded-2xl px-3.5 py-2 text-sm break-words',
                      mine
                        ? 'rounded-br-md bg-brand-600 text-white'
                        : m.senderRole === 'technician'
                          ? 'rounded-bl-md bg-sky-100 text-sky-900'
                          : m.senderRole === 'customer'
                            ? 'rounded-bl-md bg-emerald-100 text-emerald-900'
                            : 'rounded-bl-md bg-slate-200 text-slate-800',
                    )}
                  >
                    {m.body}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-slate-100 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Type a message… (Enter to send)"
          rows={1}
          className="max-h-24 min-h-[38px] w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          aria-label="Send message"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 px-3.5 font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}