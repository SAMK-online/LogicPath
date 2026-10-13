import { fmt, isDict, isList, same, type Snap } from '../../../services/trace'

/** Dict (key → value) or set (keys only) as a table; rows that are new or changed since the last step are highlighted. */
export function MapView({ value, prev }: { value: Snap; prev?: Snap }) {
  let rows: [Snap, Snap | undefined][]
  let total: number
  if (isDict(value)) { rows = value.v; total = value.n }
  else if (isList(value)) { rows = value.v.map((k) => [k, undefined] as [Snap, undefined]); total = value.n }
  else return <p className="text-sm text-slate-muted">Not a dict right now: {fmt(value)}</p>

  const before = new Map<string, Snap>()
  if (isDict(prev ?? null)) for (const [k, v] of (prev as { v: [Snap, Snap][] }).v) before.set(JSON.stringify(k), v)
  else if (isList(prev ?? null)) for (const k of (prev as { v: Snap[] }).v) before.set(JSON.stringify(k), null)

  if (rows.length === 0) return <p className="text-sm text-slate-muted">Empty</p>
  return (
    <table className="w-full max-w-sm text-left text-sm">
      <thead className="text-xs text-slate-muted"><tr><th className="pr-3 font-medium">key</th>{isDict(value) && <th className="font-medium">value</th>}</tr></thead>
      <tbody>
        {rows.map(([k, v], i) => {
          const key = JSON.stringify(k)
          const changed = !before.has(key) || (v !== undefined && !same(before.get(key), v))
          return (
            <tr key={i} className={`border-t border-line font-mono transition-colors motion-reduce:transition-none ${changed && prev !== undefined ? 'bg-copper-50' : ''}`}>
              <td className="py-1 pr-3">{fmt(k, 24)}</td>
              {v !== undefined && <td className="py-1">{fmt(v, 40)}</td>}
            </tr>
          )
        })}
      </tbody>
      {total > rows.length && <tfoot><tr><td className="pt-1 text-xs text-slate-muted">… {total} total</td></tr></tfoot>}
    </table>
  )
}
