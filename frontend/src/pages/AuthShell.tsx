import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo, Wordmark } from '../components/ui'

const STEPS = [
  ['Write', 'Solve real problems in a browser editor. Python runs privately on your machine.'],
  ['Test', 'Run structured test cases and see exactly which input fails and why.'],
  ['Think', 'A tutor that reads your code asks the right question instead of handing you the answer.'],
] as const

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 text-white lg:flex">
        <svg aria-hidden className="pointer-events-none absolute -right-24 -top-24 opacity-[0.07]" width="520" height="520" viewBox="0 0 520 520" fill="none" stroke="#fff">
          {Array.from({ length: 9 }, (_, i) => <circle key={i} cx="260" cy="260" r={30 + i * 28} />)}
        </svg>
        <Link to="/" className="relative flex items-center gap-2.5"><Logo size={30} onDark /><Wordmark onDark className="text-xl" /></Link>
        <div className="relative max-w-lg">
          <h2 className="font-display text-3xl font-semibold leading-[1.15]">A tutor that builds your instinct instead of giving answers</h2>
          <ol className="mt-10 space-y-5">
            {STEPS.map(([h, p], i) => (
              <li key={h} className="flex gap-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/20 text-xs font-semibold text-copper-100">{i + 1}</span>
                <div><p className="font-medium">{h}</p><p className="mt-0.5 text-sm leading-relaxed text-white/60">{p}</p></div>
              </li>
            ))}
          </ol>
        </div>
        <p className="relative text-xs text-white/40">Python only. Your code runs in your browser.</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden"><Logo size={32} /><Wordmark className="text-lg" /></div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-muted">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <p className="mt-7 text-center text-sm text-slate-muted">{footer}</p>
        </div>
      </main>
    </div>
  )
}
