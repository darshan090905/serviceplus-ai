import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Role } from '../../types'
import { useAppStore } from '../../store/AppStore'
import { homeFor } from '../../data/auth'

/**
 * Shown for the one or two frames it takes the store to restore a session.
 *
 * It has to be a real render and not a redirect. `session` starts as null
 * because the stored session is read during boot, so a guard that treats null
 * as "signed out" fires on every hard page load — refreshing on /complaints
 * would bounce to /login, which then bounced to the dashboard, and the page the
 * user asked for silently disappeared. That reads to a user as "my data is
 * gone", not as "we are still starting up".
 */
function Restoring() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
        <p className="text-sm text-slate-500">Restoring your session…</p>
      </div>
    </div>
  )
}

export function RequireAuth({ role, children }: { role: Role; children: ReactNode }) {
  const { session, ready } = useAppStore()
  const location = useLocation()

  // Not ready means we genuinely do not know yet. Redirecting here is the bug
  // this guard exists to avoid.
  if (!ready) return <Restoring />

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (session.role !== role) {
    return <Navigate to={homeFor(session.role)} replace />
  }

  return <>{children}</>
}
