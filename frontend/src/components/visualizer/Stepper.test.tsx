import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'

function Harness({ total = 4 }: { total?: number }) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  return <Stepper index={index} total={total} playing={playing} speed={speed} onIndex={setIndex} onPlaying={setPlaying} onSpeed={setSpeed} />
}

describe('Stepper', () => {
  it('steps forward and back, and disables buttons at the ends', async () => {
    render(<Harness />)
    expect(screen.getByTestId('step-counter')).toHaveTextContent('Step 1 of 4')
    expect(screen.getByRole('button', { name: /Back/ })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByTestId('step-counter')).toHaveTextContent('Step 3 of 4')
    await userEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(screen.getByTestId('step-counter')).toHaveTextContent('Step 2 of 4')
    await userEvent.click(screen.getByRole('button', { name: 'First step' }))
    expect(screen.getByTestId('step-counter')).toHaveTextContent('Step 1 of 4')
  })

  it('has a scrubber and responds to arrow keys', async () => {
    render(<Harness />)
    const slider = screen.getByRole('slider', { name: 'Step' })
    expect(slider).toHaveAttribute('max', '3')
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    // focus is on the Next button now; keydown bubbles to the control group
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByTestId('step-counter')).toHaveTextContent('Step 4 of 4')
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByTestId('step-counter')).toHaveTextContent('Step 3 of 4')
  })

  it('shows the speed options', async () => {
    render(<Harness />)
    await userEvent.selectOptions(screen.getByLabelText('Speed'), '4')
    expect(screen.getByLabelText('Speed')).toHaveValue('4')
  })
})

describe('Stepper autoplay', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('plays through the steps and stops at the end; pause stops it', async () => {
    render(<Harness total={3} />)
    await userEvent.click(screen.getByRole('button', { name: /Play/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(950) })
    expect(screen.getByTestId('step-counter')).toHaveTextContent('Step 2 of 3')
    await userEvent.click(screen.getByRole('button', { name: /Pause/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.getByTestId('step-counter')).toHaveTextContent('Step 2 of 3')
    await userEvent.click(screen.getByRole('button', { name: /Play/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.getByTestId('step-counter')).toHaveTextContent('Step 3 of 3')
    expect(screen.getByRole('button', { name: /Play/ })).toBeInTheDocument() // stopped by itself
  })
})
