import { fmt, type TraceStep } from '../../services/trace'

/** All local variables at the current step; ones that changed since the previous step are flagged. */
export function VariablePanel({ step, changed }: { step: TraceStep; changed: Set<string> }) {
  const entries = Object.entries(step.locals)
  return (
    <div className="text-sm">
      <h3 className="label">Variables</h3>
      {entries.length === 0 ? <p className="text-xs text-slate-muted">No variables yet.</p> : (
        <table className="w-full text-left text-xs">
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k} className={`border-t border-line ${changed.has(k) ? 'bg-copper-50' : ''}`} data-testid={`var-${k}`}>
                <td className="w-5 py-1 text-copper" aria-label={changed.has(k) ? 'changed' : undefined}>{changed.has(k) ? '●' : ''}</td>
                <td className="py-1 pr-3 font-mono font-medium">{k}</td>
                <td className="py-1 font-mono">{fmt(v, 80)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {step.event === 'return' && <p className="mt-2 text-xs">Returns <code className="font-mono">{fmt(step.ret ?? null, 80)}</code></p>}
      {step.event === 'exception' && <p role="alert" className="mt-2 text-xs text-bad">Exception: {step.exc}</p>}
    </div>
  )
}
