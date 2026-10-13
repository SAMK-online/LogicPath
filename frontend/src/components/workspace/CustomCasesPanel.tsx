import { useState, type FormEvent } from 'react'
import type { CustomCases } from '../../hooks/useCustomCases'
import { buildCase, MAX_CUSTOM_CASES } from '../../services/customCases'
import { fmt, fromJson } from '../../services/trace'
import type { Problem } from '../../types/api'

const short = (v: unknown) => fmt(fromJson(v), 80)

/** Try the code on inputs of your own. Experimental: kept in memory, never saved or counted as progress. */
export function CustomCasesPanel({ problem, custom, busy, onVisualize }: { problem: Problem; custom: CustomCases; busy: boolean; onVisualize: (id: number) => void }) {
  const sig = problem.function_signature
  const sample = problem.test_cases.find((t) => !t.perf)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [expected, setExpected] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const built = buildCase(sig, texts, expected, 0)
    if (built.errors) { setErrors(built.errors); return }
    setErrors({})
    custom.add((id) => ({ ...built.case, id, label: `Custom ${-id}` }))
    setTexts({}); setExpected('')
  }
  const disabled = busy || custom.running

  const field = (key: string, label: string, hint: string, value: string, set: (v: string) => void, example: unknown, required: boolean) => (
    <div key={key}>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-muted">
        <span><span className="font-mono text-ink">{label}</span> <span className="font-normal">{hint}{required ? '' : ' (optional)'}</span></span>
        <input className="input !py-1.5 font-mono" value={value} onChange={(e) => set(e.target.value)} placeholder={example === undefined ? '' : short(example)}
          aria-invalid={errors[key] ? true : undefined} aria-describedby={errors[key] ? `custom-err-${key}` : undefined} spellCheck={false} autoComplete="off" />
      </label>
      {errors[key] && <p id={`custom-err-${key}`} role="alert" className="mt-1 text-xs text-bad">{errors[key]}</p>}
    </div>
  )

  return (
    <div className="space-y-3 p-4 text-sm" data-testid="custom-cases">
      <p className="rounded-lg border border-copper/25 bg-copper-50 px-3 py-2 text-xs text-ink/80">
        Experimental. These cases run only in your browser, are not saved, and do not count toward your progress.
      </p>

      <form onSubmit={submit} className="space-y-2.5" aria-label="Add a custom case">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {sig.params.map((p, i) => field(p.name, p.name, p.type, texts[p.name] ?? '', (v) => setTexts((t) => ({ ...t, [p.name]: v })), sample?.args[i], true))}
        </div>
        {field('expected', 'expected output', sig.return_type, expected, setExpected, sample?.expected, false)}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-accent !py-1.5 text-xs" disabled={!custom.canAdd}>Add case</button>
          <span className="text-xs text-slate-muted">
            {custom.canAdd ? 'Leave expected empty to just see what your code returns.' : `You can keep up to ${MAX_CUSTOM_CASES} cases. Remove one to add another.`}
          </span>
        </div>
      </form>

      {custom.notice && <pre role="alert" className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-bad/25 bg-surface p-3 font-mono text-xs text-bad">{custom.notice}</pre>}

      {custom.cases.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-muted">Your cases</h3>
            <button className="btn-ghost !py-1 text-xs" onClick={() => void custom.run()} disabled={disabled}>{custom.running ? 'Running…' : 'Run all'}</button>
          </div>
          {custom.cases.map((t) => {
            const r = custom.results[t.id]
            return (
              <div key={t.id} className="rounded-lg border border-line bg-surface p-3" data-testid={`custom-${-t.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">{t.label}</span>
                  <span className="flex gap-1.5">
                    <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => void custom.run([t.id])} disabled={disabled}>Run</button>
                    <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => onVisualize(t.id)} disabled={disabled}>Visualize</button>
                    <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => custom.remove(t.id)} aria-label={`Remove ${t.label}`}>Remove</button>
                  </span>
                </div>
                <p className="mt-1.5 break-words font-mono text-xs text-slate-muted">{sig.params.map((p, i) => `${p.name}=${short(t.args[i])}`).join(', ')}</p>
                {!t.unchecked && <p className="mt-0.5 break-words font-mono text-xs text-slate-muted">expected {short(t.expected)}</p>}
                {r && (
                  <div className="mt-2 border-t border-line pt-2 text-xs" aria-live="polite">
                    {r.error ? <p className="whitespace-pre-wrap text-bad">{r.error}</p> : (
                      <p className="break-words font-mono"><span className="font-sans text-slate-muted">Your code returned </span>{r.actual}</p>
                    )}
                    {!r.error && !t.unchecked && (
                      <p className={`mt-1 font-medium ${r.passed ? 'text-ok' : 'text-bad'}`}>{r.passed ? '✓ Matches your expected output' : '✕ Does not match your expected output'}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
