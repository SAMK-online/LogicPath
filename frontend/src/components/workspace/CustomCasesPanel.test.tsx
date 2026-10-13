import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CustomCases } from '../../hooks/useCustomCases'
import type { Problem } from '../../types/api'
import { CustomCasesPanel } from './CustomCasesPanel'

const problem = {
  id: 'two-sum', title: 'Two Sum', function_signature: { name: 'two_sum', params: [{ name: 'nums', type: 'List[int]' }, { name: 'target', type: 'int' }], return_type: 'List[int]' },
  test_cases: [{ id: 1, args: [[2, 7, 11, 15], 9], expected: [0, 1] }],
} as unknown as Problem

const make = (over: Partial<CustomCases> = {}): CustomCases => ({ cases: [], results: {}, running: false, notice: null, canAdd: true, add: vi.fn(), remove: vi.fn(), run: vi.fn(async () => {}), ...over })

describe('CustomCasesPanel', () => {
  it('says the cases are experimental and unsaved', () => {
    render(<CustomCasesPanel problem={problem} custom={make()} busy={false} onVisualize={() => {}} />)
    expect(screen.getByText(/not saved, and do not count toward your progress/)).toBeInTheDocument()
  })

  it('adds a valid case and shows an error for invalid input', async () => {
    const custom = make()
    render(<CustomCasesPanel problem={problem} custom={custom} busy={false} onVisualize={() => {}} />)
    await userEvent.type(screen.getByLabelText(/nums/), '[[1, 2')
    await userEvent.click(screen.getByRole('button', { name: 'Add case' }))
    expect(custom.add).not.toHaveBeenCalled()
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)

    await userEvent.clear(screen.getByLabelText(/nums/))
    await userEvent.type(screen.getByLabelText(/nums/), '[[3, 3]')
    await userEvent.type(screen.getByLabelText(/target/), '6')
    await userEvent.click(screen.getByRole('button', { name: 'Add case' }))
    expect(custom.add).toHaveBeenCalledTimes(1)
    const build = (custom.add as ReturnType<typeof vi.fn>).mock.calls[0][0] as (id: number) => unknown
    expect(build(-1)).toMatchObject({ id: -1, args: [[3, 3], 6], unchecked: true })
  })

  it('shows results, runs, visualizes and removes a case', async () => {
    const onVisualize = vi.fn()
    const custom = make({
      cases: [{ id: -1, args: [[3, 3], 6], expected: null, unchecked: true, label: 'Custom 1' }, { id: -2, args: [[1, 2], 3], expected: [0, 1], label: 'Custom 2' }],
      results: { [-1]: { id: -1, input: '', expected: '', actual: '[0, 1]', passed: true, error: null }, [-2]: { id: -2, input: '', expected: '[0, 1]', actual: '[1, 0]', passed: false, error: null } },
    })
    render(<CustomCasesPanel problem={problem} custom={custom} busy={false} onVisualize={onVisualize} />)
    const one = within(screen.getByTestId('custom-1'))
    expect(one.getByText('[0, 1]')).toBeInTheDocument()
    expect(one.queryByText(/expected output/)).not.toBeInTheDocument()
    expect(within(screen.getByTestId('custom-2')).getByText(/Does not match/)).toBeInTheDocument()
    await userEvent.click(one.getByRole('button', { name: 'Run' }))
    expect(custom.run).toHaveBeenCalledWith([-1])
    await userEvent.click(one.getByRole('button', { name: 'Visualize' }))
    expect(onVisualize).toHaveBeenCalledWith(-1)
    await userEvent.click(one.getByRole('button', { name: 'Remove Custom 1' }))
    expect(custom.remove).toHaveBeenCalledWith(-1)
  })

  it('disables running while the main tests are running and stops adding at the limit', () => {
    render(<CustomCasesPanel problem={problem} custom={make({ canAdd: false, cases: [{ id: -1, args: [[1], 1], expected: null, unchecked: true, label: 'Custom 1' }] })} busy onVisualize={() => {}} />)
    expect(screen.getByRole('button', { name: 'Run all' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add case' })).toBeDisabled()
  })
})
