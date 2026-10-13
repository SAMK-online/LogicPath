import { fromJson, type Snap, type ViewKind, type ViewSpec } from '../../services/trace'
import type { Problem, TestCase } from '../../types/api'
import { ViewRenderer } from './renderers/ViewRenderer'

function kindFor(type: string, value: unknown): ViewKind {
  if (type.startsWith('Optional[TreeNode]')) return 'tree'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'string') return 'string'
  if (value !== null && typeof value === 'object') return 'map'
  return 'scalar'
}

/** Part 1: draw a test case's inputs and expected output straight from the structured test data. No AI, no execution. */
export function TestCaseView({ problem, test }: { problem: Problem; test: TestCase }) {
  const sig = problem.function_signature
  const locals: Record<string, Snap> = {}
  const views: ViewSpec[] = []
  sig.params.forEach((p, i) => {
    locals[p.name] = fromJson(test.args[i], p.type)
    views.push({ var: p.name, kind: kindFor(p.type, test.args[i]), title: p.type })
  })
  locals.expected = fromJson(test.expected, sig.return_type)
  const step = { locals }
  return (
    <div className="space-y-3">
      <div>
        <h3 className="label">Input</h3>
        <div className="space-y-2">{views.map((v) => <ViewRenderer key={v.var} view={v} step={step} />)}</div>
      </div>
      <div>
        <h3 className="label">Expected output</h3>
        <ViewRenderer view={{ var: 'expected', kind: kindFor(sig.return_type, test.expected), title: sig.return_type }} step={step} />
      </div>
    </div>
  )
}
