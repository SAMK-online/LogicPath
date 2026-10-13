import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Splitter, useStoredNumber } from '../components/Splitter'
import { EditorPanel } from '../components/workspace/EditorPanel'
import { ProblemPanel } from '../components/workspace/ProblemPanel'
import { TestResultsPanel } from '../components/workspace/TestResultsPanel'
import { TutorPanel } from '../components/workspace/TutorPanel'
import { DifficultyBadge, ErrorNotice, Skeleton } from '../components/ui'
import { useWorkspace } from '../hooks/useWorkspace'
import { getPythonRunner } from '../services/pythonRunner'

type Tab = 'problem' | 'code' | 'tutor'
type BottomTab = 'results' | 'visualize'
// The visualizer is only needed when opened, so keep it (and its renderers) out of the main bundle.
const VisualizerPanel = lazy(() => import('../components/visualizer/VisualizerPanel'))

function WorkspaceSkeleton() {
  return (
    <div className="grid h-full gap-px bg-line lg:grid-cols-[360px_1fr_380px]" aria-busy="true" aria-label="Opening workspace…">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 bg-white p-5">
          <Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-32" />
        </div>
      ))}
    </div>
  )
}

export function WorkspacePage() {
  const { problemId = '' } = useParams()
  const [params] = useSearchParams()
  const roadmapId = params.get('roadmap')
  const ws = useWorkspace(problemId, roadmapId)
  const [tab, setTab] = useState<Tab>('code')
  const [showResults, setShowResults] = useState(true)
  const [bottom, setBottom] = useState<BottomTab>('results')
  const [highlightLine, setHighlightLine] = useState<number | null>(null)
  // Adjustable layout, remembered between visits.
  const [left, setLeft, resetLeft] = useStoredNumber('sdt.layout.left', 360, 260, 560)
  const [right, setRight, resetRight] = useStoredNumber('sdt.layout.right', 380, 300, 600)
  const [bottomH, setBottomH, resetBottomH] = useStoredNumber('sdt.layout.bottom', 300, 140, 640)
  const runner = getPythonRunner()
  const runtime = useSyncExternalStore((cb) => runner.subscribe(cb), () => runner.state)

  // Warn before leaving with unsaved edits.
  const dirty = ws.saveState === 'dirty' || ws.saveState === 'error'
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  if (ws.loadError) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <ErrorNotice onRetry={ws.reload}>{ws.loadError}</ErrorNotice>
        <Link to="/dashboard" className="mt-4 inline-block text-sm underline">Back to dashboard</Link>
      </div>
    )
  }
  if (!ws.problem || !ws.session) return <WorkspaceSkeleton />

  const backTo = roadmapId ? `/roadmaps/${roadmapId}` : '/'
  const tabs: [Tab, string][] = [['problem', 'Problem'], ['code', 'Code'], ['tutor', 'Tutor']]
  const show = (t: Tab) => (tab === t ? 'flex' : 'hidden') + ' lg:flex'
  const resetLayout = () => { resetLeft(); resetRight(); resetBottomH() }
  const gridVars = { '--left': `${left}px`, '--right': `${right}px` } as CSSProperties

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 py-2 text-sm">
        <Link to={backTo} className="shrink-0 text-slate-muted hover:text-navy">← {roadmapId ? 'Roadmap' : 'Dashboard'}</Link>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="truncate font-medium">{ws.problem.title}</span>
          <DifficultyBadge level={ws.problem.difficulty} />
        </div>
        <button className="hidden shrink-0 text-xs text-slate-muted hover:text-navy lg:block" onClick={resetLayout} title="Restore the default panel sizes">Reset layout</button>
        <span className="w-16 lg:hidden" />
      </div>

      <div role="tablist" aria-label="Workspace sections" className="flex shrink-0 border-b border-line bg-white lg:hidden">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex-1 py-2.5 text-sm font-medium ${tab === id ? 'border-b-2 border-copper text-navy' : 'text-slate-muted'}`}>{label}</button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[var(--left)_auto_minmax(0,1fr)_auto_var(--right)]" style={gridVars}>
        <section aria-label="Problem" className={`${show('problem')} min-h-0 min-w-0 flex-col bg-white`}>
          <ProblemPanel problem={ws.problem} />
        </section>

        <Splitter orientation="vertical" label="Resize problem panel" value={left} min={260} max={560} onChange={setLeft} onReset={resetLeft} className="hidden lg:block" />

        <section aria-label="Code editor" className={`${show('code')} min-h-0 min-w-0 flex-col bg-paper`}>
          <div className="min-h-0 flex-1">
            <EditorPanel code={ws.code} onChange={ws.setCode} onSave={() => void ws.save()} onRun={() => void ws.run()}
              saveState={ws.saveState} running={ws.running} saveError={ws.saveError} highlightLine={highlightLine} />
          </div>
          {showResults && (
            <Splitter orientation="horizontal" label="Resize output panel" value={bottomH} min={140} max={640} invert onChange={setBottomH} onReset={resetBottomH} />
          )}
          <div className="flex min-h-0 shrink-0 flex-col bg-white" style={showResults ? { height: bottomH, maxHeight: '75%' } : undefined}>
            <div className="flex shrink-0 items-center justify-between border-t border-line pr-2">
              <div role="tablist" aria-label="Output" className="flex">
                {([['results', 'Test results'], ['visualize', 'Visualize']] as const).map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={bottom === id} onClick={() => { setBottom(id); setShowResults(true) }}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${bottom === id ? 'border-b-2 border-copper text-navy' : 'border-b-2 border-transparent text-slate-muted hover:text-navy'}`}>{label}</button>
                ))}
              </div>
              <button className="rounded px-2 py-1 text-slate-muted hover:bg-navy-50 hover:text-navy" aria-expanded={showResults} aria-label={showResults ? 'Collapse panel' : 'Expand panel'}
                onClick={() => setShowResults((s) => !s)}>{showResults ? '▾' : '▸'}</button>
            </div>
            {showResults && (
              <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
                {bottom === 'results' ? (
                  <TestResultsPanel result={ws.runResult} running={ws.running} notice={ws.runNotice} runtime={runtime} constraints={ws.problem.constraints} />
                ) : (
                  <Suspense fallback={<div className="space-y-2 p-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-24" /></div>}>
                    <VisualizerPanel problem={ws.problem} code={ws.code} savedCode={ws.savedCode} sessionId={ws.session.id} runner={runner}
                      onHighlightLine={setHighlightLine} onSynced={ws.markSaved} />
                  </Suspense>
                )}
              </div>
            )}
          </div>
        </section>

        <Splitter orientation="vertical" label="Resize tutor panel" value={right} min={300} max={600} invert onChange={setRight} onReset={resetRight} className="hidden lg:block" />

        <section aria-label="Tutor" className={`${show('tutor')} min-h-0 min-w-0 flex-col bg-paper`}>
          <TutorPanel messages={ws.messages} sending={ws.sending} error={ws.chatError} hintLevel={ws.hintLevel} tutorMode={ws.session.tutor_mode}
            hasUnsavedChanges={ws.saveState === 'dirty'} onSend={ws.sendChat} onHint={() => void ws.requestHint()} onReview={() => void ws.reviewApproach()} />
        </section>
      </div>
    </div>
  )
}
