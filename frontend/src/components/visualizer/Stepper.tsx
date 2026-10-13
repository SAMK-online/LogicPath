import { useEffect, type KeyboardEvent } from 'react'

interface Props {
  index: number
  total: number
  playing: boolean
  speed: number
  onIndex: (i: number) => void
  onPlaying: (p: boolean) => void
  onSpeed: (s: number) => void
  label?: string
}

const SPEEDS = [0.5, 1, 2, 4]

/** Play/pause, step back/forward, scrubber and speed. Arrow keys step when the control group has focus. */
export function Stepper({ index, total, playing, speed, onIndex, onPlaying, onSpeed, label }: Props) {
  const last = total - 1
  useEffect(() => {
    if (!playing) return
    if (index >= last) { onPlaying(false); return }
    const t = setTimeout(() => onIndex(Math.min(index + 1, last)), 900 / speed)
    return () => clearTimeout(t)
  }, [playing, index, last, speed, onIndex, onPlaying])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); onIndex(Math.min(index + 1, last)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onIndex(Math.max(index - 1, 0)) }
  }
  const btn = 'btn-ghost !px-2.5 !py-1 text-xs'
  return (
    <div role="group" aria-label="Trace controls" onKeyDown={onKey} className="flex flex-wrap items-center gap-2">
      {/* aria-disabled (not `disabled`) so keyboard focus is not dropped when the end of the trace is reached */}
      <button className={`${btn} ${index === 0 ? 'opacity-50' : ''}`} onClick={() => { onPlaying(false); onIndex(0) }} aria-disabled={index === 0} aria-label="First step">⏮</button>
      <button className={`${btn} ${index === 0 ? 'opacity-50' : ''}`} onClick={() => { onPlaying(false); onIndex(Math.max(index - 1, 0)) }} aria-disabled={index === 0}>◀ Back</button>
      <button className="btn-accent !px-3 !py-1 text-xs" onClick={() => { if (index >= last) onIndex(0); onPlaying(!playing) }} disabled={total === 0}>
        {playing ? '⏸ Pause' : '▶ Play'}
      </button>
      <button className={`${btn} ${index >= last ? 'opacity-50' : ''}`} onClick={() => { onPlaying(false); onIndex(Math.min(index + 1, last)) }} aria-disabled={index >= last}>Next ▶</button>
      <input type="range" min={0} max={Math.max(last, 0)} value={index} aria-label="Step" aria-valuetext={`Step ${index + 1} of ${total}`}
        onChange={(e) => { onPlaying(false); onIndex(Number(e.target.value)) }} className="min-w-24 flex-1 accent-copper" />
      <span className="text-xs tabular-nums text-slate-muted" data-testid="step-counter">Step {total ? index + 1 : 0} of {total}{label ? ` · ${label}` : ''}</span>
      <label className="flex items-center gap-1 text-xs text-slate-muted">Speed
        <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))} className="rounded border border-line bg-white px-1 py-0.5">
          {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
      </label>
    </div>
  )
}
