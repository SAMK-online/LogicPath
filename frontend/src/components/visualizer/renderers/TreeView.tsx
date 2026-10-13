import { fmt, isTree, type Snap } from '../../../services/trace'

interface Node { id: number; label: string; left?: Node; right?: Node; depth: number; x: number }

/** Build a tree from a LeetCode-style level-order list (null = missing child). */
export function buildTree(values: (Snap | undefined)[]): Node | null {
  if (values.length === 0 || values[0] === null || values[0] === undefined) return null
  const nodes: (Node | null)[] = values.map((v, id) => (v === null || v === undefined ? null : { id, label: fmt(v, 6), depth: 0, x: 0 }))
  const kids = nodes.slice(1)[Symbol.iterator]()
  const queue = [nodes[0]!]
  for (let q = 0; q < queue.length; q++) {
    const n = queue[q]
    const l = kids.next(), r = kids.next()
    if (l.done) break
    if (l.value) { n.left = l.value; queue.push(l.value) }
    if (!r.done && r.value) { n.right = r.value; queue.push(r.value) }
  }
  return nodes[0]
}

/** In-order x positions, depth for y: simple, stable, no layout dependency needed for binary trees. */
function layout(root: Node): { nodes: Node[]; edges: [Node, Node][]; width: number; height: number } {
  const nodes: Node[] = [], edges: [Node, Node][] = []
  let col = 0
  const walk = (n: Node, depth: number) => {
    n.depth = depth
    if (n.left) { walk(n.left, depth + 1); edges.push([n, n.left]) }
    n.x = col++
    nodes.push(n)
    if (n.right) { walk(n.right, depth + 1); edges.push([n, n.right]) }
  }
  walk(root, 0)
  return { nodes, edges, width: col, height: Math.max(...nodes.map((n) => n.depth)) + 1 }
}

const DX = 44, DY = 52, R = 17

export function TreeView({ value }: { value: Snap }) {
  if (!isTree(value)) return <p className="text-sm text-slate-muted">Not a tree right now: {fmt(value)}</p>
  const root = buildTree(value.v)
  if (!root) return <p className="text-sm text-slate-muted">Empty tree (None)</p>
  const { nodes, edges, width, height } = layout(root)
  const W = width * DX + 10, H = height * DY + 10
  const cx = (n: Node) => n.x * DX + DX / 2 + 5, cy = (n: Node) => n.depth * DY + R + 5
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`binary tree with ${nodes.length} nodes: ${fmt(value, 80)}`} className="max-w-full overflow-visible">
      {edges.map(([a, b], i) => <line key={i} x1={cx(a)} y1={cy(a)} x2={cx(b)} y2={cy(b)} stroke="#64748B" strokeWidth="1.5" />)}
      {nodes.map((n) => (
        <g key={n.id}>
          <circle cx={cx(n)} cy={cy(n)} r={R} fill={n === root ? '#F8EFE9' : '#fff'} stroke="#11233B" strokeWidth="1.5" />
          <text x={cx(n)} y={cy(n) + 4} textAnchor="middle" fontSize="12" fontFamily="ui-monospace, monospace" fill="#11233B">{n.label}</text>
        </g>
      ))}
    </svg>
  )
}
