import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../../types/api'
import { TutorPanel } from './TutorPanel'

const msgs: ChatMessage[] = [
  { id: 1, role: 'user', kind: 'chat', content: 'Why is it slow?', created_at: '' },
  { id: 2, role: 'assistant', kind: 'chat', content: 'How many **pairs** does `i`/`j` check?', created_at: '' },
  { id: 3, role: 'user', kind: 'hint', content: 'Request Hint', created_at: '' },
]
function setup(over: Partial<React.ComponentProps<typeof TutorPanel>> = {}) {
  const props = { messages: msgs, sending: false, error: null, hintLevel: 1, tutorMode: 'live' as const, hasUnsavedChanges: false,
    onSend: vi.fn().mockResolvedValue(true), onHint: vi.fn(), onReview: vi.fn(), ...over }
  render(<TutorPanel {...props} />)
  return props
}

describe('tutor chat panel', () => {
  it('renders conversation history with formatted tutor replies', () => {
    setup()
    expect(screen.getByText('Why is it slow?')).toBeInTheDocument()
    expect(screen.getByText('pairs').tagName).toBe('STRONG')
    expect(screen.getAllByText('Request Hint').some((el) => el.tagName === 'EM')).toBe(true) // hint requests are shown in the transcript
  })

  it('sends on click, clears the box, and Enter also sends (Shift+Enter does not)', async () => {
    const p = setup()
    const box = screen.getByLabelText('Message the tutor')
    await userEvent.type(box, 'my question')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(p.onSend).toHaveBeenCalledWith('my question')
    expect(box).toHaveValue('')
    await userEvent.type(box, 'line one{Shift>}{Enter}{/Shift}line two')
    expect(p.onSend).toHaveBeenCalledTimes(1)
    await userEvent.type(box, '{Enter}')
    expect(p.onSend).toHaveBeenLastCalledWith('line one\nline two')
  })

  it('keeps the draft when sending fails', async () => {
    setup({ onSend: vi.fn().mockResolvedValue(false) })
    const box = screen.getByLabelText('Message the tutor')
    await userEvent.type(box, 'keep me')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(box).toHaveValue('keep me')
  })

  it('does not send blank messages', async () => {
    const p = setup()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Message the tutor'), '   {Enter}')
    expect(p.onSend).not.toHaveBeenCalled()
  })

  it('has Request Hint (with level) and Review My Approach buttons', async () => {
    const p = setup()
    await userEvent.click(screen.getByRole('button', { name: /Request Hint/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Review My Approach' }))
    expect(p.onHint).toHaveBeenCalled(); expect(p.onReview).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /used 1\/5/ })).toBeInTheDocument()
  })

  it('disables inputs while waiting and shows progress and errors', () => {
    setup({ sending: true, error: 'The AI tutor is busy right now.' })
    expect(screen.getByRole('button', { name: /Request Hint/ })).toBeDisabled()
    expect(screen.getByText('Tutor is thinking…')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('busy')
  })

  it('labels mock mode clearly and tells the student unsaved edits are included', () => {
    setup({ tutorMode: 'mock', hasUnsavedChanges: true })
    expect(screen.getByRole('note')).toHaveTextContent('not from an AI model')
    expect(screen.getByText(/unsaved edits will be included/)).toBeInTheDocument()
  })
})
