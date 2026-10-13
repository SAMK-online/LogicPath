import type { ExecutionStatus, FunctionSignature, TestCase } from '../types/api'
import type { Trace } from './trace'

export interface CaseResult {
  id: number; input: string; expected: string; actual: string; passed: boolean; error: string | null
  /** constraint-sized test */
  perf?: boolean
  label?: string | null
  /** time the student's function took, in ms */
  ms?: number | null
  /** correct answer, but over the time limit */
  timed_out?: boolean
}
interface StartEvent { id: number; input: string; label?: string | null; perf?: boolean }
type ProgressEvent = { start: StartEvent } | { case: CaseResult }
export interface RunResult {
  status: ExecutionStatus
  cases: CaseResult[]
  stdout: string
  error: string | null
  passed: number
  total: number
  durationMs: number
}
export interface RunRequest { code: string; signature: FunctionSignature; tests: TestCase[]; comparison: string }
export interface TraceRequest { code: string; signature: FunctionSignature; test: TestCase; maxSteps?: number }
export const DEFAULT_MAX_STEPS = 500

const expectedLabel = (v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) && '$gen' in v ? '(generated)' : JSON.stringify(v)?.slice(0, 200) ?? '')
export type RuntimeState = 'idle' | 'loading' | 'ready' | 'failed'

/** Minimal Worker surface so tests can inject a fake. */
export interface WorkerLike {
  postMessage(msg: unknown): void
  terminate(): void
  onmessage: ((ev: MessageEvent) => void) | null
  onerror: ((ev: ErrorEvent) => void) | null
}

export interface RunnerOptions {
  createWorker?: () => WorkerLike
  runTimeoutMs?: number
  initTimeoutMs?: number
}

export const DEFAULT_RUN_TIMEOUT_MS = 8000

/**
 * Runs student code in a Web Worker. If a run exceeds the timeout (infinite loop) the worker is TERMINATED
 * and a fresh one is created on the next run, so a stuck student program can never hang the page.
 */
export class PythonRunner {
  private worker: WorkerLike | null = null
  private ready: Promise<void> | null = null
  private nextId = 1
  private listeners = new Set<(s: RuntimeState) => void>()
  state: RuntimeState = 'idle'
  private readonly createWorker: () => WorkerLike
  private readonly runTimeoutMs: number
  private readonly initTimeoutMs: number

  constructor(opts: RunnerOptions = {}) {
    this.createWorker = opts.createWorker ?? (() => new Worker(new URL('../workers/pythonRunner.worker.ts', import.meta.url), { type: 'module' }) as WorkerLike)
    this.runTimeoutMs = opts.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS
    this.initTimeoutMs = opts.initTimeoutMs ?? 60_000
  }

