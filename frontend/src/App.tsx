import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { RoadmapPage } from './pages/RoadmapPage'
import { WorkspacePage } from './pages/WorkspacePage'
import { LandingPage } from './pages/LandingPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/roadmaps/:roadmapId" element={<RoadmapPage />} />
        </Route>
        <Route element={<AppLayout fullHeight />}>
          <Route path="/workspace/:problemId" element={<WorkspacePage />} />
        </Route>
      </Route>
      <Route path="*" element={<div className="p-10 text-slate-muted">Page not found. <a className="underline" href="/">Go home</a></div>} />
    </Routes>
  )
}
