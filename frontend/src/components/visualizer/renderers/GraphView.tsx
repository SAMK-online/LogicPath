import { fmt, graphEdges, type Snap } from '../../../services/trace'

const MAX_NODES = 40
const NODE_R = 15

/**
 * A graph drawn with its nodes on a circle. `current` are the nodes the code is on now, `visited` the ones it has marked.
 * The picture comes from the student's own variables: nothing here suggests how to traverse it.
 */
export function GraphView({ value, nodeCount, adjacency, current, visited }: { value: Snap; nodeCount?: number; adjacency: boolean; current: number[]; visited: Set<number> }) {
  const edges = graphEdges(value, adjacency)
  const highest = edges.reduce((m, [a, b]) => Math.max(m, a, b), -1)
  const total = Math.max(nodeCount ?? 0, highest + 1, ...current.map((c) => c + 1))
  if (total <= 0) return <p className="text-sm text-slate-muted">No nodes yet.</p>
  const n = Math.min(total, MAX_NODES)
  const r = Math.max(46, n * 9)
  const size = 2 * r + 2 * NODE_R + 12
  const c = size / 2
  const pos = (i: number) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) }
  }
  const drawn = edges.filter(([a, b]) => a < n && b < n && a >= 0 && b >= 0)
  const here = new Set(current)
  return (
    <div>
      <div className="overflow-x-auto">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" className="mx-auto block max-w-full"
          aria-label={`graph with ${total} nodes and ${edges.length} edges: ${fmt(value, 80)}`} data-testid="graph-scene">
          {drawn.map(([a, b], i) => {
            const p = pos(a), q = pos(b)
            return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--color-slate-muted)" strokeWidth={1.5} strokeOpacity={0.7} />
          })}
          {Array.from({ length: n }, (_, i) => {
            const p = pos(i)
            const isHere = here.has(i), isSeen = visited.has(i)
            return (
              <g key={i} data-node={i} data-state={isHere ? 'current' : isSeen ? 'visited' : 'idle'}>
                <circle cx={p.x} cy={p.y} r={NODE_R} strokeWidth={isHere ? 3 : 1.5}
                  className={`transition-colors duration-300 motion-reduce:transition-none ${isHere ? 'fill-copper-50 stroke-copper' : isSeen ? 'fill-copper-50 stroke-navy' : 'fill-surface stroke-navy'}`} />
                <text x={p.x} y={p.y + 4} textAnchor="middle" className="fill-ink font-mono text-[12px]">{i}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="mt-1 text-xs text-slate-muted">
        {total} nodes, {edges.length} edges{total > n ? ` (first ${n} drawn)` : ''}
        {here.size > 0 && <> · on node {[...here].join(', ')}</>}
        {visited.size > 0 && <> · marked: {[...visited].sort((a, b) => a - b).join(', ')}</>}
      </p>
    </div>
  )
}
