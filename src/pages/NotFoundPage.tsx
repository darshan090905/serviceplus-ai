import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Logo } from '../components/layout/Logo'
import { useAppStore } from '../store/AppStore'
import { homeFor } from '../data/auth'

export function NotFoundPage() {
  const { session } = useAppStore()
  const home = homeFor(session?.role ?? 'admin')
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="rounded-full bg-slate-100 p-4">
        <Compass className="h-8 w-8 text-slate-400" aria-hidden />
      </div>
      <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-brand-600">Page not found</p>
      <h1 className="mt-1 text-4xl font-bold tracking-tight text-slate-900">404</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        The page you are looking for does not exist or has been moved.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link to={home}>
          <Button>Go to {session?.role === 'customer' ? 'Portal' : 'Dashboard'}</Button>
        </Link>
      </div>
      <div className="mt-10">
        <Logo />
      </div>
    </div>
  )
}