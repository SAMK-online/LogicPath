import { DifficultyBadge } from '../ui'
import { RichText } from '../RichText'
import type { Problem } from '../../types/api'

export function ProblemPanel({ problem }: { problem: Problem }) {
  const sig = problem.function_signature
  return (
    <div className="scroll-quiet h-full overflow-y-auto px-6 py-5">
      <p className="eyebrow">{problem.topic}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2.5">
        <h1 className="font-display text-2xl font-semibold leading-tight">{problem.title}</h1>
        <DifficultyBadge level={problem.difficulty} />
      </div>
      <p className="sr-only">Topic: {problem.topic}</p>

      <RichText className="mt-4 text-[15px] leading-relaxed text-navy/90" text={problem.description} />

      <h2 className="label mt-7">Function to implement</h2>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-paper p-3 font-mono text-xs leading-relaxed">
        {`def ${sig.name}(${sig.params.map((p) => `${p.name}: ${p.type}`).join(', ')}) -> ${sig.return_type}`}
      </pre>
      <p className="mt-2 text-xs leading-relaxed text-slate-muted">
        <strong className="font-semibold text-navy/80">Input:</strong> {sig.params.map((p) => `${p.name} (${p.type})`).join(', ')}. <strong className="font-semibold text-navy/80">Output:</strong> {sig.return_type}.
        Return the answer; don't print it.
      </p>

      {problem.examples.length > 0 && (
        <>
          <h2 className="label mt-7">Examples</h2>
          <div className="space-y-3">
            {problem.examples.map((e, i) => (
              <div key={i} className="overflow-hidden rounded-lg border border-line">
                <div className="border-b border-line bg-paper px-3 py-1 text-xs font-medium text-slate-muted">Example {i + 1}</div>
                <dl className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                  <dt className="text-slate-muted">Input</dt><dd><code className="break-words font-mono text-xs">{e.input}</code></dd>
                  <dt className="text-slate-muted">Output</dt><dd><code className="break-words font-mono text-xs">{e.output}</code></dd>
                  {e.explanation && <dd className="col-span-2 pt-0.5 text-xs leading-relaxed text-slate-muted">{e.explanation}</dd>}
                </dl>
              </div>
            ))}
          </div>
        </>
      )}

      {problem.constraints.length > 0 && (
        <>
          <h2 className="label mt-7">Constraints</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm marker:text-copper">
            {problem.constraints.map((c, i) => <li key={i}><RichText text={c} className="inline" /></li>)}
          </ul>
          {problem.test_cases.some((t) => t.perf) && (
            <p data-testid="perf-note" className="mt-3 rounded-lg border border-copper/25 bg-copper-50 px-3 py-2 text-xs leading-relaxed text-navy/80">
              The constraints are real: some tests use inputs as large as they allow, and every one has a time limit. A solution that is correct but slow will not pass them.
            </p>
          )}
        </>
      )}
    </div>
  )
}
