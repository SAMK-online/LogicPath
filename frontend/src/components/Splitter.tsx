import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

/** A number kept in localStorage (wrapped in try/catch: storage can be blocked). */
export function useStoredNumber(key: string, initial: number, min: number, max: number): [number, (n: number) => void, () => void] {
  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, n)), [min, max])
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      const n = raw === null ? NaN : Number(raw)
      return Number.isFinite(n) ? clamp(n) : initial
    } catch { return initial }
  })
  useEffect(() => { try { localStorage.setItem(key, String(value)) } catch { /* ignore */ } }, [key, value])
  return [value, (n) => setValue(clamp(n)), () => setValue(initial)]
}

interface Props {
  orientation: 'vertical' | 'horizontal' // vertical bar = resizes widths; horizontal bar = resizes heights
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  onReset?: () => void
  label: string
  /** true when growing the pointer position should SHRINK the value (panel on the right / bottom) */
  invert?: boolean
  className?: string
}

/** Draggable, keyboard-operable divider (WAI-ARIA window splitter). Double-click resets. */
export function Splitter({ orientation, value, min, max, onChange, onReset, label, invert = false, className = '' }: Props) {
  const start = useRef<{ pos: number; value: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const vertical = orientation === 'vertical'

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    start.current = { pos: vertical ? e.clientX : e.clientY, value }
    setDragging(true)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    const delta = (vertical ? e.clientX : e.clientY) - start.current.pos
    onChange(start.current.value + (invert ? -delta : delta))
  }
  const up = () => { start.current = null; setDragging(false) }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16
    const grow = vertical ? 'ArrowRight' : 'ArrowDown'
    const shrink = vertical ? 'ArrowLeft' : 'ArrowUp'
    if (e.key !== grow && e.key !== shrink && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    if (e.key === 'Home') onChange(min)
    else if (e.key === 'End') onChange(max)
    else onChange(value + (e.key === grow ? step : -step) * (invert ? -1 : 1))
  }

  return (
    <div role="separator" aria-orientation={orientation} aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={max}
      tabIndex={0} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key} onDoubleClick={onReset}
      title="Drag to resize. Double-click to reset."
      className={`group relative z-10 shrink-0 touch-none select-none ${vertical ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'} ${className}`}>
      <span aria-hidden className={`absolute transition-colors motion-reduce:transition-none ${vertical ? 'inset-y-0 left-1/2 w-px -translate-x-1/2' : 'inset-x-0 top-1/2 h-px -translate-y-1/2'} ${dragging ? 'bg-copper' : 'bg-line group-hover:bg-copper/60 group-focus-visible:bg-copper'}`} />
      <span aria-hidden className={`absolute rounded-full bg-line transition-colors group-hover:bg-copper/60 ${dragging ? '!bg-copper' : ''} ${vertical ? 'left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2' : 'left-1/2 top-1/2 h-1 w-8 -translate-x-1/2 -translate-y-1/2'}`} />
    </div>
  )
}
