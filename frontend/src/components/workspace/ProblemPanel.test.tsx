import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { problem } from '../../test/fixtures'
import { ProblemPanel } from './ProblemPanel'

describe('ProblemPanel', () => {
  it('lists constraints and warns that constraint-sized, time-limited tests exist only when the problem has them', () => {
    const { rerender } = render(<ProblemPanel problem={problem} />)
    expect(screen.getByText('Constraints')).toBeInTheDocument()
    expect(screen.queryByTestId('perf-note')).not.toBeInTheDocument()
    rerender(<ProblemPanel problem={{ ...problem, test_cases: [...problem.test_cases, { id: 3, args: [], expected: 0, perf: true, label: 'big', time_limit_ms: 1000 }] }} />)
    expect(screen.getByTestId('perf-note')).toHaveTextContent('every one has a time limit')
  })
})
