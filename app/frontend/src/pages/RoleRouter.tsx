import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoadingScreen } from '../components/ui/Spinner'

const ROLE_HOME: Record<string, string> = {
  admin: '/admin',
  parent: '/parent',
  child: '/child',
}

export default function RoleRouter() {
  const { session, profile, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <LoadingScreen label="Setting up your account..." />

  return <Navigate to={ROLE_HOME[profile.role] ?? '/login'} replace />
}
