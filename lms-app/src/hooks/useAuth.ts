import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { lmsService } from '../lib/dataService';
import { DEMO_PROFESSOR_ID, DEMO_STUDENT_ID } from '../lib/demoData';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import type { Profile, SocialLink, UserActivityStatus, UserRole } from '../lib/types';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  activity_status?: UserActivityStatus;
  program_course?: string | null;
  social_links?: SocialLink[];
  app_metadata?: Record<string, unknown>;
}

export interface SignInResult {
  ok: boolean;
  error?: string;
  lockedUntil?: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  role: UserRole | null;
  isLoading: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signInDemo: (role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const DEMO_SESSION_KEY = 'lms_demo_active_user_id_v1';
const LOCKOUT_KEY = 'lms_login_lockout_v1';

interface LockoutRecord {
  failedAttempts: number;
  windowStart: number;
  lockedUntil: number | null;
}

const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

export function evaluateLockoutState(
  prev: LockoutRecord | null,
  nowMs: number,
): { next: LockoutRecord; isLocked: boolean; lockedUntilIso?: string } {
  if (prev?.lockedUntil && prev.lockedUntil > nowMs) {
    return {
      next: prev,
      isLocked: true,
      lockedUntilIso: new Date(prev.lockedUntil).toISOString(),
    };
  }

  const withinWindow = prev && nowMs - prev.windowStart <= LOCKOUT_WINDOW_MS;
  const failedAttempts = withinWindow ? prev.failedAttempts + 1 : 1;
  const windowStart = withinWindow ? prev.windowStart : nowMs;

  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = nowMs + LOCKOUT_DURATION_MS;
    return {
      next: { failedAttempts, windowStart, lockedUntil },
      isLocked: true,
      lockedUntilIso: new Date(lockedUntil).toISOString(),
    };
  }

  return {
    next: { failedAttempts, windowStart, lockedUntil: null },
    isLocked: false,
  };
}

function getLockoutMap(): Record<string, LockoutRecord> {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LockoutRecord>) : {};
  } catch {
    return {};
  }
}

function saveLockoutMap(map: Record<string, LockoutRecord>): void {
  try {
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function extractRole(session: Session | null): UserRole | null {
  if (!session) return null;
  const appRole = session.user.app_metadata?.role as string | undefined;
  if (appRole === 'professor' || appRole === 'student') return appRole;
  const userRole = session.user.user_metadata?.role as string | undefined;
  if (userRole === 'professor' || userRole === 'student') return userRole;
  return 'student';
}

function mapSupabaseUser(sbUser: User, profile: Profile | null, role: UserRole): AuthUser {
  return {
    id: sbUser.id,
    email: profile?.email ?? sbUser.email ?? '',
    full_name: profile?.full_name ?? (sbUser.user_metadata?.full_name as string) ?? sbUser.email ?? 'User',
    role,
    avatar_url: profile?.avatar_url ?? null,
    activity_status: profile?.activity_status ?? 'active',
    program_course: profile?.program_course ?? null,
    social_links: profile?.social_links ?? [],
    app_metadata: sbUser.app_metadata,
  };
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  role: null,
  isLoading: true,
  isDemoMode: !isSupabaseConfigured,
  signIn: async () => ({ ok: false }),
  signInDemo: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDemoUser = useCallback(async (userId: string | null) => {
    if (!userId) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    const profile = await lmsService.getProfile(userId);
    if (profile) {
      setUser({
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
        avatar_url: profile.avatar_url,
        activity_status: profile.activity_status ?? 'active',
        program_course: profile.program_course ?? null,
        social_links: profile.social_links ?? [],
      });
    } else {
      setUser(null);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      const savedId = localStorage.getItem(DEMO_SESSION_KEY);
      loadDemoUser(savedId);
      return;
    }

    let mounted = true;
    const syncSession = async (newSession: Session | null) => {
      if (!mounted) return;
      setSession(newSession);
      if (!newSession) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      const role = extractRole(newSession) ?? 'student';
      const profile = await lmsService.getProfile(newSession.user.id);
      if (!mounted) return;
      setUser(mapSupabaseUser(newSession.user, profile, role));
      setIsLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => syncSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      syncSession(newSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadDemoUser]);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    const normalizedEmail = email.trim().toLowerCase();

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        if (error.message.toLowerCase().includes('rate limit')) {
          return { ok: false, error: 'Too many attempts. Please wait a moment and try again.' };
        }
        return { ok: false, error: 'Invalid credentials. Please try again.' };
      }
      const lockedUntilRaw = data.user?.app_metadata?.locked_until as string | undefined;
      if (lockedUntilRaw && new Date(lockedUntilRaw) > new Date()) {
        await supabase.auth.signOut();
        return { ok: false, lockedUntil: lockedUntilRaw };
      }
      return { ok: true };
    }

    // Demo Mode authentication with 5-attempt / 15-min lockout (Requirement 1.2)
    const nowMs = Date.now();
    const lockMap = getLockoutMap();
    const currentLock = lockMap[normalizedEmail] ?? null;

    if (currentLock?.lockedUntil && currentLock.lockedUntil > nowMs) {
      return {
        ok: false,
        lockedUntil: new Date(currentLock.lockedUntil).toISOString(),
      };
    }

    const profiles = await lmsService.listProfiles();
    const match = profiles.find((p) => p.email.toLowerCase() === normalizedEmail);
    const validPassword = password === 'password123' || password === 'demo1234';

    if (!match || !validPassword) {
      const { next, isLocked, lockedUntilIso } = evaluateLockoutState(currentLock, nowMs);
      lockMap[normalizedEmail] = next;
      saveLockoutMap(lockMap);
      if (isLocked && lockedUntilIso) {
        return { ok: false, lockedUntil: lockedUntilIso };
      }
      return { ok: false, error: 'Invalid credentials. Please try again.' };
    }

    // Clear lockout on success
    delete lockMap[normalizedEmail];
    saveLockoutMap(lockMap);
    localStorage.setItem(DEMO_SESSION_KEY, match.id);
    setUser({
      id: match.id,
      email: match.email,
      full_name: match.full_name,
      role: match.role,
      avatar_url: match.avatar_url,
      activity_status: match.activity_status ?? 'active',
      program_course: match.program_course ?? null,
      social_links: match.social_links ?? [],
    });
    return { ok: true };
  }, []);

  const signInDemo = useCallback(async (role: UserRole) => {
    const targetId = role === 'professor' ? DEMO_PROFESSOR_ID : DEMO_STUDENT_ID;
    localStorage.setItem(DEMO_SESSION_KEY, targetId);
    await loadDemoUser(targetId);
  }, [loadDemoUser]);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem(DEMO_SESSION_KEY);
    }
    setSession(null);
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const profile = await lmsService.getProfile(user.id);
    if (profile) {
      setUser((prev) =>
        prev
          ? {
              ...prev,
              full_name: profile.full_name,
              email: profile.email,
              avatar_url: profile.avatar_url,
              activity_status: profile.activity_status ?? 'active',
              program_course: profile.program_course ?? null,
              social_links: profile.social_links ?? [],
            }
          : null,
      );
    }
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      role: user?.role ?? null,
      isLoading,
      isDemoMode: !isSupabaseConfigured,
      signIn,
      signInDemo,
      signOut,
      refreshProfile,
    }),
    [user, session, isLoading, signIn, signInDemo, signOut, refreshProfile],
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
