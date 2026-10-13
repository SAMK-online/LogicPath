import type { ReactNode } from 'react'
import type { Status } from '../types/api'

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-slate-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-copper motion-reduce:animate-none" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />
}

export function ErrorNotice({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-bad/20 bg-bad-50 px-3.5 py-2.5 text-sm text-bad">
      <span>{children}</span>
      {onRetry && <button className="shrink-0 font-medium underline underline-offset-2" onClick={onRetry}>Retry</button>}
    </div>
  )
}

const DIFF: Record<string, { dot: string; text: string }> = {
  Easy: { dot: 'bg-ok', text: 'text-ok' }, Beginner: { dot: 'bg-ok', text: 'text-ok' },
  Medium: { dot: 'bg-warn', text: 'text-warn' }, Intermediate: { dot: 'bg-warn', text: 'text-warn' },
  Hard: { dot: 'bg-bad', text: 'text-bad' }, Advanced: { dot: 'bg-bad', text: 'text-bad' },
}
export function DifficultyBadge({ level }: { level: string }) {
  const d = DIFF[level] ?? { dot: 'bg-slate-muted', text: 'text-slate-muted' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2 py-0.5 text-xs font-medium ${d.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${d.dot}`} aria-hidden />{level}
    </span>
  )
}

export function ProgressBar({ percent, label, size = 'md' }: { percent: number; label?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progress'}
      className={`w-full overflow-hidden rounded-full bg-navy-50 ${size === 'sm' ? 'h-1.5' : 'h-2'}`}>
      <div className="h-full rounded-full bg-copper transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
    </div>
  )
}

/** Circular progress for headers. The number is visible text; the ring is decorative. */
export function ProgressRing({ percent, size = 64 }: { percent: number; size?: number }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-navy-50)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-copper)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none" />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums">{percent}%</span>
    </div>
  )
}

const STATUS_LABEL: Record<Status, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' }
export function StatusDot({ status }: { status: Status }) {
  return (
    <svg role="img" aria-label={STATUS_LABEL[status]} width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <title>{STATUS_LABEL[status]}</title>
      {status === 'completed' ? (
        <><circle cx="9" cy="9" r="8" fill="var(--color-ok)" /><path d="M5.2 9.2l2.6 2.6 5-5.2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>
      ) : status === 'in_progress' ? (
        <><circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--color-copper)" strokeWidth="1.6" /><path d="M9 1.5a7.5 7.5 0 0 1 0 15z" fill="var(--color-copper)" /></>
      ) : (
        <circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--color-line)" strokeWidth="1.6" />
      )}
    </svg>
  )
}
export const statusLabel = (s: Status) => STATUS_LABEL[s]

/** The LogicPath mark. On navy backgrounds the navy half of the mark would vanish, so it sits on a white tile there. */
export function Logo({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  const img = <img src="/logo-mark.png" alt="" aria-hidden width={size} height={size} className="block object-contain" draggable={false} />
  if (!onDark) return img
  return <span className="grid place-items-center rounded-lg bg-white" style={{ width: size + 8, height: size + 8 }}>{img}</span>
}

export function Wordmark({ onDark = false, className = '' }: { onDark?: boolean; className?: string }) {
  return <span className={`font-display font-semibold tracking-tight ${className}`}>
    <span className={onDark ? 'text-white' : 'text-navy'}>Logic</span><span className={onDark ? 'text-copper-100' : 'text-copper-600'}>Path</span>
  </span>
}
