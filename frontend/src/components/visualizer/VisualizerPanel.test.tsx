import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PythonRunner } from '../../services/pythonRunner'
import type { Trace } from '../../services/trace'
import { problem, trace } from '../../test/fixtures'
import { apiMock } from '../../test/mockApi'
import VisualizerPanel from './VisualizerPanel'

vi.mock('../../services/api', async (orig) => ({ ...(await orig<typeof import('../../services/api')>()), api: (await import('../../test/mockApi')).apiMock }))

const runner = { trace: vi.fn() } as unknown as PythonRunner & { trace: ReturnType<typeof vi.fn> }
const onHighlightLine = vi.fn()
const CODE = 'def two_sum(nums, target):\n    pass\n'

function setup(over: Partial<React.ComponentProps<typeof VisualizerPanel>> = {}) {
  const props = { problem, code: CODE, runner, onHighlightLine, ...over }
  const view = render(<VisualizerPanel {...props} />)
  return { ...view, props }
}
const goTrace = async () => { await userEvent.click(screen.getByRole('tab', { name: 'Step through my code' })) }
const doTrace = async () => { await goTrace(); await userEvent.click(screen.getByRole('button', { name: 'Trace my code' })); await screen.findByTestId('step-counter') }
const counter = () => screen.getByTestId('step-counter')

beforeEach(() => {
  vi.clearAllMocks()
  runner.trace.mockResolvedValue(trace)
})

describe('Part 1: test-case view', () => {
  it('draws the inputs and expected output from the structured test data, without running or calling anything', () => {
    setup()
    expect(screen.getByRole('region', { name: 'nums (array)' })).toBeInTheDocument()
    expect(screen.getByLabelText('index 1: 7')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'target (value)' })).toHaveTextContent('9')
    expect(screen.getByRole('region', { name: 'expected (array)' })).toHaveTextContent('0')
    expect(runner.trace).not.toHaveBeenCalled()
    expect(apiMock.visualize).not.toHaveBeenCalled()
  })

  it('switches test cases', async () => {
    setup()
    await userEvent.selectOptions(screen.getByLabelText('Test case'), '2')
    expect(screen.getByLabelText('index 0: 3')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'target (value)' })).toHaveTextContent('6')
  })
})

describe('performance tests are not drawable', () => {
  it('only offers the ordinary test cases in the picker (a 20,000-item input is for timing, not for drawing)', () => {
    const big = { id: 3, args: [{ $gen: 'shuffled_range', n: 20000, seed: 1 }, 5], expected: [0, 1], perf: true, label: '20,000 numbers', time_limit_ms: 1000 }
    setup({ problem: { ...problem, test_cases: [...problem.test_cases, big] } })
    expect(within(screen.getByLabelText('Test case')).getAllByRole('option').map((o) => o.textContent)).toEqual(['#1', '#2'])
  })
})

describe('Part 2: step through the code', () => {
  it('traces the current code on the selected test and steps through it, highlighting the line in the editor', async () => {
    setup()
    await doTrace()
    expect(runner.trace).toHaveBeenCalledWith({ code: CODE, signature: problem.function_signature, test: problem.test_cases[0], maxSteps: 500 })
    expect(counter()).toHaveTextContent('Step 1 of 6')
    await waitFor(() => expect(onHighlightLine).toHaveBeenLastCalledWith(1))
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(counter()).toHaveTextContent('Step 3 of 6')
    expect(onHighlightLine).toHaveBeenLastCalledWith(3)
    // variables panel: `i` appears at this step and is flagged as changed
    expect(within(screen.getByTestId('var-i')).getByLabelText('changed')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'nums (array)' })).toBeInTheDocument()
    expect(screen.getByText('▲ i')).toBeInTheDocument()
  })

  it('shows how the run ended on the last step', async () => {
    setup()
    await doTrace()
    fireEvent.change(screen.getByRole('slider', { name: 'Step' }), { target: { value: '5' } })
    expect(await screen.findByTestId('trace-end')).toHaveTextContent('returned [0, 1]')
  })

  it('stays viewable when the student code raised: shows the error and the steps that ran', async () => {
    runner.trace.mockResolvedValue({ ...trace, error: 'ZeroDivisionError: division by zero (line 3)', steps: trace.steps.slice(0, 3) } satisfies Trace)
    setup()
    await doTrace()
    expect(screen.getByRole('alert')).toHaveTextContent('ZeroDivisionError')
    expect(counter()).toHaveTextContent('of 3')
  })

  it('reports syntax errors with no stepper', async () => {
    runner.trace.mockResolvedValue({ ...trace, status: 'error', steps: [], error: 'SyntaxError: invalid syntax (line 1)' } satisfies Trace)
    setup()
    await goTrace()
    await userEvent.click(screen.getByRole('button', { name: 'Trace my code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('SyntaxError')
    expect(screen.queryByTestId('step-counter')).not.toBeInTheDocument()
  })

  it('shows truncation and timeout messages', async () => {
    runner.trace.mockResolvedValue({ ...trace, truncated: true, error: 'Trace stopped after 500 steps. Your code may be looping, or it just runs for a long time.' } satisfies Trace)
    setup()
    await doTrace()
    expect(screen.getByRole('alert')).toHaveTextContent('Trace stopped after 500 steps')
  })

  it('shows a runtime-load failure', async () => {
    runner.trace.mockRejectedValue(new Error('Could not load the Python runtime.'))
    setup()
    await goTrace()
    await userEvent.click(screen.getByRole('button', { name: 'Trace my code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the Python runtime.')
  })

  it('stops highlighting when the editor no longer matches what was traced', async () => {
    const { rerender, props } = setup()
    await doTrace()
    await waitFor(() => expect(onHighlightLine).toHaveBeenLastCalledWith(1))
    rerender(<VisualizerPanel {...props} code={CODE + '# edited'} />)
    expect(await screen.findByText(/Your code changed since this trace/)).toBeInTheDocument()
    expect(onHighlightLine).toHaveBeenLastCalledWith(null)
  })

  it('clears the editor highlight when closed', async () => {
    const { unmount } = setup()
    await doTrace()
    unmount()
    expect(onHighlightLine).toHaveBeenLastCalledWith(null)
  })

  it('resets the trace when another test case is picked', async () => {
    setup()
    await doTrace()
    await userEvent.selectOptions(screen.getByLabelText('Test case'), '2')
    expect(screen.queryByTestId('step-counter')).not.toBeInTheDocument()
  })
})
