import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../services/api'
import { ErrorNotice } from '../components/ui'
import { AuthShell } from './AuthShell'

export const MIN_PASSWORD = 10

export function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  const mismatch = confirm.length > 0 && password !== confirm
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`)
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    try {
      await register({ name: name.trim(), email, password, confirm_password: confirm })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Start learning with a tutor that asks, not tells."
      footer={<>Already have an account? <Link className="font-medium text-copper hover:underline" to="/login">Log in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" autoComplete="name" required className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" required aria-describedby="pw-hint" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p id="pw-hint" className={`mt-1 text-xs ${tooShort ? 'text-bad' : 'text-slate-muted'}`}>At least {MIN_PASSWORD} characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <input id="confirm" type="password" autoComplete="new-password" required className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {mismatch && <p className="mt-1 text-xs text-bad">Passwords do not match.</p>}
        </div>
        <button className="btn-primary w-full" disabled={busy || !name.trim() || !email || !password || !confirm}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthShell>
  )
}
