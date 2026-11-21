import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { UserRole } from '../../lib/types';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

/**
 * Protects routes that require authentication (Requirement 1.7).
 * Optionally enforces a required role (Requirement 1.6).
 */
export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#F5F3FF]">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-[#EDE9FE] border-t-[#7C5CFC]"
            role="status"
            aria-label="Loading"
          />
          <p className="text-sm font-medium text-[#6B7280]">Loading StarS LMS…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (requiredRole && role !== requiredRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
