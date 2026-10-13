import { fmt, isLinked, isList, type Snap } from '../../../services/trace'

/** A linked list drawn as nodes (value → next), ending in None. A list that is long or loops back on itself ends in "…". */
export function ListView({ value }: { value: Snap }) {
  const linked = isLinked(value)
  if (!linked && !isList(value)) return <p className="text-sm text-slate-muted">Not a list right now: {fmt(value)}</p>
  const items = value.v
  const count = value.n
  const more = linked ? value.more === true : count > items.length
  return (
    <div className="flex flex-wrap items-center gap-y-2" role="list" aria-label={`linked list with ${count}${more ? '+' : ''} nodes`}>
      {items.map((it, i) => (
        <div key={i} role="listitem" className="flex items-center">
          <div className="grid h-9 min-w-9 place-items-center rounded-md border border-slate-muted bg-surface px-2 font-mono text-sm">{fmt(it, 10)}</div>
          <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden className="text-ink"><path d="M0 6h18M14 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </div>
      ))}
      <span className="font-mono text-xs text-slate-muted">{more ? (linked ? '… keeps going or loops back' : `… ${count} total`) : 'None'}</span>
    </div>
  )
}
