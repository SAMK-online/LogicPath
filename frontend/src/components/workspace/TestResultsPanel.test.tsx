import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CaseResult, RunResult } from '../../services/pythonRunner'
import { TestResultsPanel } from './TestResultsPanel'

const base: RunResult = { status: 'failed', passed: 1, total: 2, durationMs: 12, stdout: '', error: null, cases: [
  { id: 1, input: 'nums=[2, 7], target=9', expected: '[0, 1]', actual: '[0, 1]', passed: true, error: null },
  { id: 2, input: 'nums=[3, 3], target=6', expected: '[0, 1]', actual: 'None', passed: false, error: 'ZeroDivisionError: division by zero (line 3)' },
] }

describe('test results rendering', () => {
  it('renders number, input, expected, actual, status and error for each case', () => {
    render(<TestResultsPanel result={base} running={false} notice={null} runtime="ready" />)
    expect(screen.getByTestId('summary')).toHaveTextContent('1/2 passed')
    const ok = within(screen.getByTestId('case-1'))
    expect(ok.getByText('nums=[2, 7], target=9')).toBeInTheDocument()
    expect(ok.getByText('Passed')).toBeInTheDocument()
    const bad = within(screen.getByTestId('case-2'))
    expect(bad.getByText('Failed')).toBeInTheDocument()
    expect(bad.getByText('None')).toBeInTheDocument()
    expect(bad.getByText(/ZeroDivisionError/)).toBeInTheDocument()
  })

  it('shows syntax/runtime errors, timeouts and printed output', () => {
    const { rerender } = render(<TestResultsPanel result={{ ...base, status: 'error', cases: [], passed: 0, error: 'SyntaxError: invalid syntax (line 1)' }} running={false} notice={null} runtime="ready" />)
    expect(screen.getByText('Your code could not run')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('SyntaxError')
    rerender(<TestResultsPanel result={{ ...base, status: 'timeout', cases: [], passed: 0, error: 'Time limit exceeded: ...' }} running={false} notice={null} runtime="ready" />)
    expect(screen.getByText('Time limit exceeded', { selector: 'strong' })).toBeInTheDocument()
    rerender(<TestResultsPanel result={{ ...base, stdout: 'hello from print' }} running={false} notice={null} runtime="ready" />)
    expect(screen.getByText('hello from print')).toBeInTheDocument()
  })

  it('has empty, running and notice states', () => {
    const { rerender } = render(<TestResultsPanel result={null} running={false} notice={null} runtime="idle" />)
    expect(screen.getByText(/Run your code/)).toBeInTheDocument()
    rerender(<TestResultsPanel result={null} running notice={null} runtime="loading" />)
    expect(screen.getByRole('status')).toHaveTextContent('downloads the Python runtime')
    rerender(<TestResultsPanel result={null} running={false} notice="Could not load the Python runtime." runtime="failed" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load')
  })
})


describe('performance tests', () => {
  const ok = (id: number, extra: Partial<CaseResult> = {}): CaseResult => ({ id, input: `nums=[${id}]`, expected: '1', actual: '1', passed: true, error: null, ...extra })
  const slow = (id: number, extra: Partial<CaseResult> = {}): CaseResult => ({ id, input: 'nums=<list of 20,000 items: [3, 1, 4, 1, ...]>', expected: '[0, 1]', actual: '[0, 1]', passed: false, timed_out: true,
    perf: true, label: '20,000 numbers; the answer is the two largest', ms: 4200,
    error: 'Time limit exceeded: took 4.2 s, the limit is 1.0 s. This input is within the constraints, so the solution has to scale to it.', ...extra })
  const run = (cases: CaseResult[], status: 'passed' | 'failed' | 'timeout' = 'failed'): RunResult => ({
    status, cases, passed: cases.filter((c) => c.passed).length, total: cases.length, durationMs: 4300, stdout: '', error: null })
  const constraints = ['`2 <= len(nums) <= 2 * 10**4`']

  it('groups the large tests under their own heading, with label, time and a "Too slow" status', () => {
    render(<TestResultsPanel result={run([ok(1), ok(2), slow(3)])} running={false} notice={null} runtime="ready" constraints={constraints} />)
    expect(screen.getByText(/Performance tests: inputs as large as the constraints allow/)).toBeInTheDocument()
    const row = within(screen.getByTestId('case-3'))
    expect(row.getByText('Too slow')).toBeInTheDocument()
    expect(row.getByText('20,000 numbers; the answer is the two largest')).toBeInTheDocument()
    expect(screen.getByTestId('ms-3')).toHaveTextContent('4.2 s')
    expect(row.getByText(/Time limit exceeded: took 4.2 s/)).toBeInTheDocument()
    expect(within(screen.getByTestId('case-1')).getByText('Passed')).toBeInTheDocument()
    expect(screen.queryByTestId('ms-1')).not.toBeInTheDocument() // only performance tests show a time
  })

  it('nudges toward the constraints when the ordinary tests pass but the big ones do not', () => {
    render(<TestResultsPanel result={run([ok(1), ok(2), slow(3)])} running={false} notice={null} runtime="ready" constraints={constraints} />)
    const nudge = screen.getByTestId('speed-nudge')
    expect(nudge).toHaveTextContent('Correct on the small tests, but not fast enough')
    expect(nudge).toHaveTextContent('How many steps does your approach take')
    expect(within(nudge).getByLabelText('Constraints')).toHaveTextContent('2 <= len(nums) <= 2 * 10**4')
    expect(nudge.textContent).not.toMatch(/hash|dictionary|binary search|two pointers|sliding window/i) // names no algorithm
  })

  it('does not nudge when a basic test fails, or when everything passes', () => {
    const { rerender } = render(<TestResultsPanel result={run([ok(1, { passed: false }), ok(2), slow(3)])} running={false} notice={null} runtime="ready" />)
    expect(screen.queryByTestId('speed-nudge')).not.toBeInTheDocument()
    rerender(<TestResultsPanel result={run([ok(1), ok(2), ok(3, { perf: true, label: 'big', ms: 12 })], 'passed')} running={false} notice={null} runtime="ready" />)
    expect(screen.queryByTestId('speed-nudge')).not.toBeInTheDocument()
    expect(screen.getByTestId('ms-3')).toHaveTextContent('12 ms')
  })

  it('shows a test that was stopped (run killed) without a time', () => {
    const stuck = slow(3, { actual: '', ms: null, error: 'Time limit exceeded: this test did not finish within 8 s and was stopped.' })
    render(<TestResultsPanel result={run([ok(1), ok(2), stuck], 'timeout')} running={false} notice={null} runtime="ready" constraints={constraints} />)
    expect(screen.getByText('Time limit exceeded', { selector: 'strong' })).toBeInTheDocument()
    expect(within(screen.getByTestId('case-3')).getByText(/did not finish within 8 s/)).toBeInTheDocument()
    expect(screen.queryByTestId('ms-3')).not.toBeInTheDocument()
    expect(screen.getByTestId('speed-nudge')).toBeInTheDocument()
  })

  it('shows a work-budget failure as a normal failure with its message', () => {
    const over = ok(3, { perf: true, label: 'Sorted list of 1,000,000 numbers', passed: false, ms: 80, error: 'Your code looked at 1,000,000 of the 1,000,000 items; this test allows at most 64.' })
    render(<TestResultsPanel result={run([ok(1), over])} running={false} notice={null} runtime="ready" />)
    expect(within(screen.getByTestId('case-3')).getByText('Failed')).toBeInTheDocument()
    expect(within(screen.getByTestId('case-3')).getByText(/allows at most 64/)).toBeInTheDocument()
  })
})
