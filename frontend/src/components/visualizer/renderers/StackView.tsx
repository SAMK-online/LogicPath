import { fmt, isList, type Snap } from '../../../services/trace'

/** A list drawn as a vertical stack; the last element is the top. */
export function StackView({ value }: { value: Snap }) {
  if (!isList(value)) return <p className="text-sm text-slate-muted">Not a list right now: {fmt(value)}</p>
  if (value.v.length === 0) return <p className="text-sm text-slate-muted">Empty stack</p>
  const items = [...value.v].reverse()
  return (
    <div className="inline-flex flex-col" role="list" aria-label={`stack with ${value.n} items, top first`}>
      {items.map((it, i) => (
        <div key={i} role="listitem" className={`flex items-center gap-2 border border-line px-4 py-1 font-mono text-sm ${i === 0 ? 'border-copper bg-copper-50' : 'bg-surface'} ${i > 0 ? '-mt-px' : ''}`}>
          <span>{fmt(it, 20)}</span>
          {i === 0 && <span className="text-[10px] font-semibold uppercase text-copper">top</span>}
        </div>
      ))}
      {value.n > value.v.length && <span className="text-xs text-slate-muted">… {value.n} total</span>}
    </div>
  )
}
