import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../contexts/AuthContext'
import { ApiError } from '../services/api'
import { apiMock } from '../test/mockApi'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'
import { ProtectedRoute } from '../components/ProtectedRoute'

vi.mock('../services/api', async (orig) => ({ ...(await orig<typeof import('../services/api')>()), api: (await import('../test/mockApi')).apiMock }))

const user = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', created_at: '2026-01-01T00:00:00Z' }
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}><Route path="/dashboard" element={<h1>Dashboard</h1>} /></Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.me.mockRejectedValue(new ApiError(401, 'session_invalid', 'no'))
})

describe('login form', () => {
  it('redirects unauthenticated visitors from protected routes to /login', async () => {
    renderAt('/dashboard')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('submits credentials and lands on the dashboard', async () => {
    apiMock.login.mockResolvedValue({ user, csrf_token: 'tok' })
    renderAt('/login')
    await screen.findByRole('heading', { name: 'Welcome back' })
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(apiMock.login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correct-horse-battery' })
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('shows the server error for bad credentials and stays on the page', async () => {
    apiMock.login.mockRejectedValue(new ApiError(401, 'invalid_credentials', 'Incorrect email or password'))
    renderAt('/login')
    await screen.findByRole('heading', { name: 'Welcome back' })
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password')
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('disables submit until both fields are filled', async () => {
    renderAt('/login')
    await screen.findByRole('heading', { name: 'Welcome back' })
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled()
  })
})

describe('sign up form', () => {
  async function fill(pw: string, confirm: string) {
    await userEvent.type(screen.getByLabelText('Full name'), 'Ada Lovelace')
    await userEvent.type(screen.getByLabelText('Email address'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), pw)
    await userEvent.type(screen.getByLabelText('Confirm password'), confirm)
  }

  it('flags mismatched passwords and does not call the API', async () => {
    renderAt('/register')
    await screen.findByRole('heading', { name: 'Create your account' })
    await fill('correct-horse-battery', 'correct-horse-batterX')
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(apiMock.register).not.toHaveBeenCalled()
  })

  it('rejects short passwords client-side', async () => {
    renderAt('/register')
    await screen.findByRole('heading', { name: 'Create your account' })
    await fill('short', 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 10')
    expect(apiMock.register).not.toHaveBeenCalled()
  })

  it('registers and signs in', async () => {
    apiMock.register.mockResolvedValue({ user, csrf_token: 't' })
    renderAt('/register')
    await screen.findByRole('heading', { name: 'Create your account' })
    await fill('correct-horse-battery', 'correct-horse-battery')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(apiMock.register).toHaveBeenCalledWith({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct-horse-battery', confirm_password: 'correct-horse-battery' }))
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })
})
