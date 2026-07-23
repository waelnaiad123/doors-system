import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import ComingSoon from './pages/ComingSoon'

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
              path="assignments"
              element={<RequireRole roles={['admin', 'engineer']}><ComingSoon title="تخصيص المشاريع" /></RequireRole>}
            />
            <Route
              path="users"
              element={<RequireRole roles={['admin']}><ComingSoon title="المستخدمون" /></RequireRole>}
            />
            <Route
              path="technician"
              element={<RequireRole roles={['admin', 'technician']}><ComingSoon title="تسجيل تركيب" /></RequireRole>}
            />
            <Route
              path="approval"
              element={<RequireRole roles={['admin', 'supervisor', 'engineer']}><ComingSoon title="اعتماد الإدخالات" /></RequireRole>}
            />
            <Route
              path="delivery"
              element={<RequireRole roles={['admin', 'delivery_entry']}><ComingSoon title="التسليمات" /></RequireRole>}
            />
            <Route
              path="reports"
              element={<RequireRole roles={['admin', 'supervisor', 'engineer']}><ComingSoon title="التقارير" /></RequireRole>}
            />

            <Route path="*" element={<HomeRedirect />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
