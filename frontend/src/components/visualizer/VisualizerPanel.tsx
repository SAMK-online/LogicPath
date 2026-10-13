import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PythonRunner } from '../../services/pythonRunner'
import { DEFAULT_MAX_STEPS } from '../../services/pythonRunner'
import { changedVars, fmt, inferViews, type Trace } from '../../services/trace'
import { caseName, isCustom } from '../../services/customCases'
import type { Problem, TestCase } from '../../types/api'
import { Spinner } from '../ui'
import { ViewRenderer } from './renderers/ViewRenderer'
import { Stepper } from './Stepper'
import { TestCaseView } from './TestCaseView'
import { VariablePanel } from './VariablePanel'

interface Props {
  problem: Problem
  code: string
  runner: PythonRunner
  onHighlightLine: (line: number | null) => void
  /** the student's own experimental cases (memory only): they can be drawn and traced */
  extraCases?: TestCase[]
  /** ask the panel to open one case and trace it; `n` changes on every request so asking twice still works */
  focus?: { id: number; n: number } | null
  onFocusHandled?: () => void
}

type Mode = 'case' | 'trace'

export default function VisualizerPanel({ problem, code, runner, onHighlightLine, extraCases = [], focus = null, onFocusHandled }: Props) {
  const [mode, setMode] = useState<Mode>('case')
  // Constraint-sized performance tests are for timing, not for drawing: the picker only offers the ordinary cases.
  const drawable = useMemo(() => [...problem.test_cases.filter((t) => !t.perf), ...extraCases], [problem.test_cases, extraCases])
  const [testId, setTestId] = useState(drawable[0]?.id ?? 0)
  const [trace, setTrace] = useState<Trace | null>(null)
  const [tracedCode, setTracedCode] = useState('')
  const [tracing, setTracing] = useState(false)
  const [traceError, setTraceError] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  const test = drawable.find((t) => t.id === testId) ?? drawable[0]
  const stale = trace !== null && code !== tracedCode
  const step = trace?.steps[index]

  // Reset everything tied to a trace when the test case changes.
  const selectTest = (id: number) => { setTestId(id); setTrace(null); setTraceError(null); setIndex(0); setPlaying(false) }

  const heuristic = useMemo(() => (trace ? inferViews(trace) : []), [trace])
  const views = heuristic

  // Highlight the executing line in the editor, but only while the editor still matches what was traced.
  useEffect(() => {
    onHighlightLine(mode === 'trace' && step && !stale ? step.line : null)
  }, [mode, step, stale, onHighlightLine])
  const clear = useRef(onHighlightLine)
  clear.current = onHighlightLine
  useEffect(() => () => clear.current(null), [])

  async function runTrace(which: TestCase | undefined = test) {
    if (!which) return
    setTracing(true); setTraceError(null); setPlaying(false)
    try {
      const t = await runner.trace({ code, signature: problem.function_signature, test: which, maxSteps: DEFAULT_MAX_STEPS })
      setTrace(t); setTracedCode(code); setIndex(0)
      if (t.error) setTraceError(t.error) // runtime errors and truncation keep the steps that did run viewable
    } catch (e) {
      setTrace(null)
      setTraceError(e instanceof Error ? e.message : 'The Python runtime failed to start.')
    } finally {
      setTracing(false)
    }
  }

  // "Visualize" on a custom case: open it and trace it straight away.
  const traceRef = useRef(runTrace)
  traceRef.current = runTrace
  const lastFocus = useRef(0)
  useEffect(() => {
    if (!focus || focus.n === lastFocus.current) return
    const target = drawable.find((t) => t.id === focus.id)
    if (!target) return
    lastFocus.current = focus.n
    selectTest(target.id); setMode('trace')
    onFocusHandled?.()
    void traceRef.current(target)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  const onIndex = useCallback((i: number) => setIndex(i), [])

  if (!test) return <p className="p-4 text-sm text-slate-muted">This problem has no test cases.</p>

  const tab = (m: Mode, label: string) => (
    <button role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setPlaying(false) }}
      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${mode === m ? 'bg-surface text-ink shadow-card' : 'text-slate-muted hover:text-ink'}`}>{label}</button>
  )
  const prevStep = index > 0 ? trace?.steps[index - 1] : undefined

  return (
    <div className="space-y-3 p-4" data-testid="visualizer">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Visualizer mode" className="flex gap-0.5 rounded-lg bg-paper p-0.5">{tab('case', 'Test case')}{tab('trace', 'Step through my code')}</div>
        <label className="flex items-center gap-2 text-xs text-slate-muted">Test case
          <select value={test.id} onChange={(e) => selectTest(Number(e.target.value))} className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink">
            {drawable.map((t) => <option key={t.id} value={t.id}>{caseName(t)}</option>)}
          </select>
        </label>
      </div>

      {mode === 'case' && <TestCaseView problem={problem} test={test} />}

      {mode === 'trace' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-accent !py-1.5 text-xs" onClick={() => void runTrace()} disabled={tracing}>{tracing ? 'Tracing…' : trace ? 'Trace again' : 'Trace my code'}</button>
            <span className="text-xs text-slate-muted">Runs your current code on {isCustom(test) ? test.label : `test #${test.id}`}.</span>
          </div>

          {tracing && <Spinner label="Tracing your code…" />}
          {traceError && <p role="alert" className="rounded-md border border-bad/20 bg-bad-50 px-3 py-2 text-xs text-bad whitespace-pre-wrap">{traceError}</p>}
          {stale && <p role="status" className="text-xs text-warn">Your code changed since this trace, so line highlighting is off. Trace again to refresh.</p>}

          {trace && trace.steps.length > 0 && step && (
            <>
              <Stepper index={index} total={trace.steps.length} playing={playing} speed={speed} onIndex={onIndex} onPlaying={setPlaying} onSpeed={setSpeed}
                label={`line ${step.line}${step.depth > 1 ? ` · depth ${step.depth}` : ''}`} />
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(200px,1fr)]">
                <div className="space-y-2">
                  {views.length === 0 && <p className="text-sm text-slate-muted">Nothing to draw for this code yet; see the variables.</p>}
                  {views.map((v) => <ViewRenderer key={v.var} view={v} step={step} prevStep={prevStep} />)}
                </div>
                <VariablePanel step={step} changed={changedVars(prevStep, step)} />
              </div>
              {index === trace.steps.length - 1 && (
                <p className="text-xs text-slate-muted" data-testid="trace-end">
                  Finished. Your function returned <code className="font-mono">{fmt(trace.result, 80)}</code>{test.unchecked ? '.' : <>; the test expected <code className="font-mono">{fmt(trace.expected, 80)}</code>.</>}
                </p>
              )}
              {trace.stdout && <details><summary className="cursor-pointer text-xs text-slate-muted">Printed output</summary><pre className="mt-1 max-h-32 overflow-auto rounded bg-navy-50 p-2 font-mono text-xs">{trace.stdout}</pre></details>}
            </>
          )}
          {!trace && !tracing && !traceError && <p className="text-sm text-slate-muted">Press <strong>Trace my code</strong> to watch your function run, one line at a time.</p>}
        </div>
      )}
    </div>
  )
}
