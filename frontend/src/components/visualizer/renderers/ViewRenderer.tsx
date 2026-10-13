import { fmt, type Snap, type TraceStep, type ViewSpec } from '../../../services/trace'
import { ArrayView, type PointerMark } from './ArrayView'
import { ListView } from './ListView'
import { MapView } from './MapView'
import { StackView } from './StackView'
import { TreeView } from './TreeView'

const KIND_LABEL: Record<ViewSpec['kind'], string> = { array: 'array', string: 'string', map: 'map', stack: 'stack', list: 'linked list', tree: 'tree', scalar: 'value' }

/** Draw one variable at the current step. Works for trace steps and for static snapshots (test-case view). */
export function ViewRenderer({ view, step, prevStep }: { view: ViewSpec; step: Pick<TraceStep, 'locals'>; prevStep?: Pick<TraceStep, 'locals'> }) {
  const value: Snap | undefined = step.locals[view.var]
  const prev = prevStep?.locals[view.var]
  const pointers: PointerMark[] = (view.pointers ?? []).flatMap((p) => {
    const v = step.locals[p]
    return typeof v === 'number' && Number.isInteger(v) ? [{ name: p, index: v }] : []
  })
  return (
    <section className="rounded-lg border border-line bg-white p-3.5 shadow-card" aria-label={`${view.var} (${KIND_LABEL[view.kind]})`}>
      <h4 className="mb-2 flex items-baseline gap-2 text-xs font-semibold text-slate-muted">
        <span className="font-mono text-sm text-navy">{view.var}</span><span>{view.title ?? KIND_LABEL[view.kind]}</span>
      </h4>
      {value === undefined ? <p className="text-sm text-slate-muted">Not defined yet at this step.</p> : (
        view.kind === 'array' ? <ArrayView value={value} prev={prev} pointers={pointers} />
          : view.kind === 'string' ? <ArrayView value={value} prev={prev} pointers={pointers} asString />
          : view.kind === 'map' ? <MapView value={value} prev={prev} />
          : view.kind === 'stack' ? <StackView value={value} />
          : view.kind === 'list' ? <ListView value={value} />
          : view.kind === 'tree' ? <TreeView value={value} />
          : <p className="font-mono text-sm">{fmt(value, 200)}</p>
      )}
    </section>
  )
}
