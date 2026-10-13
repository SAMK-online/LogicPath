import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/api'
import type { PythonRunner } from '../../services/pythonRunner'
import type { Trace } from '../../services/trace'
import { problem, trace } from '../../test/fixtures'
import { apiMock } from '../../test/mockApi'
import VisualizerPanel from './VisualizerPanel'

vi.mock('../../services/api', async (orig) => ({ ...(await orig<typeof import('../../services/api')>()), api: (await import('../../test/mockApi')).apiMock }))

const runner = { trace: vi.fn() } as unknown as PythonRunner & { trace: ReturnType<typeof vi.fn> }
const onHighlightLine = vi.fn()
const onSynced = vi.fn()
const CODE = 'def two_sum(nums, target):\n    pass\n'

function setup(over: Partial<React.ComponentProps<typeof VisualizerPanel>> = {}) {
  const props = { problem, code: CODE, savedCode: CODE, sessionId: 'sess-1', runner, onHighlightLine, onSynced, ...over }
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
    expect(screen.getByRole('button', { name: /AI view/ })).toBeDisabled()
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

describe('Part 3: AI view and captions (only on click)', () => {
  const okSpec = { views: [{ var: 'seen', kind: 'map' }, { var: 'nums', kind: 'array', pointers: ['i'] }], captions: [{ step: 2, text: 'i is now 0. What is in seen?' }] }
  const response = (over = {}) => ({ spec: okSpec, cached: false, code_version: 1, tutor_mode: 'live', captions_removed: false, ...over })

  it('never calls the AI by itself; the button is disabled until there is a trace', async () => {
    setup()
    await goTrace()
    expect(screen.getByRole('button', { name: /AI view/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Trace my code' }))
    await screen.findByTestId('step-counter')
    expect(apiMock.visualize).not.toHaveBeenCalled()
  })

  it('sends a compact trace, applies the returned views and shows captions at the right step', async () => {
    apiMock.visualize.mockResolvedValue(response())
    setup()
    await doTrace()
    await userEvent.click(screen.getByRole('button', { name: /AI view/ }))
    await waitFor(() => expect(apiMock.visualize).toHaveBeenCalledTimes(1))
    const body = apiMock.visualize.mock.calls[0][0]
    expect(body).toMatchObject({ session_id: 'sess-1', test_case_id: 1 })
    expect(body).not.toHaveProperty('code') // saved code matches the editor
    expect(body.trace.steps.length).toBeLessThanOrEqual(60)
    expect(body.trace.var_kinds.nums).toBe('list')
    expect(screen.queryByTestId('caption')).not.toBeInTheDocument() // step 1: before the first caption
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(await screen.findByTestId('caption')).toHaveTextContent('i is now 0. What is in seen?')
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(regions.indexOf('seen (map)')).toBeLessThan(regions.indexOf('nums (array)')) // AI order is used
  })

  it('includes the code (and tells the workspace it was saved) when the editor has unsaved edits', async () => {
    apiMock.visualize.mockResolvedValue(response())
    setup({ code: CODE + '# new', savedCode: CODE })
    await doTrace()
    await userEvent.click(screen.getByRole('button', { name: /AI view/ }))
    await waitFor(() => expect(apiMock.visualize.mock.calls[0][0].code).toBe(CODE + '# new'))
    await waitFor(() => expect(onSynced).toHaveBeenCalledWith(CODE + '# new'))
  })

  it('labels mock output and cached/filtered results', async () => {
    apiMock.visualize.mockResolvedValue(response({ tutor_mode: 'mock', cached: true, captions_removed: true }))
    setup()
    await doTrace()
    await userEvent.click(screen.getByRole('button', { name: /AI view/ }))
    expect(await screen.findByRole('note')).toHaveTextContent('not from an AI model')
    expect(screen.getByText(/Loaded a saved view/)).toBeInTheDocument()
    expect(screen.getByText(/removed by the safety filter/)).toBeInTheDocument()
  })

  it('falls back to the automatic view when the spec is unusable', async () => {
    apiMock.visualize.mockResolvedValue(response({ spec: { views: [{ var: 'nums', kind: 'hologram' }] } }))
    setup()
    await doTrace()
    await userEvent.click(screen.getByRole('button', { name: /AI view/ }))
    expect(await screen.findByText(/could not be used, so the automatic view is shown/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'nums (array)' })).toBeInTheDocument()
  })

  it('falls back with a clear message when the request fails', async () => {
    apiMock.visualize.mockRejectedValue(new ApiError(503, 'llm_unavailable', 'The AI tutor is temporarily unavailable.'))
    setup()
    await doTrace()
    await userEvent.click(screen.getByRole('button', { name: /AI view/ }))
    expect(await screen.findByText(/temporarily unavailable\. The automatic view is shown/)).toBeInTheDocument()
    expect(counter()).toBeInTheDocument()
  })

  it('ignores views for variables that are not in the trace', async () => {
    apiMock.visualize.mockResolvedValue(response({ spec: { views: [{ var: 'ghost', kind: 'array' }, { var: 'seen', kind: 'map' }] } }))
    setup()
    await doTrace()
    await userEvent.click(screen.getByRole('button', { name: /AI view/ }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'ghost (array)' })).not.toBeInTheDocument())
    expect(screen.getByRole('region', { name: 'seen (map)' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'nums (array)' })).not.toBeInTheDocument()
  })
})
