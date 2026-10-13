import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../services/api'
import type { PythonRunner, RunResult } from '../services/pythonRunner'
import { problem, session } from '../test/fixtures'
import { apiMock } from '../test/mockApi'
import { failuresFrom, useWorkspace } from './useWorkspace'

vi.mock('../services/api', async (orig) => ({ ...(await orig<typeof import('../services/api')>()), api: (await import('../test/mockApi')).apiMock }))

const failing: RunResult = { status: 'failed', passed: 1, total: 2, durationMs: 5, stdout: '', error: null, cases: [
  { id: 1, input: 'a', expected: 'b', actual: 'b', passed: true, error: null },
  { id: 2, input: 'x'.repeat(900), expected: '[0, 1]', actual: 'None', passed: false, error: 'boom' },
] }
const runner = { warmUp: vi.fn(), run: vi.fn() } as unknown as PythonRunner & { run: ReturnType<typeof vi.fn> }

async function setup() {
  const hook = renderHook(() => useWorkspace('two-sum', 'dsa-fundamentals', runner))
  await waitFor(() => expect(hook.result.current.session).not.toBeNull())
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.problem.mockResolvedValue(problem)
  apiMock.openSession.mockResolvedValue({ ...session, messages: [{ id: 1, role: 'user', kind: 'chat', content: 'earlier', created_at: '' }] })
})

describe('workspace: loading & editor state', () => {
  it('opens the session for the roadmap and restores saved code and chat history', async () => {
    const { result } = await setup()
    expect(apiMock.openSession).toHaveBeenCalledWith('two-sum', 'dsa-fundamentals')
    expect(result.current.code).toBe(problem.starter_code)
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.saveState).toBe('saved')
  })

  it('marks the editor dirty on change and clean again after saving', async () => {
    apiMock.saveCode.mockResolvedValue({ code_version: 2, changed: true, updated_at: '' })
    const { result } = await setup()
    act(() => result.current.setCode('x = 1'))
    expect(result.current.saveState).toBe('dirty')
    await act(async () => { expect(await result.current.save()).toBe(true) })
    expect(apiMock.saveCode).toHaveBeenCalledWith('sess-1', 'x = 1')
    expect(result.current.saveState).toBe('saved')
  })

  it('does not call the API when saving unchanged code', async () => {
    const { result } = await setup()
    await act(async () => { await result.current.save() })
    expect(apiMock.saveCode).not.toHaveBeenCalled()
  })

  it('keeps the code dirty and surfaces the error when saving fails', async () => {
    apiMock.saveCode.mockRejectedValue(new ApiError(0, 'network_error', 'Cannot reach the server.'))
    const { result } = await setup()
    act(() => result.current.setCode('y = 2'))
    await act(async () => { expect(await result.current.save()).toBe(false) })
    expect(result.current.saveError).toBe('Cannot reach the server.')
    expect(result.current.saveState).toBe('error')
    expect(result.current.code).toBe('y = 2') // never lose the student's work
  })

  it('reports load errors', async () => {
    apiMock.openSession.mockRejectedValue(new ApiError(409, 'problem_unavailable', 'not written yet'))
    const { result } = renderHook(() => useWorkspace('x', null, runner))
    await waitFor(() => expect(result.current.loadError).toBe('not written yet'))
  })
})

