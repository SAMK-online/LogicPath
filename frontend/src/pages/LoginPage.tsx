import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../services/api'
import { ErrorNotice } from '../components/ui'
import { AuthShell } from './AuthShell'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={from} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue learning."
      footer={<>New here? <Link className="font-medium text-copper hover:underline" to="/register">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn-primary w-full" disabled={busy || !email || !password}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </AuthShell>
  )
}
