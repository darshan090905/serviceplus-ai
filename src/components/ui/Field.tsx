import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../utils/cn'

const baseField =
  'w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50'

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-700">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  label?: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, invalid, className, id, ...props }: InputProps) {
  const input = (
    <input
      id={id ?? (label ? slug(label) : undefined)}
      className={cn(baseField, 'h-9', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-100', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={id ?? (label ? slug(label) : undefined)} className="block text-xs font-medium text-slate-700">{label}</label>}
      {input}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  hint?: string
}

export function PasswordInput({ label, error, hint, className, id, ...props }: PasswordInputProps) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={id ?? (label ? slug(label) : undefined)} className="block text-xs font-medium text-slate-700">{label}</label>}
      <div className="relative">
        <input
          id={id ?? (label ? slug(label) : undefined)}
          type={show ? 'text' : 'password'}
          className={cn(baseField, 'h-9 pr-9', error && 'border-red-400 focus:border-red-500 focus:ring-red-100', className)}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  invalid?: boolean
  options: ReadonlyArray<{ value: string; label: string }>
}

export function Select({ label, error, options, className, id, invalid, ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={id ?? (label ? slug(label) : undefined)} className="block text-xs font-medium text-slate-700">{label}</label>}
      <select
        id={id ?? (label ? slug(label) : undefined)}
        aria-invalid={invalid || undefined}
        className={cn(baseField, 'h-9', invalid && 'border-red-400', className)}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={id ?? (label ? slug(label) : undefined)} className="block text-xs font-medium text-slate-700">{label}</label>}
      <textarea id={id ?? (label ? slug(label) : undefined)} className={cn(baseField, 'min-h-[88px] py-2', error && 'border-red-400', className)} {...props} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}