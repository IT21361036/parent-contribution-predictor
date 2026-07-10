import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { UserRole } from '../lib/types'
import { LoadingScreen } from './ui/Spinner'

export function ProtectedRoute({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  const { session, profile, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <LoadingScreen label="Setting up your account..." />
  if (!allow.includes(profile.role)) return <Navigate to="/" replace />

  return <>{children}</>
}
