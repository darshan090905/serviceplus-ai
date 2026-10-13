import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface DropdownProps {
  trigger: ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  align?: 'left' | 'right'
  width?: string
  triggerClassName?: string
}

export function Dropdown({ trigger, children, align = 'right', width = 'w-64', triggerClassName }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={cn(
            'absolute z-40 mt-2 rounded-lg border border-slate-200 bg-white shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
            width,
          )}
          role="menu"
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  onClick,
  children,
  active,
  danger,
  close,
}: {
  onClick?: () => void
  children: ReactNode
  active?: boolean
  danger?: boolean
  close?: () => void
}) {
  return (
    <button
      role="menuitem"
      onClick={() => {
        onClick?.()
        close?.()
      }}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50',
        active && 'bg-brand-50 text-brand-700',
        danger && 'text-red-600 hover:bg-red-50',
      )}
    >
      {children}
    </button>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">{children}</div>
}