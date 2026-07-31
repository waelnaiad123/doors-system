import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import ComingSoon from './pages/ComingSoon'
import TechnicianDaily from './pages/TechnicianDaily'
import ApprovalScreen from './pages/ApprovalScreen'
import ProjectAssignments from './pages/ProjectAssignments'
import DeliveryScreen from './pages/DeliveryScreen'
import UsersScreen from './pages/UsersScreen'
import ReportsScreen from './pages/ReportsScreen'
import WorkforceScreen from './pages/WorkforceScreen'
import ProjectStatusReport from './pages/ProjectStatusReport'

const DEFAULT_ROUTE_BY_ROLE = {
  admin: '/projects',
  data_entry: '/projects',
  technician: '/technician',
  supervisor: '/approval',
  engineer: '/projects',
  delivery_entry: '/delivery',
}

function RequireAuth({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>جارِ التحميل...</div>
  if (!session) return <Navigate to="/login" replace />
  if (!profile) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        حسابك غير مفعّل بعد أو غير مرتبط بدور. تواصل مع الأدمن.
      </div>
    )
  }
  return children
}

function RequireRole({ roles, children }) {
  const { profile } = useAuth()
  if (!roles.includes(profile.role)) {
    return <Navigate to={DEFAULT_ROUTE_BY_ROLE[profile.role] || '/login'} replace />
  }
  return children
}

function HomeRedirect() {
  const { profile } = useAuth()
  return <Navigate to={DEFAULT_ROUTE_BY_ROLE[profile?.role] || '/login'} replace />
}

function LoginRoute() {
  const { session, profile, loading } = useAuth()
  if (!loading && session && profile) {
    return <Navigate to={DEFAULT_ROUTE_BY_ROLE[profile.role] || '/'} replace />
  }
  return <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<HomeRedirect />} />

            <Route
              path="projects"
              element={<RequireRole roles={['admin', 'data_entry', 'engineer']}><Projects /></RequireRole>}
            />
            <Route
              path="projects/:projectId"
              element={<RequireRole roles={['admin', 'data_entry', 'engineer']}><ProjectDetail /></RequireRole>}
            />
            <Route
              path="project-status"
              element={<RequireRole roles={['admin', 'data_entry', 'technician', 'supervisor', 'engineer', 'delivery_entry']}><ProjectStatusReport /></RequireRole>}
            />
            <Route
              path="workforce"
              element={<RequireRole roles={['admin', 'supervisor', 'engineer']}><WorkforceScreen /></RequireRole>}
            />
            <Route
              path="assignments"
              element={<RequireRole roles={['admin', 'engineer', 'data_entry']}><ProjectAssignments /></RequireRole>}
            />
            <Route
              path="users"
              element={<RequireRole roles={['admin']}><UsersScreen /></RequireRole>}
            />
            <Route
              path="technician"
              element={<RequireRole roles={['admin', 'technician', 'supervisor']}><TechnicianDaily /></RequireRole>}
            />
            <Route
              path="approval"
              element={<RequireRole roles={['admin', 'supervisor', 'engineer']}><ApprovalScreen /></RequireRole>}
            />
            <Route
              path="delivery"
              element={<RequireRole roles={['admin', 'delivery_entry']}><DeliveryScreen /></RequireRole>}
            />
            <Route
              path="reports"
              element={<RequireRole roles={['admin', 'supervisor', 'engineer']}><ReportsScreen /></RequireRole>}
            />

            <Route path="*" element={<HomeRedirect />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
