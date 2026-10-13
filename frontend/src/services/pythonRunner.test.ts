import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PythonRunner, type WorkerLike } from './pythonRunner'
import { problem } from '../test/fixtures'

class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null
  onerror: WorkerLike['onerror'] = null
  terminated = false
  received: any[] = []
  behaviour: 'ok' | 'hang' | 'init-fail' | 'crash'
  name: string
  /** progress events to emit (like the real worker does) before going quiet */
  progress: unknown[] = []
  constructor(behaviour: 'ok' | 'hang' | 'init-fail' | 'crash', name = 'w') {
    this.behaviour = behaviour
    this.name = name
  }
  postMessage(msg: any) {
    this.received.push(msg)
    queueMicrotask(() => {
      if (this.terminated) return
      if (msg.type === 'init') {
        if (this.behaviour === 'init-fail') this.onmessage?.({ data: { type: 'init-error', message: 'boom' } } as MessageEvent)
        else this.onmessage?.({ data: { type: 'ready' } } as MessageEvent)
      } else if (msg.type === 'run' || msg.type === 'trace') {
        if (this.behaviour === 'hang') {
          for (const event of this.progress) this.onmessage?.({ data: { type: 'progress', id: msg.id, event } } as MessageEvent)
          return // infinite loop: never answers
        }
        if (this.behaviour === 'crash') return this.onerror?.({} as ErrorEvent)
        if (msg.type === 'trace') return this.onmessage?.({ data: { type: 'result', id: msg.id, result: { status: 'ok', steps: [{ line: 1 }], truncated: false, error: null, result: 3, expected: 3, stdout: '', args: [] } } } as MessageEvent)
        this.onmessage?.({ data: { type: 'result', id: msg.id, result: { status: 'passed', stdout: '', error: null,
          cases: msg.payload.tests.map((t: any) => ({ id: t.id, input: '', expected: '', actual: '', passed: true, error: null })) } } } as MessageEvent)
      }
    })
  }
  terminate() { this.terminated = true }
}
const req = { code: 'x', signature: problem.function_signature, tests: problem.test_cases, comparison: 'exact' }

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe('PythonRunner', () => {
  it('runs code via the worker and reports pass counts', async () => {
    const w = new FakeWorker('ok')
    const r = await new PythonRunner({ createWorker: () => w }).run(req)
    expect(r).toMatchObject({ status: 'passed', passed: 2, total: 2 })
    expect(w.received.find((m) => m.type === 'run').payload.tests).toHaveLength(2) // structured test data, not strings
  })

  it('terminates a hung worker on timeout and boots a fresh one for the next run', async () => {
    const workers: FakeWorker[] = []
    const runner = new PythonRunner({ runTimeoutMs: 1000, createWorker: () => { const w = new FakeWorker(workers.length === 0 ? 'hang' : 'ok', `w${workers.length}`); workers.push(w); return w } })
    const first = runner.run(req)
    await vi.advanceTimersByTimeAsync(1100)
    const r1 = await first
    expect(r1.status).toBe('timeout')
    expect(r1.error).toMatch(/Time limit exceeded/)
    expect(workers[0].terminated).toBe(true)

    const r2 = await runner.run(req) // recovers
    expect(workers).toHaveLength(2)
    expect(workers[1].terminated).toBe(false)
    expect(r2.status).toBe('passed')
  })

  it('reports a friendly error if the runtime cannot load, and retries with a new worker later', async () => {
    let n = 0
    const workers: FakeWorker[] = []
    const runner = new PythonRunner({ createWorker: () => { const w = new FakeWorker(n++ === 0 ? 'init-fail' : 'ok'); workers.push(w); return w } })
    await expect(runner.run(req)).rejects.toThrow(/Could not load the Python runtime/)
    expect(runner.state).toBe('failed')
    expect(workers[0].terminated).toBe(true)
    expect((await runner.run(req)).status).toBe('passed')
  })

  it('recovers from a worker crash', async () => {
    let n = 0
    const runner = new PythonRunner({ createWorker: () => new FakeWorker(n++ === 0 ? 'crash' : 'ok') })
    const r = await runner.run(req)
    expect(r.status).toBe('error')
    expect(r.error).toMatch(/crashed/)
    expect((await runner.run(req)).status).toBe('passed')
  })

  it('traces ONE test case with a step budget, via the same worker', async () => {
    const w = new FakeWorker('ok')
    const t = await new PythonRunner({ createWorker: () => w }).trace({ code: 'x', signature: problem.function_signature, test: problem.test_cases[1], maxSteps: 123 })
    expect(t.status).toBe('ok')
    const msg = w.received.find((m) => m.type === 'trace')
    expect(msg.payload).toMatchObject({ test: problem.test_cases[1], maxSteps: 123, signature: problem.function_signature })
    expect(msg.payload).not.toHaveProperty('tests')
  })

  it('a trace that never finishes is killed like a run, and the runner recovers', async () => {
    const workers: FakeWorker[] = []
    const runner = new PythonRunner({ runTimeoutMs: 500, createWorker: () => { const w = new FakeWorker(workers.length === 0 ? 'hang' : 'ok'); workers.push(w); return w } })
    const p = runner.trace({ code: 'x', signature: problem.function_signature, test: problem.test_cases[0] })
    await vi.advanceTimersByTimeAsync(600)
    const t = await p
    expect(t).toMatchObject({ status: 'timeout', steps: [] })
    expect(t.error).toMatch(/Time limit exceeded/)
    expect(workers[0].terminated).toBe(true)
    expect((await runner.trace({ code: 'x', signature: problem.function_signature, test: problem.test_cases[0] })).status).toBe('ok')
  })

  it('when a run is killed, finished tests are kept and the stuck test is named', async () => {
    const w = new FakeWorker('hang')
    const case1 = { id: 1, input: 'nums=[2, 7]', expected: '[0, 1]', actual: '[0, 1]', passed: true, error: null }
    w.progress = [{ start: { id: 1, input: 'nums=[2, 7]' } }, { case: case1 },
      { start: { id: 2, input: 'nums=<list of 20,000 items>', label: '20,000 numbers', perf: true } }]
    const tests = [{ id: 1, args: [[2, 7], 9], expected: [0, 1] }, { id: 2, args: [{ $gen: 'range' }, 5], expected: { $gen: 'range' }, perf: true }]
    const runner = new PythonRunner({ runTimeoutMs: 500, createWorker: () => w })
    const p = runner.run({ code: 'x', signature: problem.function_signature, tests, comparison: 'exact' })
    await vi.advanceTimersByTimeAsync(600)
    const r = await p
    expect(r.status).toBe('timeout')
    expect(r.passed).toBe(1)
    expect(r.total).toBe(2)
    expect(r.error).toBeNull() // the message lives on the stuck case
    expect(r.cases).toHaveLength(2)
    expect(r.cases[0]).toMatchObject({ id: 1, passed: true })
    expect(r.cases[1]).toMatchObject({ id: 2, passed: false, timed_out: true, perf: true, label: '20,000 numbers', expected: '(generated)' })
    expect(r.cases[1].error).toMatch(/did not finish within 1 s/)
    expect(w.terminated).toBe(true)
  })

  it('a kill before any test has started still reports a plain timeout', async () => {
    const w = new FakeWorker('hang')
    const runner = new PythonRunner({ runTimeoutMs: 500, createWorker: () => w })
    const p = runner.run(req)
    await vi.advanceTimersByTimeAsync(600)
    const r = await p
    expect(r).toMatchObject({ status: 'timeout', cases: [], passed: 0 })
    expect(r.error).toMatch(/Time limit exceeded/)
  })

  it('a crash during a trace is reported', async () => {
    let n = 0
    const runner = new PythonRunner({ createWorker: () => new FakeWorker(n++ === 0 ? 'crash' : 'ok') })
    const t = await runner.trace({ code: 'x', signature: problem.function_signature, test: problem.test_cases[0] })
    expect(t.status).toBe('error')
    expect(t.error).toMatch(/crashed/)
  })

  it('reuses one worker across runs (warm runtime)', async () => {
    let created = 0
    const runner = new PythonRunner({ createWorker: () => { created++; return new FakeWorker('ok') } })
    await runner.run(req); await runner.run(req)
    expect(created).toBe(1)
  })
})
