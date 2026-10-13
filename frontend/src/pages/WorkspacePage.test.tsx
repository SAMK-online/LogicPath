import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { problem, session } from '../test/fixtures'
import { apiMock } from '../test/mockApi'
import { WorkspacePage } from './WorkspacePage'

vi.mock('../services/api', async (orig) => ({ ...(await orig<typeof import('../services/api')>()), api: (await import('../test/mockApi')).apiMock }))
// Monaco needs a real browser; stand in with a textarea that exposes the same value/onChange contract.
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="code editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))
const runMock = vi.fn()
const traceMock = vi.fn()
vi.mock('../services/pythonRunner', () => ({
  getPythonRunner: () => ({ state: 'ready', subscribe: () => () => {}, warmUp: () => {}, run: runMock, trace: traceMock }),
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/workspace/two-sum?roadmap=dsa-fundamentals']}>
      <Routes><Route path="/workspace/:problemId" element={<WorkspacePage />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.problem.mockResolvedValue(problem)
  apiMock.openSession.mockResolvedValue(session)
})

describe('coding workspace', () => {
  it('shows problem, editor with starter code, results and tutor panes', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Two Sum' })).toBeInTheDocument()
    expect(screen.getByText('Topic: Hash maps')).toBeInTheDocument()
    expect(screen.getByText('Examples')).toBeInTheDocument()
    expect(screen.getByLabelText('code editor')).toHaveValue(problem.starter_code)
    expect(screen.getByRole('heading', { name: 'Socratic tutor' })).toBeInTheDocument()
    expect(screen.getByText(/Run your code to see test results/)).toBeInTheDocument()
  })

  it('shows an unsaved-changes indicator, then saves', async () => {
    apiMock.saveCode.mockResolvedValue({ code_version: 2, changed: true, updated_at: '' })
    renderPage()
    const editor = await screen.findByLabelText('code editor')
    expect(screen.getByTestId('save-status')).toHaveTextContent('All changes saved')
    await userEvent.type(editor, '#')
    expect(screen.getByTestId('save-status')).toHaveTextContent('Unsaved changes')
    await userEvent.click(screen.getByRole('button', { name: 'Save Code' }))
    await waitFor(() => expect(screen.getByTestId('save-status')).toHaveTextContent('All changes saved'))
    expect(apiMock.saveCode).toHaveBeenCalledWith('sess-1', expect.stringContaining('#'))
    expect(apiMock.chat).not.toHaveBeenCalled() // saving never involves the tutor
  })

  it('runs code and renders the per-test results', async () => {
    runMock.mockResolvedValue({ status: 'passed', passed: 2, total: 2, durationMs: 4, stdout: '', error: null, cases: [
      { id: 1, input: 'nums=[2, 7], target=9', expected: '[0, 1]', actual: '[0, 1]', passed: true, error: null },
      { id: 2, input: 'nums=[3, 3], target=6', expected: '[0, 1]', actual: '[0, 1]', passed: true, error: null },
    ] })
    apiMock.submit.mockResolvedValue({ submission: {}, code_version: 1, completion_status: 'completed', attempts: 1 })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Run Code/ }))
    expect(await screen.findByText('All tests passed')).toBeInTheDocument()
    expect(screen.getByTestId('summary')).toHaveTextContent('2/2 passed')
  })

  it('chats with the tutor and shows the reply', async () => {
    apiMock.chat.mockResolvedValue({
      user_message: { id: 1, role: 'user', kind: 'chat', content: 'help me', created_at: '' },
      assistant_message: { id: 2, role: 'assistant', kind: 'chat', content: 'What have you tried?', created_at: '' },
      code_version: 1, hint_level: 0, tutor_mode: 'live' })
    renderPage()
    await userEvent.type(await screen.findByLabelText('Message the tutor'), 'help me')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('What have you tried?')).toBeInTheDocument()
  })

  it('shows a clear error if the workspace cannot open', async () => {
    apiMock.openSession.mockRejectedValue(new Error('x'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })
})


describe('visualize tab', () => {
  it('opens the (lazily loaded) visualizer showing the test case, without calling the AI', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: 'Visualize' }))
    expect(await screen.findByTestId('visualizer')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'nums (array)' })).toBeInTheDocument()
    expect(apiMock.visualize).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('tab', { name: 'Test results' }))
    expect(screen.getByText(/Run your code to see test results/)).toBeInTheDocument()
  })
})
