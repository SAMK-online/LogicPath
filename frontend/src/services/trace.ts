/** Types and pure helpers for the visualizer: snapshots from the Python tracer, view inference, and AI spec validation. */

export type Snap =
  | null | boolean | number | string
  | { t: 'list' | 'tuple' | 'set'; n: number; v: Snap[] }
  | { t: 'dict'; n: number; v: [Snap, Snap][] }
  | { t: 'tree'; v: Snap[] }
  | { t: 'obj'; v: string }

export interface TraceStep {
  line: number
  event: 'call' | 'line' | 'return' | 'exception'
  depth: number
  locals: Record<string, Snap>
  ret?: Snap
  exc?: string
}

export interface Trace {
  status: 'ok' | 'error' | 'timeout'
  steps: TraceStep[]
  truncated: boolean
  error: string | null
  result: Snap
  expected: Snap
  stdout: string
  args: string[]
}

type Obj = Exclude<Snap, null | boolean | number | string>
export const isObj = (s: Snap): s is Obj => typeof s === 'object' && s !== null
export const isList = (s: Snap): s is Extract<Obj, { t: 'list' | 'tuple' | 'set' }> => isObj(s) && (s.t === 'list' || s.t === 'tuple' || s.t === 'set')
export const isDict = (s: Snap): s is Extract<Obj, { t: 'dict' }> => isObj(s) && s.t === 'dict'
export const isTree = (s: Snap): s is Extract<Obj, { t: 'tree' }> => isObj(s) && s.t === 'tree'

/** Short human-readable form of a snapshot (for the variable table, captions and the AI request). */
export function fmt(s: Snap, max = 60): string {
  const raw = fmtFull(s)
  return raw.length > max ? raw.slice(0, max - 1) + '…' : raw
}
function fmtFull(s: Snap): string {
  if (s === null) return 'None'
  if (typeof s === 'boolean') return s ? 'True' : 'False'
  if (typeof s === 'number') return String(s)
  if (typeof s === 'string') return JSON.stringify(s)
  switch (s.t) {
    case 'list': return `[${s.v.map(fmtFull).join(', ')}${s.n > s.v.length ? ', …' : ''}]`
    case 'tuple': return `(${s.v.map(fmtFull).join(', ')}${s.n > s.v.length ? ', …' : ''})`
    case 'set': return `{${s.v.map(fmtFull).join(', ')}${s.n > s.v.length ? ', …' : ''}}`
    case 'dict': return `{${s.v.map(([k, v]) => `${fmtFull(k)}: ${fmtFull(v)}`).join(', ')}${s.n > s.v.length ? ', …' : ''}}`
    case 'tree': return `Tree(${s.v.map((x) => (x === null ? 'None' : fmtFull(x))).join(', ')})`
    case 'obj': return s.v
  }
}

export const kindOfSnap = (s: Snap): string => {
  if (s === null) return 'none'
  if (typeof s === 'boolean') return 'bool'
  if (typeof s === 'number') return Number.isInteger(s) ? 'int' : 'float'
  if (typeof s === 'string') return 'str'
  return s.t === 'tuple' ? 'list' : s.t // tuples are drawn like lists
}

/** Convert raw JSON test data (args / expected output) into snapshots so the same renderers can draw it. */
export function fromJson(value: unknown, type = ''): Snap {
  if (type.startsWith('Optional[TreeNode]') && Array.isArray(value)) return { t: 'tree', v: value.map((x) => fromJson(x)) }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value
  if (Array.isArray(value)) return { t: 'list', n: value.length, v: value.slice(0, 50).map((x) => fromJson(x)) }
  if (typeof value === 'object') {
    const e = Object.entries(value as Record<string, unknown>)
    return { t: 'dict', n: e.length, v: e.slice(0, 50).map(([k, v]) => [k, fromJson(v)] as [Snap, Snap]) }
  }
  return { t: 'obj', v: String(value) }
}

export const same = (a: Snap | undefined, b: Snap | undefined) => JSON.stringify(a) === JSON.stringify(b)

/** Names of variables whose value differs from the previous step (or that are new). */
export function changedVars(prev: TraceStep | undefined, cur: TraceStep): Set<string> {
  const out = new Set<string>()
  for (const [k, v] of Object.entries(cur.locals)) if (!prev || !(k in prev.locals) || !same(prev.locals[k], v)) out.add(k)
  return out
}

// ---------------------------------------------------------------- views ---
export type ViewKind = 'array' | 'string' | 'map' | 'stack' | 'list' | 'tree' | 'scalar'
export const VIEW_KINDS: ViewKind[] = ['array', 'string', 'map', 'stack', 'list', 'tree', 'scalar']
export interface ViewSpec { var: string; kind: ViewKind; pointers?: string[]; title?: string }
export interface Caption { step: number; text: string }
export interface VisualSpec { views: ViewSpec[]; captions: Caption[]; summary?: string }

const POINTER_NAME = /^(i|j|k|l|r|lo|hi|low|high|left|right|mid|start|end|idx|index|p|q|slow|fast|pos|cur|curr|ptr\w*)$/i
const STACK_NAME = /(^|_)(stack|stk|st)$/i
export const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/

/** Per-variable kind seen anywhere in the trace (first non-None wins). */
export function varKinds(trace: Trace): Record<string, string> {
  const out: Record<string, string> = {}
  for (const step of trace.steps) {
    for (const [k, v] of Object.entries(step.locals)) if (v !== null || !(k in out)) out[k] = kindOfSnap(v) // a later non-None value wins over None
  }
  return out
}

