import { fmt, isList, type Snap } from '../../../services/trace'

/** A list drawn as linked nodes (value → next). */
export function ListView({ value }: { value: Snap }) {
  if (!isList(value)) return <p className="text-sm text-slate-muted">Not a list right now: {fmt(value)}</p>
  return (
    <div className="flex flex-wrap items-center gap-y-2" role="list" aria-label={`linked list with ${value.n} nodes`}>
      {value.v.map((it, i) => (
        <div key={i} role="listitem" className="flex items-center">
          <div className="grid h-9 min-w-9 place-items-center rounded-md border border-navy bg-white px-2 font-mono text-sm">{fmt(it, 10)}</div>
          <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden className="text-navy"><path d="M0 6h18M14 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </div>
      ))}
      <span className="font-mono text-xs text-slate-muted">{value.n > value.v.length ? `… ${value.n} total` : 'None'}</span>
    </div>
  )
}
