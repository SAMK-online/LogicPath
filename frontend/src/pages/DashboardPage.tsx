import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DifficultyBadge, ErrorNotice, ProgressBar, Skeleton, StatusDot } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { api, errorMessage } from '../services/api'
import type { Progress, ProgressItem, RoadmapSummary } from '../types/api'

const when = (iso: string | null) => {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`
  return `${Math.round(mins / 1440)} d ago`
}
const workspaceLink = (p: ProgressItem) => `/workspace/${p.problem_id}${p.roadmap_id ? `?roadmap=${p.roadmap_id}` : ''}`

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <p className="font-display text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm text-slate-muted">{label}</p>
    </div>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[] | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    Promise.all([api.roadmaps(), api.progress()])
      .then(([r, p]) => { setRoadmaps(r); setProgress(p) })
      .catch((e) => setError(errorMessage(e)))
  }, [])
  useEffect(load, [load])

  const firstName = user?.name.split(' ')[0]
  const resume = progress?.recent.find((p) => p.status !== 'completed')
  const runs = progress?.problems.reduce((n, p) => n + p.attempts, 0) ?? 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Welcome, {firstName}</h1>
      <p className="mt-2 text-slate-muted">
        {progress ? `${progress.completed} of ${progress.total_available} available problems completed.` : 'Pick up where you left off.'}
      </p>

      {error && <div className="mt-6"><ErrorNotice onRetry={load}>{error}</ErrorNotice></div>}

      {!progress && !error && <div className="mt-8 grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
      {progress && (
        <div className="mt-8 flex gap-12 border-y border-line py-5" aria-label="Your progress">
          <Stat value={progress.completed} label="Completed" />
          <Stat value={progress.in_progress} label="In progress" />
          <Stat value={runs} label="Test runs" />
        </div>
      )}

      {resume && (
        <Link to={workspaceLink(resume)} className="mt-6 flex items-center justify-between gap-4 rounded-lg border-l-4 border-copper bg-white px-5 py-4 shadow-card transition-shadow hover:shadow-raise">
          <div>
            <p className="text-sm text-slate-muted">Pick up where you left off</p>
            <p className="mt-1 font-display text-xl font-semibold">{resume.title}</p>
            <p className="mt-0.5 text-xs text-slate-muted">{resume.attempts} {resume.attempts === 1 ? 'run' : 'runs'} · {when(resume.last_attempted_at)}</p>
          </div>
          <span className="btn-accent shrink-0" aria-hidden>Resume</span>
        </Link>
      )}

      {!roadmaps && !error && (
        <div className="mt-10 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      )}
      {roadmaps && (
        <section className="mt-10" aria-labelledby="roadmaps-h">
          <h2 id="roadmaps-h" className="label">Learning roadmaps</h2>
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white shadow-card">
            {roadmaps.map((r) => {
              const started = r.completed_problems > 0 || progress?.problems.some((p) => p.roadmap_id === r.id)
              return (
                <li key={r.id} aria-label={r.title} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-display text-xl font-semibold">{r.title}</h3>
                      <DifficultyBadge level={r.difficulty} />
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-muted">{r.description}</p>
                  </div>
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs text-slate-muted">
                      <span>{r.completed_problems} / {r.total_problems} completed</span>
                      <span className="tabular-nums">{r.progress_percent}%</span>
                    </div>
                    <ProgressBar percent={r.progress_percent} label={`${r.title} progress`} />
                    {r.available_problems < r.total_problems && (
                      <p className="mt-1.5 text-xs text-slate-muted">{r.available_problems} of {r.total_problems} problems are ready to practise.</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {r.next_problem_id ? (
                      <Link className="btn-accent" to={`/workspace/${r.next_problem_id}?roadmap=${r.id}`}>{started ? 'Continue Learning' : 'Start Learning'}</Link>
                    ) : (
                      <span className="btn-ghost cursor-default">All done</span>
                    )}
                    <Link className="btn-ghost" to={`/roadmaps/${r.id}`}>View</Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {progress && (
        <section className="mt-10" aria-labelledby="recent-h">
          <h2 id="recent-h" className="label">Recently attempted</h2>
          {progress.recent.length === 0 ? (
            <div className="card mt-2 border-dashed px-6 py-10 text-center text-sm text-slate-muted">Nothing yet. Open a roadmap and start your first problem.</div>
          ) : (
            <ul className="card mt-2 divide-y divide-line overflow-hidden">
              {progress.recent.map((p) => (
                <li key={p.problem_id}>
                  <Link className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-paper" to={workspaceLink(p)}>
                    <span className="flex items-center gap-3"><StatusDot status={p.status} /><span className="font-medium">{p.title}</span></span>
                    <span className="flex items-center gap-4 text-xs text-slate-muted">
                      <DifficultyBadge level={p.difficulty} />
                      <span className="hidden w-16 text-right sm:inline">{p.attempts} {p.attempts === 1 ? 'run' : 'runs'}</span>
                      <span className="hidden w-20 text-right sm:inline">{when(p.last_attempted_at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
