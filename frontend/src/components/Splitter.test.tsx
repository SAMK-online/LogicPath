import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Splitter, useStoredNumber } from './Splitter'

beforeEach(() => localStorage.clear())

describe('Splitter', () => {
  const setup = (over: Partial<React.ComponentProps<typeof Splitter>> = {}) => {
    const onChange = vi.fn(), onReset = vi.fn()
    render(<Splitter orientation="vertical" label="Resize problem panel" value={300} min={200} max={500} onChange={onChange} onReset={onReset} {...over} />)
    return { onChange, onReset, el: screen.getByRole('separator', { name: 'Resize problem panel' }) }
  }

  it('is an accessible, focusable separator exposing its value range', () => {
    const { el } = setup()
    expect(el).toHaveAttribute('aria-orientation', 'vertical')
    expect(el).toHaveAttribute('aria-valuenow', '300')
    expect(el).toHaveAttribute('aria-valuemin', '200')
    expect(el).toHaveAttribute('aria-valuemax', '500')
    expect(el).toHaveAttribute('tabindex', '0')
  })

  it('resizes with arrow keys (Shift for bigger steps) and Home/End', async () => {
    const { el, onChange } = setup()
    el.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith(316)
    await userEvent.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith(284)
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    expect(onChange).toHaveBeenLastCalledWith(364)
    await userEvent.keyboard('{Home}')
    expect(onChange).toHaveBeenLastCalledWith(200)
    await userEvent.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith(500)
  })

  it('inverts direction for panels anchored on the far side', async () => {
    const { el, onChange } = setup({ invert: true })
    el.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith(284)
  })

  it('uses up/down for a horizontal bar', async () => {
    const { el, onChange } = setup({ orientation: 'horizontal', label: 'Resize problem panel' })
    el.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith(316)
  })

  it('drags with the pointer relative to where the drag started', () => {
    const { el, onChange } = setup()
    fireEvent.pointerDown(el, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(el, { clientX: 140, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(340)
    fireEvent.pointerUp(el, { pointerId: 1 })
    fireEvent.pointerMove(el, { clientX: 400, pointerId: 1 })
    expect(onChange).toHaveBeenCalledTimes(1) // no more changes after release
  })

  it('double-click resets', async () => {
    const { el, onReset } = setup()
    await userEvent.dblClick(el)
    expect(onReset).toHaveBeenCalled()
  })
})

describe('useStoredNumber', () => {
  it('starts at the default, clamps, persists, and resets', () => {
    const { result, unmount } = renderHook(() => useStoredNumber('k', 300, 200, 500))
    expect(result.current[0]).toBe(300)
    act(() => result.current[1](9999))
    expect(result.current[0]).toBe(500)
    act(() => result.current[1](10))
    expect(result.current[0]).toBe(200)
    expect(localStorage.getItem('k')).toBe('200')
    unmount()
    expect(renderHook(() => useStoredNumber('k', 300, 200, 500)).result.current[0]).toBe(200) // restored
    const r = renderHook(() => useStoredNumber('k', 300, 200, 500))
    act(() => r.result.current[2]())
    expect(r.result.current[0]).toBe(300)
  })

  it('ignores garbage and out-of-range stored values', () => {
    localStorage.setItem('a', 'banana'); localStorage.setItem('b', '99999')
    expect(renderHook(() => useStoredNumber('a', 300, 200, 500)).result.current[0]).toBe(300)
    expect(renderHook(() => useStoredNumber('b', 300, 200, 500)).result.current[0]).toBe(500)
  })

  it('still works when storage is blocked', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const { result } = renderHook(() => useStoredNumber('x', 300, 200, 500))
    expect(result.current[0]).toBe(300)
    act(() => result.current[1](350))
    expect(result.current[0]).toBe(350)
    get.mockRestore(); set.mockRestore()
  })
})
