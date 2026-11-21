import React from 'react';
import { useIdleTimeout } from '../../hooks/useIdleTimeout';

interface IdleTimeoutProviderProps {
  children: React.ReactNode;
  timeoutMs?: number;
}

export function IdleTimeoutProvider({
  children,
  timeoutMs = 30 * 60 * 1000,
}: IdleTimeoutProviderProps) {
  useIdleTimeout(timeoutMs);
  return <>{children}</>;
}
