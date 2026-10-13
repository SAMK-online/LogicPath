import { fmt, isAdjacencyName, isDict, isList, type Snap, type TraceStep, type ViewSpec } from '../../../services/trace'
import { ArrayView, type PointerMark } from './ArrayView'
import { GraphView } from './GraphView'
import { ListView } from './ListView'
import { MapView } from './MapView'
import { StackView } from './StackView'
import { TreeView } from './TreeView'

const KIND_LABEL: Record<ViewSpec['kind'], string> = { array: 'array', string: 'string', map: 'map', stack: 'stack', list: 'linked list', tree: 'tree', graph: 'graph', scalar: 'value' }

/** Draw one variable at the current step. Works for trace steps and for static snapshots (test-case view). */
export function ViewRenderer({ view, step, prevStep }: { view: ViewSpec; step: Pick<TraceStep, 'locals'>; prevStep?: Pick<TraceStep, 'locals'> }) {
  const value: Snap | undefined = step.locals[view.var]
  const prev = prevStep?.locals[view.var]
  const marksAt = (s?: Pick<TraceStep, 'locals'>): PointerMark[] => (view.pointers ?? []).flatMap((p) => {
    const v = s?.locals[p]
    return typeof v === 'number' && Number.isInteger(v) ? [{ name: p, index: v }] : []
  })
  const pointers = marksAt(step)
  // For a graph the integer variables are the nodes the code is on, and a set or list named visited/seen marks nodes it has handled.
  const graphProps = (): { nodeCount?: number; current: number[]; visited: Set<number> } => {
    const n = step.locals.n
    const visited = new Set<number>()
    for (const [name, v] of Object.entries(step.locals)) {
      if (!/^(visited|seen|vis|marked)$/i.test(name)) continue
      if (isList(v) && v.t !== 'tuple' && v.v.length > 0 && v.v.every((x) => typeof x === 'boolean')) v.v.forEach((x, i) => { if (x === true) visited.add(i) })
      else if (isList(v)) v.v.forEach((x) => { if (typeof x === 'number' && Number.isInteger(x)) visited.add(x) })
      else if (isDict(v)) v.v.forEach(([k]) => { if (typeof k === 'number' && Number.isInteger(k)) visited.add(k) })
    }
    return { nodeCount: typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : undefined, current: pointers.map((p) => p.index), visited }
  }
  const prevPointers = prevStep ? marksAt(prevStep) : undefined
  return (
    <section className="rounded-lg border border-line bg-white p-3.5 shadow-card" aria-label={`${view.var} (${KIND_LABEL[view.kind]})`}>
      <h4 className="mb-2 flex items-baseline gap-2 text-xs font-semibold text-slate-muted">
        <span className="font-mono text-sm text-navy">{view.var}</span><span>{view.title ?? KIND_LABEL[view.kind]}</span>
      </h4>
      {value === undefined ? <p className="text-sm text-slate-muted">Not defined yet at this step.</p> : (
        view.kind === 'array' ? <ArrayView id={view.var} value={value} prev={prev} pointers={pointers} prevPointers={prevPointers} />
          : view.kind === 'string' ? <ArrayView id={view.var} value={value} prev={prev} pointers={pointers} prevPointers={prevPointers} asString />
          : view.kind === 'map' ? <MapView value={value} prev={prev} />
          : view.kind === 'stack' ? <StackView value={value} />
          : view.kind === 'list' ? <ListView value={value} />
          : view.kind === 'tree' ? <TreeView value={value} />
          : view.kind === 'graph' ? <GraphView value={value} adjacency={isAdjacencyName(view.var)} {...graphProps()} />
          : <p className="font-mono text-sm">{fmt(value, 200)}</p>
      )}
    </section>
  )
}
