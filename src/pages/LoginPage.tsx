import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck, User, Wrench, ArrowRight, Sparkles, UserPlus } from 'lucide-react'
import { useAppStore } from '../store/AppStore'
import { Button } from '../components/ui/Button'
import { Input, PasswordInput } from '../components/ui/Field'
import { Logo } from '../components/layout/Logo'
import { homeFor } from '../data/auth'
import { CURRENT_USER } from '../constants'
import { cn } from '../utils/cn'
import type { Role } from '../types'

const featureList = [
  { title: 'Health Scoring', text: 'Every customer gets a live 0–100 health score with clear reasons.' },
  { title: 'Renewal Protection', text: 'Spot at-risk contracts before they lapse and act early.' },
  { title: 'Role-Based Access', text: 'Admins, technicians and customers each get their own portal.' },
]

const roleMeta: Record<Role, { email: string; password: string; icon: typeof User }> = {
  admin: { email: CURRENT_USER.email, password: 'admin123', icon: ShieldCheck },
  technician: { email: '', password: '', icon: Wrench },
  customer: { email: '', password: '', icon: User },
}

export function LoginPage() {
  const { session, login, customers } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [role, setRole] = useState<Role>('admin')
  const [email, setEmail] = useState(roleMeta.admin.email)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? null

  useEffect(() => {
    if (session) navigate(homeFor(session.role), { replace: true })
  }, [session, navigate])

  const sampleCustomer = customers[0]

  const switchRole = (next: Role) => {
    setRole(next)
    setError('')
    setEmail(next === 'customer' ? sampleCustomer?.email ?? '' : roleMeta[next].email)
  }

  const submit = () => {
    setError('')
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.')
      return
    }
    setBusy(true)
    setTimeout(async () => {
      const outcome = await login(email, password, role)
      setBusy(false)
      if (!outcome.ok) {
        setError(outcome.message)
        return
      }
      navigate(from ?? homeFor(outcome.role), { replace: true })
    }, 100)
  }

  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-700 p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />
        <Logo className="relative text-white" light />
        <div className="relative space-y-6">
          <p className="text-2xl font-bold leading-snug">
            Keep every customer…
            <br /> before they slip away.
          </p>
          <ul className="space-y-3">
            {featureList.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="mt-1 rounded-full bg-white/15 p-1">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="block text-sm text-brand-100/90">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-100/70">© {new Date().getFullYear()} ServicePulse · Frontend demo (backend integration ready)</p>
      </div>

      <div className="flex w-full items-center justify-center px-6 py-10 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue to ServicePulse.</p>

          <div className="mt-6 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Account type">
            {(['admin', 'technician', 'customer'] as Role[]).map((r) => {
              const Icon = roleMeta[r].icon
              return (
                <button
                  key={r}
                  role="tab"
                  aria-selected={role === r}
                  onClick={() => switchRole(r)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium capitalize transition-colors',
                    role === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {r}
                </button>
              )
            })}
          </div>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={roleMeta[role].email}
              autoComplete="username"
            />
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={roleMeta[role].password}
              autoComplete="current-password"
            />
            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full justify-center" loading={busy}>
              Sign in as {role}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </form>

          <div className="mt-6">
            <p className="text-center text-xs leading-relaxed text-slate-400">
              Sign in with your registered account. New users can create one from the signup page and wait for approval.
            </p>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-slate-500">
            <UserPlus className="h-4 w-4" aria-hidden />
            New here?{' '}
            <Link to="/signup" className="font-medium text-brand-600 hover:text-brand-700">
              Create an account
            </Link>{' '}
            — pending admin approval.
          </p>
        </div>
      </div>
    </div>
  )
}