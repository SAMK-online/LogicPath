import type { CaseResult, RunResult } from '../../services/pythonRunner'
import { RichText } from '../RichText'

const HEADLINE: Record<RunResult['status'], string> = {
  passed: 'All tests passed', failed: 'Some tests failed', error: 'Your code could not run', timeout: 'Time limit exceeded',
}
const human = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)

function Pill({ c }: { c: CaseResult }) {
  const [tone, icon, text] = c.passed ? ['bg-ok-50 text-ok', '✓', 'Passed'] : c.timed_out ? ['bg-warn-50 text-warn', '⏱', 'Too slow'] : ['bg-bad-50 text-bad', '✕', 'Failed']
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${tone}`}><span aria-hidden>{icon}</span>{text}</span>
}

function Row({ c }: { c: CaseResult }) {
  return (
    <tr className={`border-t border-line align-top ${c.passed ? '' : c.timed_out ? 'bg-warn-50/50' : 'bg-bad-50/40'}`} data-testid={`case-${c.id}`}>
      <td className="px-3 py-2 tabular-nums text-slate-muted">{c.id}</td>
      <td className="px-3 py-2 font-mono">
        {c.label && <div className="mb-0.5 font-sans text-[11px] font-medium text-slate-muted">{c.label}</div>}
        {c.input}
      </td>
      <td className="px-3 py-2 font-mono">{c.expected}</td>
      <td className="px-3 py-2 font-mono">
        {c.actual || <span className="text-slate-muted">—</span>}
        {c.error && <div className={`mt-1 whitespace-pre-wrap font-sans ${c.timed_out ? 'text-warn' : 'text-bad'}`}>{c.error}</div>}
      </td>
      <td className="px-3 py-2">
        <Pill c={c} />
        {c.perf && c.ms != null && <div className="mt-1 tabular-nums text-slate-muted" data-testid={`ms-${c.id}`}>{human(c.ms)}</div>}
      </td>
    </tr>
  )
}

export function TestResultsPanel({ result, running, notice, runtime, constraints = [] }: {
  result: RunResult | null; running: boolean; notice: string | null; runtime: string; constraints?: string[]
}) {
  if (running) {
    return (
      <div role="status" className="flex items-center gap-2.5 p-5 text-sm text-slate-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-copper motion-reduce:animate-none" aria-hidden />
        Running tests…{runtime === 'loading' ? ' (first run downloads the Python runtime)' : ''}
      </div>
    )
  }
  if (!result) {
    return (
      <div className="p-5 text-sm text-slate-muted">
        {notice ? <p role="alert" className="text-bad">{notice}</p> : <p>Run your code to see test results here.</p>}
      </div>
    )
  }
  const ok = result.status === 'passed'
  const pct = result.total ? Math.round((100 * result.passed) / result.total) : 0
  const ordinary = result.cases.filter((c) => !c.perf)
  const perf = result.cases.filter((c) => c.perf)
  // Correct on the ordinary tests but failing the big ones: the problem is efficiency, not logic.
  const tooSlow = ordinary.length > 0 && ordinary.every((c) => c.passed) && perf.some((c) => !c.passed)
  return (
    <div className="space-y-3 p-4 text-sm" aria-live="polite">
      <div className={`overflow-hidden rounded-lg border ${ok ? 'border-ok/25 bg-ok-50 text-ok' : 'border-bad/25 bg-bad-50 text-bad'}`}>
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <strong className="font-semibold">{HEADLINE[result.status]}</strong>
          <span data-testid="summary" className="tabular-nums">{result.passed}/{result.total} passed · {result.durationMs} ms</span>
        </div>
        <div aria-hidden className="h-1 bg-black/5"><div className={`h-full ${ok ? 'bg-ok' : 'bg-bad'}`} style={{ width: `${pct}%` }} /></div>
      </div>

      {tooSlow && (
        <div data-testid="speed-nudge" className="rounded-lg border border-copper/30 bg-copper-50 px-3.5 py-3 leading-relaxed">
          <p className="font-semibold">Correct on the small tests, but not fast enough for the largest inputs.</p>
          <p className="mt-1 text-ink/80">The remaining tests use inputs as large as the constraints allow. How many steps does your approach take when the input is that big?</p>
          {constraints.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink/80 marker:text-copper" aria-label="Constraints">
              {constraints.map((c, i) => <li key={i}><RichText text={c} className="inline" /></li>)}
            </ul>
          )}
        </div>
      )}

      {notice && <p role="alert" className="rounded-lg border border-warn/25 bg-warn-50 px-3 py-2 text-warn">{notice}</p>}
      {result.error && <pre role="alert" className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-bad/25 bg-surface p-3 font-mono text-xs leading-relaxed text-bad">{result.error}</pre>}

      {result.cases.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-paper text-xs text-slate-muted">
              <tr><th className="px-3 py-1.5 font-semibold">#</th><th className="px-3 font-semibold">Input</th><th className="px-3 font-semibold">Expected</th><th className="px-3 font-semibold">Actual</th><th className="px-3 font-semibold">Result</th></tr>
            </thead>
            <tbody>
              {ordinary.map((c) => <Row key={c.id} c={c} />)}
              {perf.length > 0 && (
                <tr className="border-t border-line bg-paper"><th colSpan={5} scope="colgroup" className="px-3 py-1.5 text-left text-xs font-medium text-slate-muted">
                  Performance tests: inputs as large as the constraints allow
                </th></tr>
              )}
              {perf.map((c) => <Row key={c.id} c={c} />)}
            </tbody>
          </table>
        </div>
      )}

      {result.stdout && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-slate-muted">Printed output</summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-paper p-2.5 font-mono text-xs">{result.stdout}</pre>
        </details>
      )}
    </div>
  )
}
