import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../contexts/AuthContext'
import { ApiError } from '../services/api'
import { apiMock } from '../test/mockApi'
import { LandingPage } from './LandingPage'

vi.mock('../services/api', async (orig) => ({ ...(await orig<typeof import('../services/api')>()), api: (await import('../test/mockApi')).apiMock }))

const user = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', created_at: '2026-01-01T00:00:00Z' }
const renderPage = () => render(<MemoryRouter><AuthProvider><LandingPage /></AuthProvider></MemoryRouter>)

describe('LandingPage', () => {
  beforeEach(() => { vi.clearAllMocks(); apiMock.me.mockRejectedValue(new ApiError(401, 'unauthorized', 'Not signed in')) })

  it('states the product plainly and links to sign-up and log-in', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('builds your instinct instead of giving answers')
    expect((await screen.findAllByRole('link', { name: /create (an )?account/i })).every((a) => a.getAttribute('href') === '/register')).toBe(true)
    expect(screen.getAllByRole('link', { name: 'Log in' }).every((a) => a.getAttribute('href') === '/login')).toBe(true)
  })

  it('offers the dashboard instead when already signed in', async () => {
    apiMock.me.mockResolvedValue({ user, csrf_token: 'c' })
    renderPage()
    const links = await screen.findAllByRole('link', { name: 'Open dashboard' })
    expect(links.every((a) => a.getAttribute('href') === '/dashboard')).toBe(true)
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull()
  })

  it('is honest about limits', () => {
    renderPage()
    expect(screen.getByText('Python only.')).toBeInTheDocument()
    expect(screen.getByText('The tutor is an AI model.')).toBeInTheDocument()
    expect(screen.getByText(/14 of 75 problems/)).toBeInTheDocument()
  })

  it('shows the five hint levels in order', () => {
    renderPage()
    expect([1, 2, 3, 4, 5].every((n) => screen.getByLabelText(`Level ${n}`))).toBe(true)
  })
})
