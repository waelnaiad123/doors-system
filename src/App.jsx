import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Layout from './components/Layout'

const Login = React.lazy(() => import('./pages/Login'))
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const UpdatePassword = React.lazy(() => import('./pages/UpdatePassword'))
const Projects = React.lazy(() => import('./pages/Projects'))
const ProjectDetail = React.lazy(() => import('./pages/ProjectDetail'))
const TechnicianDaily = React.lazy(() => import('./pages/TechnicianDaily'))
const ApprovalScreen = React.lazy(() => import('./pages/ApprovalScreen'))
const ProjectAssignments = React.lazy(() => import('./pages/ProjectAssignments'))
const DeliveryScreen = React.lazy(() => import('./pages/DeliveryScreen'))
const UsersScreen = React.lazy(() => import('./pages/UsersScreen'))
const ReportsScreen = React.lazy(() => import('./pages/ReportsScreen'))
const WorkforceScreen = React.lazy(() => import('./pages/WorkforceScreen'))
const ProjectStatusReport = React.lazy(() => import('./pages/ProjectStatusReport'))
const InstallationCard = React.lazy(() => import('./pages/InstallationCard'))
const AdditionalWorks = React.lazy(() => import('./pages/AdditionalWorks'))
const MonthlyProductivity = React.lazy(() => import('./pages/MonthlyProductivity'))
const AdminProductivitySummary = React.lazy(() => import('./pages/AdminProductivitySummary'))
const ProjectsOverview = React.lazy(() => import('./pages/ProjectsOverview'))
const BackupExport = React.lazy(() => import('./pages/BackupExport'))
const HRHome = React.lazy(() => import('./pages/HRHome'))

const DEFAULT_ROUTE_BY_ROLE = {
  admin: '/dashboard',
  data_entry: '/dashboard',
  technician: '/dashboard',
  supervisor: '/dashboard',
  engineer: '/dashboard',
  delivery_entry: '/dashboard',
  hr: '/hr',
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

function RequireRole({ roles, allowFlag, children }) {
  const { profile } = useAuth()
  const allowed = roles.includes(profile.role) || (allowFlag && !!profile[allowFlag])
  if (!allowed) {
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

// شاشة انتظار بسيطة تظهر بس وقت تحميل كود شاشة جديدة أول مرة في الجلسة -
// نفس نص "جارِ التحميل..." المستخدم أصلًا في RequireAuth عشان يبقى متسق.
function RouteFallback() {
  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>جارِ التحميل...</div>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/update-password" element={<UpdatePassword />} />
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
                path="additional-works"
                element={<RequireRole roles={['admin', 'engineer']}><AdditionalWorks /></RequireRole>}
              />
              <Route
                path="dashboard"
                element={<RequireRole roles={['admin', 'data_entry', 'technician', 'supervisor', 'engineer', 'delivery_entry']}><Dashboard /></RequireRole>}
              />
              <Route
                path="hr"
                element={<RequireRole roles={['admin', 'hr']}><HRHome /></RequireRole>}
              />
              <Route
                path="backup"
                element={<RequireRole roles={['admin']}><BackupExport /></RequireRole>}
              />
              <Route
                path="projects-overview"
                element={<RequireRole roles={['admin', 'engineer']}><ProjectsOverview /></RequireRole>}
              />
              <Route
                path="productivity-summary"
                element={<RequireRole roles={['admin', 'engineer']}><AdminProductivitySummary /></RequireRole>}
              />
              <Route
                path="monthly-productivity"
                element={<RequireRole roles={['admin', 'engineer']}><MonthlyProductivity /></RequireRole>}
              />
              <Route
                path="installation-card"
                element={<RequireRole roles={['admin', 'supervisor', 'engineer']}><InstallationCard /></RequireRole>}
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
                element={<RequireRole roles={['admin']} allowFlag="is_installations_manager"><UsersScreen /></RequireRole>}
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
                element={<RequireRole roles={['admin', 'delivery_entry', 'data_entry']}><DeliveryScreen /></RequireRole>}
              />
              <Route
                path="reports"
                element={<RequireRole roles={['admin', 'supervisor', 'engineer']}><ReportsScreen /></RequireRole>}
              />

              <Route path="*" element={<HomeRedirect />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
