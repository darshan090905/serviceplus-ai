import { useEffect, useMemo, useRef, useState } from 'react'
import { Phone, PhoneOff, PhoneCall, CircleDot } from 'lucide-react'
import { useAppStore } from '../../store/AppStore'
import { Avatar } from '../ui/Avatar'
import { startRingtone, stopRingtone } from '../../utils/sound'
import type { CallStatus } from '../../types'

/**
 * In-app AI voice call: rendered only inside the technician portal. When a
 * call row (from an admin assignment) targeting this technician arrives via
 * Realtime, the app rings (WebAudio), shows an incoming-call card, and on
 * accept speaks the AI message through the browser's speech-synthesis.
 *
 * State machine (one-way, no loops, never blocks the portal permanently):
 *   queued   -> rings + 30s auto-miss timer
 *   accept   -> this tab shows a connected card, speaks the message, and can
 *               End the call (45s auto-end). The connected card is LOCAL to the
 *               tab that accepted — a reload or a persisted `answered` row
 *               never re-opens the fullscreen overlay.
 *   missed   -> terminal (decline or auto-miss)
 * A `handledRef` set remembers every call this tab has acted on so a stale
 * `queued` row echoed back by polling/Realtime/another tab can never make the
 * same call ring again. 100% free — no telephony provider.
 */
export function IncomingCallOverlay() {
  const { calls, session, markCallStatus } = useAppStore()

  // Calls this tab has already declined / ended / auto-missed must never ring
  // again, even if a stale `queued` copy of the row re-enters the store.
  const handledRef = useRef<Set<string>>(new Set())
  // The connected call this tab actually accepted (local to this session).
  const [active, setActive] = useState<{ id: string; message: string } | null>(null)

  // Ring only for an unhandled queued call targeting this technician.
  const incoming = useMemo(
    () =>
      calls.find((c) => {
        if (c.toName !== session?.name && c.toName !== session?.technicianId) return false
        if (handledRef.current.has(c.id)) return false
        return c.status === 'queued'
      }),
    [calls, session?.name, session?.technicianId],
  )

  // Ring while the call is still queued; stop everything the moment the state
  // moves on, and auto-miss after 30 seconds if untouched.
  useEffect(() => {
    if (!incoming) {
      stopRingtone()
      return
    }
    startRingtone()
    const timer = setTimeout(() => {
      handledRef.current.add(incoming.id)
      markCallStatus(incoming.id, 'missed')
    }, 30000)
    return () => {
      clearTimeout(timer)
      stopRingtone()
    }
  }, [incoming?.id, incoming?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // A connected (answered) call auto-ends so the demo never leaves a stale
  // overlay hanging around after the spoken message finishes.
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => {
      handledRef.current.add(active.id)
      setActive(null)
    }, 45000)
    return () => clearTimeout(timer)
  }, [active?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!incoming && !active) return null

  const mine = active ? session?.name ?? 'you' : session?.name ?? 'you'
  const ringing = Boolean(incoming)

  const speak = (message: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(message)
    utterance.rate = 1
    utterance.pitch = 1.05
    window.speechSynthesis.speak(utterance)
  }

  const settle = (id: string, status: CallStatus) => {
    handledRef.current.add(id)
    markCallStatus(id, status)
  }

  const accept = () => {
    if (!incoming) return
    stopRingtone()
    handledRef.current.add(incoming.id)
    markCallStatus(incoming.id, 'answered')
    setActive({ id: incoming.id, message: incoming.message })
    speak(incoming.message)
  }

  const decline = () => {
    if (!incoming) return
    stopRingtone()
    settle(incoming.id, 'missed')
  }

  const endCall = () => {
    stopRingtone()
    if (active) handledRef.current.add(active.id)
    setActive(null)
  }

  const complaintId = active ? null : incoming?.complaintId
  const message = active?.message ?? incoming?.message ?? ''

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm" role="dialog" aria-label="Incoming AI call">
      <div className="w-full max-w-xs text-center">
        <div className="relative mx-auto mb-6 h-24 w-24">
          {ringing && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" aria-hidden />}
          <span className="absolute inset-2 rounded-full bg-emerald-500/10" aria-hidden />
          <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg">
            <PhoneCall className="h-9 w-9 text-white" aria-hidden />
          </span>
        </div>

        <p className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-300">
          <CircleDot className="h-3.5 w-3.5 animate-pulse text-emerald-400" aria-hidden />
          {ringing ? 'Incoming AI call…' : 'Connected'}
        </p>
        <p className="mt-1 text-xl font-bold text-white">ServicePulse</p>

        <div className="mt-4 flex items-center justify-center gap-2">
          <Avatar name={mine} size="sm" />
          <div className="text-left">
            <p className="text-sm font-medium text-white">{ringing ? `Calling ${mine}…` : mine}</p>
            {complaintId && <p className="text-xs text-slate-400">New job assigned · {complaintId}</p>}
          </div>
        </div>

        {!ringing && (
          <p className="mt-4 rounded-xl border border-slate-700/60 bg-slate-800/60 px-4 py-3 text-sm leading-relaxed text-slate-200">
            {message}
          </p>
        )}

        <div className="mt-8 flex items-center justify-center gap-6">
          {ringing ? (
            <>
              <button
                onClick={decline}
                className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-full bg-red-500 text-white shadow-lg transition-transform hover:scale-105"
                aria-label="Decline call"
              >
                <PhoneOff className="h-6 w-6" aria-hidden />
                <span className="text-[11px] font-semibold">Decline</span>
              </button>
              <button
                onClick={accept}
                className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-full bg-emerald-500 text-white shadow-lg transition-transform hover:scale-105"
                aria-label="Accept call"
              >
                <Phone className="h-6 w-6" aria-hidden />
                <span className="text-[11px] font-semibold">Accept</span>
              </button>
            </>
          ) : (
            <button
              onClick={endCall}
              className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-full bg-red-500 text-white shadow-lg transition-transform hover:scale-105"
              aria-label="End call"
            >
              <PhoneOff className="h-6 w-6" aria-hidden />
              <span className="text-[11px] font-semibold">End call</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}