describe('workspace: running tests', () => {
  it('runs with structured tests, records the submission with the code that ran, and marks it saved', async () => {
    runner.run.mockResolvedValue(failing)
    apiMock.submit.mockResolvedValue({ submission: {}, code_version: 2, completion_status: 'in_progress', attempts: 1 })
    const { result } = await setup()
    act(() => result.current.setCode('def two_sum(n, t):\n    return []'))
    await act(async () => { await result.current.run() })
    expect(runner.run).toHaveBeenCalledWith({ code: 'def two_sum(n, t):\n    return []', signature: problem.function_signature, tests: problem.test_cases, comparison: 'sorted' })
    const sub = apiMock.submit.mock.calls[0][0]
    expect(sub).toMatchObject({ session_id: 'sess-1', passed_tests: 1, total_tests: 2, execution_status: 'failed', code: 'def two_sum(n, t):\n    return []' })
    expect(sub.failures).toHaveLength(1)
    expect(sub.failures[0].input.length).toBeLessThanOrEqual(500) // bounded payload
    expect(result.current.runResult?.status).toBe('failed')
    expect(result.current.saveState).toBe('saved')
  })

  it('still shows results when recording fails', async () => {
    runner.run.mockResolvedValue(failing)
    apiMock.submit.mockRejectedValue(new ApiError(500, 'internal_error', 'Something went wrong on our side'))
    const { result } = await setup()
    await act(async () => { await result.current.run() })
    expect(result.current.runResult).not.toBeNull()
    expect(result.current.runNotice).toMatch(/could not be recorded/)
  })

  it('shows a runtime-load failure instead of results', async () => {
    runner.run.mockRejectedValue(new Error('Could not load the Python runtime.'))
    const { result } = await setup()
    await act(async () => { await result.current.run() })
    expect(result.current.runResult).toBeNull()
    expect(result.current.runNotice).toBe('Could not load the Python runtime.')
    expect(apiMock.submit).not.toHaveBeenCalled()
  })

  it('failuresFrom keeps at most five failures', () => {
    const many: RunResult = { ...failing, cases: Array.from({ length: 9 }, (_, i) => ({ id: i, input: '', expected: '', actual: '', passed: false, error: null })) }
    expect(failuresFrom(many)).toHaveLength(5)
  })
})

describe('workspace: tutor chat', () => {
  const reply = { user_message: { id: 2, role: 'user', kind: 'chat', content: 'hi', created_at: '' }, assistant_message: { id: 3, role: 'assistant', kind: 'chat', content: 'Hello?', created_at: '' }, code_version: 2, hint_level: 0, tutor_mode: 'live' }

  it('sends unsaved code with the message so the server can sync it first', async () => {
    apiMock.chat.mockResolvedValue(reply)
    const { result } = await setup()
    act(() => result.current.setCode('draft = 1'))
    await act(async () => { await result.current.sendChat('why?') })
    expect(apiMock.chat).toHaveBeenCalledWith({ session_id: 'sess-1', kind: 'chat', message: 'why?', code: 'draft = 1' })
    expect(result.current.saveState).toBe('saved') // server saved it as part of the chat
    expect(result.current.messages.map((m) => m.id)).toEqual([1, 2, 3])
  })

  it('omits code when the editor matches the saved version', async () => {
    apiMock.chat.mockResolvedValue(reply)
    const { result } = await setup()
    await act(async () => { await result.current.sendChat('why?') })
    expect(apiMock.chat.mock.calls[0][0]).not.toHaveProperty('code')
  })

  it('hint and review use their own kinds and update the hint level', async () => {
    apiMock.chat.mockResolvedValue({ ...reply, hint_level: 2 })
    const { result } = await setup()
    await act(async () => { await result.current.requestHint() })
    expect(apiMock.chat).toHaveBeenLastCalledWith({ session_id: 'sess-1', kind: 'hint' })
    expect(result.current.hintLevel).toBe(2)
    await act(async () => { await result.current.reviewApproach() })
    expect(apiMock.chat).toHaveBeenLastCalledWith({ session_id: 'sess-1', kind: 'review' })
  })

  it('surfaces tutor errors, keeps the code dirty, and adds no messages', async () => {
    apiMock.chat.mockRejectedValue(new ApiError(503, 'llm_unavailable', 'The AI tutor is temporarily unavailable.'))
    const { result } = await setup()
    act(() => result.current.setCode('z = 3'))
    await act(async () => { expect(await result.current.sendChat('help')).toBe(false) })
    expect(result.current.chatError).toBe('The AI tutor is temporarily unavailable.')
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.saveState).toBe('dirty')
  })
})