/** Heuristic mapping from variables to renderers. Used when there is no AI spec, or the AI spec is invalid. */
export function inferViews(trace: Trace): ViewSpec[] {
  const kinds = varKinds(trace)
  const names = Object.keys(kinds)
  const ordered = [...trace.args.filter((a) => a in kinds), ...names.filter((n) => !trace.args.includes(n))]
  const views: ViewSpec[] = []
  for (const name of ordered) {
    const k = kinds[name]
    if (k === 'list') views.push({ var: name, kind: STACK_NAME.test(name) ? 'stack' : 'array' })
    else if (k === 'str') views.push({ var: name, kind: 'string' })
    else if (k === 'dict' || k === 'set') views.push({ var: name, kind: 'map' })
    else if (k === 'tree') views.push({ var: name, kind: 'tree' })
  }
  const pointers = names.filter((n) => kinds[n] === 'int' && POINTER_NAME.test(n))
  const firstSeq = views.find((v) => v.kind === 'array' || v.kind === 'string')
  if (firstSeq && pointers.length) firstSeq.pointers = pointers
  return views.slice(0, 6)
}

// ------------------------------------------------------- AI request body ---
export interface CompactTrace {
  steps: { i: number; line: number; vars: Record<string, string> }[]
  total_steps: number
  truncated: boolean
  error: string | null
  result: string
  expected: string
  var_kinds: Record<string, string>
}
export const MAX_COMPACT_STEPS = 60

/** A bounded summary of the trace for the AI: ≤60 steps, ≤8 short variables each. */
export function compactTrace(trace: Trace): CompactTrace {
  const n = trace.steps.length
  const picks = new Set<number>()
  if (n <= MAX_COMPACT_STEPS) for (let i = 0; i < n; i++) picks.add(i)
  else {
    picks.add(0); picks.add(n - 1)
    const slots = MAX_COMPACT_STEPS - 2
    for (let s = 1; s <= slots; s++) picks.add(Math.round((s * (n - 1)) / (slots + 1)))
  }
  const steps = [...picks].sort((a, b) => a - b).map((i) => {
    const st = trace.steps[i]
    const keys = Object.keys(st.locals).filter((k) => IDENT.test(k))
    keys.sort((a, b) => Number(trace.args.includes(b)) - Number(trace.args.includes(a)))
    const vars: Record<string, string> = {}
    for (const k of keys.slice(0, 8)) vars[k] = fmt(st.locals[k], 60)
    return { i, line: st.line, vars }
  })
  const kinds = Object.entries(varKinds(trace)).filter(([k]) => IDENT.test(k)).slice(0, 12)
  return {
    steps, total_steps: n, truncated: trace.truncated, error: trace.error ? trace.error.slice(0, 300) : null,
    result: fmt(trace.result, 200), expected: fmt(trace.expected, 200), var_kinds: Object.fromEntries(kinds),
  }
}

// ------------------------------------------------------- spec validation ---
const MAX_VIEWS = 6
const MAX_CAPTIONS = 40
const BAD_TEXT = /[<>]|```/

/** Strict client-side validation of a spec coming from the server (defence in depth: the server validates too). */
export function parseSpec(raw: unknown, knownVars?: Set<string>): VisualSpec | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.views) || r.views.length === 0 || r.views.length > MAX_VIEWS) return null
  const views: ViewSpec[] = []
  for (const v of r.views) {
    if (typeof v !== 'object' || v === null) return null
    const o = v as Record<string, unknown>
    if (typeof o.var !== 'string' || !IDENT.test(o.var) || !VIEW_KINDS.includes(o.kind as ViewKind)) return null
    if (knownVars && !knownVars.has(o.var)) continue
    const ptrs = Array.isArray(o.pointers) ? o.pointers.filter((p): p is string => typeof p === 'string' && IDENT.test(p) && (!knownVars || knownVars.has(p))).slice(0, 6) : undefined
    const title = typeof o.title === 'string' && !BAD_TEXT.test(o.title) ? o.title.slice(0, 60) : undefined
    views.push({ var: o.var, kind: o.kind as ViewKind, ...(ptrs?.length ? { pointers: ptrs } : {}), ...(title ? { title } : {}) })
  }
  if (views.length === 0) return null
  const captions: Caption[] = []
  if (r.captions !== undefined) {
    if (!Array.isArray(r.captions) || r.captions.length > MAX_CAPTIONS) return null
    for (const c of r.captions) {
      const o = c as Record<string, unknown>
      if (typeof c !== 'object' || c === null || !Number.isInteger(o.step) || (o.step as number) < 0 || typeof o.text !== 'string') return null
      if (o.text.length > 160 || BAD_TEXT.test(o.text)) continue // drop a suspicious caption rather than render it
      captions.push({ step: o.step as number, text: o.text })
    }
  }
  const summary = typeof r.summary === 'string' && r.summary.length <= 300 && !BAD_TEXT.test(r.summary) ? r.summary : undefined
  return { views, captions: captions.sort((a, b) => a.step - b.step), ...(summary ? { summary } : {}) }
}

/** Latest caption at or before `step` (captions describe a moment; they stay up until the next one). */
export function captionAt(spec: VisualSpec | null, step: number): string | null {
  if (!spec) return null
  let found: string | null = null
  for (const c of spec.captions) if (c.step <= step) found = c.text
  return found
}
