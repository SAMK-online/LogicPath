import { describe, diffArray, type PointerMap } from '../../../services/commands'
import { fmt, isList, type Snap } from '../../../services/trace'

export interface PointerMark { name: string; index: number }
const MAX_CHARS = 60
const CELL_H = 40
const GAP = 4
const LANE = 18
const toMap = (ps: PointerMark[] | undefined): PointerMap | undefined => (ps ? Object.fromEntries(ps.map((p) => [p.name, p.index])) : undefined)

/**
 * An array drawn as an SVG scene. The scene is driven by commands derived from the previous and current snapshot of the student's
 * trace: pointers slide to their new cell, changed cells are tinted, a swap is drawn as an arc between the two cells.
 */
export function ArrayView({ value, prev, pointers = [], prevPointers, asString = false, id = 'arr' }:
  { value: Snap; prev?: Snap; pointers?: PointerMark[]; prevPointers?: PointerMark[]; asString?: boolean; id?: string }) {
  let cells: Snap[]
  let total: number
  if (asString && typeof value === 'string') {
    const chars = [...value]
    cells = chars.slice(0, MAX_CHARS)
    total = chars.length
  } else if (isList(value)) {
    cells = value.v
    total = value.n
  } else {
    return <p className="text-sm text-slate-muted">Not a list right now: {fmt(value)}</p>
  }
  const prevCells: Snap | undefined = asString && typeof prev === 'string' ? { t: 'list', n: [...prev].length, v: [...prev].slice(0, MAX_CHARS) } : prev

  const commands = diffArray(id, prevCells, cells, toMap(prevPointers), toMap(pointers) ?? {})
  const changed = new Set<number>()
  const swaps: { a: number; b: number }[] = []
  for (const c of commands) {
    if (c.command === 'SET_VALUE') changed.add(c.index)
    else if (c.command === 'SWAP') { changed.add(c.a); changed.add(c.b); swaps.push({ a: c.a, b: c.b }) }
  }
  const lines = prev === undefined ? [] : commands.flatMap((c) => describe(c, cells.length) ?? [])

  const text = (it: Snap) => (typeof it === 'string' ? it : fmt(it, 9))
  const longest = cells.reduce((m, it) => Math.max(m, [...text(it)].length), 1)
  const cellW = Math.min(80, Math.max(44, Math.round(longest * 8.5 + 14)))
  const pitch = cellW + GAP
  const cx = (i: number) => i * pitch + cellW / 2

  const onArray = pointers.filter((p) => Number.isInteger(p.index) && p.index >= 0 && p.index < cells.length)
  const offscreen = pointers.filter((p) => !onArray.includes(p))
  const lane = new Map<string, number>()
  const seen = new Map<number, number>()
  for (const p of onArray) { const n = seen.get(p.index) ?? 0; lane.set(p.name, n); seen.set(p.index, n + 1) }
  const withPointer = new Set(onArray.map((p) => p.index))
  const maxLane = Math.max(0, ...lane.values())
  const width = Math.max(cells.length, 1) * pitch - GAP
  const height = 28 + CELL_H + (onArray.length ? 30 + (maxLane + 1) * LANE : 22)

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="list" aria-label={`${total} items`} className="block max-w-none" data-testid="array-scene">
          {swaps.map((s) => (
            <path key={`${s.a}-${s.b}-${JSON.stringify(cells)}`} className="array-swap" pathLength={100} fill="none" stroke="var(--color-copper)" strokeWidth={2} strokeLinecap="round"
              d={`M ${cx(s.a)} -2 Q ${(cx(s.a) + cx(s.b)) / 2} -26 ${cx(s.b)} -2`} transform="translate(0 28)" data-testid="swap-arc" />
          ))}
          <g transform="translate(0 28)">
            {cells.map((it, i) => (
              <g key={i} role="listitem" aria-label={`index ${i}: ${fmt(it)}`} data-changed={changed.has(i) ? 'true' : 'false'}>
                <rect x={i * pitch} y={0} width={cellW} height={CELL_H} rx={5}
                  className={`transition-colors duration-300 motion-reduce:transition-none ${changed.has(i) ? 'fill-copper-50 stroke-copper' : 'fill-white stroke-line'}`}
                  strokeWidth={changed.has(i) || withPointer.has(i) ? 2 : 1} style={withPointer.has(i) && !changed.has(i) ? { stroke: 'var(--color-navy)' } : undefined} />
                <text x={cx(i)} y={CELL_H / 2 + 5} textAnchor="middle" className={`fill-navy font-mono text-[14px] ${changed.has(i) ? 'font-semibold' : ''}`}>{text(it)}</text>
                <text x={cx(i)} y={CELL_H + 14} textAnchor="middle" className="fill-slate-muted text-[10px]">{i}</text>
              </g>
            ))}
            {onArray.map((p) => (
              <g key={p.name} className="array-pointer" style={{ transform: `translate(${cx(p.index)}px, ${CELL_H + 30 + (lane.get(p.name) ?? 0) * LANE}px)` }}>
                <text textAnchor="middle" className="fill-copper text-[11px] font-semibold">{`▲ ${p.name}`}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      {total > cells.length && <p className="text-xs text-slate-muted">… {total} total</p>}
      {offscreen.length > 0 && (
        <p className="mt-1 text-xs text-slate-muted">Outside the array: {offscreen.map((p) => `${p.name}=${p.index}`).join(', ')}</p>
      )}
      {lines.length > 0 && <p className="mt-1 text-xs text-slate-muted" data-testid="actions">{lines.join('; ')}</p>}
    </div>
  )
}
