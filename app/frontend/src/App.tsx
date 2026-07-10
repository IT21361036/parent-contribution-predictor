import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import RoleRouter from './pages/RoleRouter'
import ParentDashboard from './pages/parent/Dashboard'
import ChildDashboard from './pages/child/Dashboard'
import AdminDashboard from './pages/admin/Dashboard'
import StudentDetailPage from './pages/admin/StudentDetail'

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RoleRouter />} />
            <Route
              path="/parent"
              element={
                <ProtectedRoute allow={['parent']}>
                  <ParentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/child"
              element={
                <ProtectedRoute allow={['child']}>
                  <ChildDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allow={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/students/:id"
              element={
                <ProtectedRoute allow={['admin']}>
                  <StudentDetailPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
    </ThemeProvider>
  )
}