  subscribe(fn: (s: RuntimeState) => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private setState(s: RuntimeState) { this.state = s; this.listeners.forEach((l) => l(s)) }

  /** Start loading Pyodide ahead of the first Run click. */
  warmUp(): void { this.ensureWorker().catch(() => { /* surfaced on run */ }) }

  private ensureWorker(): Promise<void> {
    if (this.ready) return this.ready
    this.setState('loading')
    const worker = this.createWorker()
    this.worker = worker
    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => fail(new Error('Timed out while loading the Python runtime.')), this.initTimeoutMs)
      const fail = (err: Error) => {
        clearTimeout(timer)
        this.discard(worker)
        this.setState('failed')
        reject(err)
      }
      worker.onmessage = (ev) => {
        if (ev.data?.type === 'ready') { clearTimeout(timer); this.setState('ready'); resolve() }
        else if (ev.data?.type === 'init-error') fail(new Error('Could not load the Python runtime. It is downloaded from a CDN, so check your internet connection.'))
      }
      worker.onerror = () => fail(new Error('The Python runtime crashed while loading.'))
      worker.postMessage({ type: 'init' })
    })
    return this.ready
  }

  private discard(worker: WorkerLike) {
    worker.terminate()
    if (this.worker === worker) { this.worker = null; this.ready = null }
  }

  /** Send one job to the worker; on timeout or crash the worker is discarded and `fallback` builds the result. */
  private async job<T>(type: 'run' | 'trace', payload: unknown, fallback: (kind: 'timeout' | 'crash') => T, onProgress?: (e: ProgressEvent) => void): Promise<T> {
    await this.ensureWorker()
    const worker = this.worker!
    const id = this.nextId++

    return new Promise<T>((resolve) => {
      const finish = (value: T) => {
        clearTimeout(timer)
        worker.onmessage = null
        worker.onerror = null
        resolve(value)
      }
      const timer = setTimeout(() => {
        // Infinite loop or far too slow: kill the worker; the next job boots a fresh one.
        this.discard(worker)
        this.setState('idle')
        finish(fallback('timeout'))
      }, this.runTimeoutMs)

      worker.onmessage = (ev) => {
        if (ev.data?.type === 'result' && ev.data.id === id) finish(ev.data.result as T)
        else if (ev.data?.type === 'progress' && ev.data.id === id) onProgress?.(ev.data.event as ProgressEvent)
      }
      worker.onerror = () => {
        this.discard(worker)
        this.setState('idle')
        finish(fallback('crash'))
      }
      worker.postMessage({ type, id, payload })
    })
  }

  private get timeoutMessage() {
    return `Time limit exceeded: your code ran for more than ${Math.round(this.runTimeoutMs / 1000)} seconds. Check for an infinite loop.`
  }

  async run(req: RunRequest): Promise<RunResult> {
    const started = performance.now()
    const total = req.tests.length
    const finished: CaseResult[] = []
    let current: StartEvent | null = null
    const secs = Math.round(this.runTimeoutMs / 1000)

    const raw = await this.job<Omit<RunResult, 'durationMs' | 'passed' | 'total'> & Partial<Pick<RunResult, 'passed'>>>(
      'run', { code: req.code, signature: req.signature, tests: req.tests, comparison: req.comparison },
      (kind) => {
        if (kind === 'crash') return { status: 'error', cases: [...finished], stdout: '', error: 'The Python runtime crashed. It will restart on the next run.' }
        const stuck = current && req.tests.find((t) => t.id === current!.id)
        if (!current || !stuck) return { status: 'timeout', cases: [...finished], stdout: '', error: this.timeoutMessage }
        // The run was killed while this test was executing. Show everything that finished, and name the test that did not.
        return {
          status: 'timeout', stdout: '', error: null,
          cases: [...finished, {
            id: current.id, input: current.input, expected: expectedLabel(stuck.expected), actual: '', passed: false, timed_out: true,
            perf: current.perf, label: current.label, ms: null,
            error: `Time limit exceeded: this test did not finish within ${secs} s and was stopped. This input is within the constraints, so the solution has to scale to it. How does the work your code does grow with the size of the input?`,
          }],
        }
      },
      (e) => { if ('start' in e) current = e.start; else { finished.push(e.case); current = null } },
    )
    return { ...raw, passed: raw.passed ?? raw.cases.filter((c) => c.passed).length, total, durationMs: Math.round(performance.now() - started) }
  }

  /** Step-by-step trace of the student's function on ONE test case (bounded by `maxSteps`). */
  async trace(req: TraceRequest): Promise<Trace> {
    return this.job<Trace>(
      'trace', { code: req.code, signature: req.signature, test: req.test, maxSteps: req.maxSteps ?? DEFAULT_MAX_STEPS },
      (kind) => ({ status: kind === 'timeout' ? 'timeout' : 'error', steps: [], truncated: false, result: null, expected: null, stdout: '', args: [],
        error: kind === 'timeout' ? this.timeoutMessage : 'The Python runtime crashed. It will restart on the next run.' }),
    )
  }

  dispose() {
    if (this.worker) this.discard(this.worker)
    this.setState('idle')
  }
}

let shared: PythonRunner | null = null
export function getPythonRunner(): PythonRunner { return (shared ??= new PythonRunner()) }
