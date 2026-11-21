import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { toast } from '../lib/toast';

const ACTIVITY_EVENTS: ReadonlyArray<keyof WindowEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
];

/**
 * 30-minute session inactivity timeout (Requirement 1.8).
 * Automatically signs the user out and redirects to `/auth/login`.
 */
export function useIdleTimeout(timeoutMs: number = 30 * 60 * 1000): void {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const navigateRef = useRef(navigate);
  const signOutRef = useRef(signOut);

  useEffect(() => {
    navigateRef.current = navigate;
    signOutRef.current = signOut;
  }, [navigate, signOut]);

  useEffect(() => {
    if (!user) return;

    let timerId: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timerId);
      timerId = setTimeout(async () => {
        await signOutRef.current();
        toast.info('Your session expired after 30 minutes of inactivity. Please sign in again.');
        navigateRef.current('/auth/login', { replace: true });
      }, timeoutMs);
    };

    resetTimer();

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    return () => {
      clearTimeout(timerId);
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user, timeoutMs]);
}
