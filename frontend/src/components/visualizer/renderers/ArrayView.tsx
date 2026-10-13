import { fmt, isList, same, type Snap } from '../../../services/trace'

export interface PointerMark { name: string; index: number }
const MAX_CHARS = 60

/** Array of cells with index labels, pointer markers underneath and highlighting of cells that just changed. */
export function ArrayView({ value, prev, pointers = [], asString = false }: { value: Snap; prev?: Snap; pointers?: PointerMark[]; asString?: boolean }) {
  let items: Snap[]
  let total: number
  if (asString && typeof value === 'string') {
    const chars = [...value]
    items = chars.slice(0, MAX_CHARS)
    total = chars.length
  } else if (isList(value)) {
    items = value.v
    total = value.n
  } else {
    return <p className="text-sm text-slate-muted">Not a list right now: {fmt(value)}</p>
  }
  const prevItems: Snap[] | undefined = isList(prev ?? null) ? (prev as { v: Snap[] }).v : undefined
  const marks = new Map<number, string[]>()
  for (const p of pointers) if (Number.isInteger(p.index) && p.index >= 0 && p.index < items.length) marks.set(p.index, [...(marks.get(p.index) ?? []), p.name])
  const offscreen = pointers.filter((p) => p.index >= items.length || p.index < 0)

  return (
    <div>
      <div className="flex flex-wrap items-start gap-1" role="list" aria-label={`${total} items`}>
        {items.map((it, i) => {
          const changed = prevItems !== undefined && !same(prevItems[i], it)
          return (
            <div key={i} role="listitem" className="flex w-11 flex-col items-center">
              <div className={`grid h-9 w-full place-items-center rounded border font-mono text-sm transition-colors motion-reduce:transition-none ${changed ? 'border-copper bg-copper-50 font-semibold' : 'border-line bg-white'}`}
                aria-label={`index ${i}: ${fmt(it)}`}>
                <span className="max-w-full truncate px-0.5">{typeof it === 'string' ? it : fmt(it, 8)}</span>
              </div>
              <span className="mt-0.5 text-[10px] text-slate-muted">{i}</span>
              <span className="min-h-4 text-[11px] font-semibold leading-4 text-copper">{marks.has(i) ? `▲ ${marks.get(i)!.join(',')}` : ''}</span>
            </div>
          )
        })}
        {total > items.length && <span className="self-center px-1 text-xs text-slate-muted">… {total} total</span>}
      </div>
      {offscreen.length > 0 && (
        <p className="mt-1 text-xs text-slate-muted">Outside the array: {offscreen.map((p) => `${p.name}=${p.index}`).join(', ')}</p>
      )}
    </div>
  )
}
