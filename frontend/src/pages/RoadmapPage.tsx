import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DifficultyBadge, ErrorNotice, ProgressBar, ProgressRing, Skeleton, StatusDot, statusLabel } from '../components/ui'
import { api, errorMessage } from '../services/api'
import type { RoadmapDetail } from '../types/api'

export function RoadmapPage() {
  const { roadmapId = '' } = useParams()
  const [roadmap, setRoadmap] = useState<RoadmapDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    setRoadmap(null)
    api.roadmap(roadmapId).then(setRoadmap).catch((e) => setError(errorMessage(e)))
  }, [roadmapId])
  useEffect(load, [load])

  if (error) return <div className="mx-auto max-w-4xl px-4 py-10"><ErrorNotice onRetry={load}>{error}</ErrorNotice></div>
  if (!roadmap) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-10">
        <Skeleton className="h-6 w-32" /><Skeleton className="h-10 w-80" /><Skeleton className="h-28" /><Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link to="/dashboard" className="text-sm text-slate-muted hover:text-navy">← Dashboard</Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight">{roadmap.title}</h1>
        <DifficultyBadge level={roadmap.difficulty} />
      </div>
      <p className="mt-2 max-w-2xl leading-relaxed text-slate-muted">{roadmap.description}</p>

      <div className="card mt-7 flex flex-wrap items-center gap-5 p-5">
        <ProgressRing percent={roadmap.progress_percent} />
        <div className="min-w-48 flex-1">
          <p className="text-sm font-medium">{roadmap.completed_problems} of {roadmap.total_problems} completed</p>
          <div className="mt-2"><ProgressBar percent={roadmap.progress_percent} label="Roadmap progress" size="sm" /></div>
          {roadmap.available_problems < roadmap.total_problems && (
            <p className="mt-2 text-xs text-slate-muted">
              {roadmap.available_problems} of {roadmap.total_problems} problems are ready. The rest keep the established list intact and are marked <em>coming soon</em>.
            </p>
          )}
        </div>
        {roadmap.next_problem_id && (
          <Link className="btn-accent" to={`/workspace/${roadmap.next_problem_id}?roadmap=${roadmap.id}`}>Continue Learning</Link>
        )}
      </div>

      <div className="mt-10">
        {roadmap.topics.map((t, i) => {
          const done = t.total > 0 && t.completed === t.total
          const started = t.completed > 0 || t.problems.some((p) => p.status === 'in_progress')
          return (
            <section key={t.name} aria-labelledby={`topic-${i}`} className="relative pb-8 pl-9 last:pb-0">
              {/* timeline rail + status node */}
              {i < roadmap.topics.length - 1 && <span aria-hidden className="absolute bottom-0 left-[11px] top-7 w-px bg-line" />}
              <span aria-hidden className={`absolute left-0 top-1 grid h-6 w-6 place-items-center rounded-full border-2 bg-paper ${done ? 'border-ok bg-ok text-white' : started ? 'border-copper' : 'border-line'}`}>
                {done ? <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.2l2.3 2.3 4.7-4.9" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  : started ? <span className="h-2 w-2 rounded-full bg-copper" /> : null}
              </span>
              <div className="mb-3 flex items-center gap-3">
                <h2 id={`topic-${i}`} className="font-display text-xl font-semibold">{i + 1}. {t.name}</h2>
                <span className="ml-auto rounded-full bg-navy-50 px-2 py-0.5 text-xs tabular-nums text-slate-muted">{t.completed}/{t.total}</span>
              </div>
              <ul className="card divide-y divide-line overflow-hidden">
                {t.problems.map((p) => (
                  <li key={p.id}>
                    {p.is_available ? (
                      <Link to={`/workspace/${p.id}?roadmap=${roadmap.id}`} className="group flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-paper">
                        <span className="flex items-center gap-3"><StatusDot status={p.status} /><span className="font-medium group-hover:text-copper-600">{p.title}</span></span>
                        <span className="flex items-center gap-4"><span className="hidden text-xs text-slate-muted sm:inline">{statusLabel(p.status)}</span><DifficultyBadge level={p.difficulty} /></span>
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-slate-muted" aria-disabled="true">
                        <span className="flex items-center gap-3"><StatusDot status="not_started" /><span>{p.title}</span></span>
                        <span className="flex items-center gap-4"><span className="text-xs">Coming soon</span><DifficultyBadge level={p.difficulty} /></span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
