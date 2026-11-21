import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { UserRole } from '../../lib/types';

interface RoleGuardProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

export function RoleGuard({ children, requiredRole }: RoleGuardProps) {
  const { role } = useAuth();

  if (requiredRole !== undefined && role !== requiredRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
