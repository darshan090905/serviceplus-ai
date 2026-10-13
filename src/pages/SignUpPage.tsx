import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, MailCheck, ShieldCheck, User, Wrench, UserPlus } from 'lucide-react'
import { useAppStore } from '../store/AppStore'
import { Button } from '../components/ui/Button'
import { Input, Field, PasswordInput } from '../components/ui/Field'
import { ServicePicker } from '../components/ui/ServicePicker'
import { Logo } from '../components/layout/Logo'
import { useToast } from '../components/ui/Toast'
import { cn } from '../utils/cn'
import type { Role, ServiceTypeKey } from '../types'

type SignupRole = Exclude<Role, 'admin'>

export function SignUpPage() {
  const { registerAccount, session } = useAppStore()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [role, setRole] = useState<SignupRole>('customer')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [company, setCompany] = useState('')
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeKey[]>([])
  const [city, setCity] = useState('Mumbai')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-slate-500">You are already signed in.</p>
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/')}>Go to dashboard</Button>
          <Button variant="outline" onClick={() => navigate('/login')}>Switch account</Button>
        </div>
      </div>
    )
  }

  const submit = async () => {
    setError('')
    const result = await registerAccount({
      name,
      email,
      password,
      role,
      company: company || undefined,
      serviceTypes: role === 'customer' ? serviceTypes : undefined,
      city: city || undefined,
    })
    if (!result.ok) {
      setError(result.message ?? 'Something went wrong.')
      return
    }
    setDone(true)
    toast('Signup submitted — waiting for admin approval.')
  }

  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-700 p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />
        <Logo className="relative text-white" light />
        <div className="relative space-y-6">
          <p className="text-2xl font-bold leading-snug">
            Join ServicePulse.
            <br /> Get a portal built for you.
          </p>
          <ul className="space-y-3 text-sm text-brand-100/90">
            <li>• Customers — track AMC, services, payments and complaints.</li>
            <li>• Technicians — manage your jobs, assigned complaints and email alerts.</li>
            <li>• Accounts go live only after admin approval.</li>
          </ul>
        </div>
        <p className="relative text-xs text-brand-100/70">© {new Date().getFullYear()} ServicePulse · Frontend demo</p>
      </div>

      <div className="flex w-full items-center justify-center px-6 py-10 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <Logo />
          </div>

          <Link to="/login" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>

          <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">Sign up as a customer or a technician.</p>

          {done ? (
            <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-emerald-100 p-2">
                  <MailCheck className="h-5 w-5 text-emerald-600" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Request received!</p>
                  <p className="mt-1 text-sm text-emerald-700">
                    Your {role} account is now <strong>pending approval</strong>. The operations team will review it and
                    you will receive an email once your account is active.
                  </p>
                </div>
              </div>
              <Button className="mt-4 w-full justify-center" onClick={() => navigate('/login')}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Account type">
                {(['customer', 'technician'] as SignupRole[]).map((r) => {
                  const Icon = r === 'customer' ? User : Wrench
                  return (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={role === r}
                      onClick={() => {
                        setRole(r)
                        setError('')
                      }}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors',
                        role === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden /> {r === 'customer' ? 'Customer' : 'Technician'}
                    </button>
                  )
                })}
              </div>

              <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
              <Input label="Work email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
              <PasswordInput
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                hint="Minimum 6 characters."
                autoComplete="new-password"
              />

              {role === 'customer' && (
                <>
                  <Input label="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Your business name" />
                  <Field label="Services required">
                    <ServicePicker value={serviceTypes} onChange={setServiceTypes} error={serviceTypes.length === 0 && error ? 'Select at least one service' : undefined} />
                  </Field>
                  <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" />
                </>
              )}

              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full justify-center" icon={<UserPlus className="h-4 w-4" />}>
                Request account
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                You will only be able to sign in after admin approval.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}