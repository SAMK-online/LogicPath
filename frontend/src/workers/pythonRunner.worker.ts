/// <reference lib="webworker" />
import HARNESS from './harness.py?raw'

// Pyodide is fetched from a CDN at runtime (pin the version here, override with VITE_PYODIDE_URL for self-hosting).
const PYODIDE_URL: string = (import.meta.env.VITE_PYODIDE_URL as string | undefined) ?? 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/'

interface Pyodide {
  runPython(code: string): unknown
  globals: { get(name: string): (arg: string) => string; set(name: string, value: unknown): void }
}

let pyodide: Pyodide | null = null

async function init() {
  const mod = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`)
  pyodide = (await mod.loadPyodide({ indexURL: PYODIDE_URL })) as Pyodide
  pyodide.runPython(HARNESS)
}

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data as { type: 'run' | 'trace'; id: number; payload: unknown } | { type: 'init' }
  if (msg.type === 'init') {
    try {
      await init()
      self.postMessage({ type: 'ready' })
    } catch (e) {
      self.postMessage({ type: 'init-error', message: String(e) })
    }
    return
  }
  if (msg.type === 'run' || msg.type === 'trace') {
    try {
      if (!pyodide) throw new Error('Python runtime not initialised')
      const fn = pyodide.globals.get(msg.type === 'run' ? 'run_payload' : 'trace_payload')
      // Per-test progress: Python calls this synchronously, and the page receives it even while the worker is still busy,
      // so a run that has to be killed still reports which tests finished and which one was stuck.
      pyodide.globals.set('_emit', (s: string) => self.postMessage({ type: 'progress', id: msg.id, event: JSON.parse(s) }))
      try {
        self.postMessage({ type: 'result', id: msg.id, result: JSON.parse(fn(JSON.stringify(msg.payload))) })
      } finally {
        pyodide.globals.set('_emit', null)
      }
    } catch (e) {
      const error = `Internal runner error: ${String(e)}`
      self.postMessage({ type: 'result', id: msg.id, result: { status: 'error', cases: [], steps: [], stdout: '', error } })
    }
  }
}
