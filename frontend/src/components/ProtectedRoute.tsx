import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from './ui'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="p-10"><Spinner label="Checking your session…" /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}
