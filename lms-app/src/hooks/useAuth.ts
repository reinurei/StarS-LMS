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
import { validateAndConsumeFacultyCode } from '../lib/facultyCode';
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
  is_super_admin?: boolean;
}

export interface SignInResult {
  ok: boolean;
  error?: string;
  lockedUntil?: string;
}

export interface SignUpResult {
  ok: boolean;
  error?: string;
  needsEmailConfirmation?: boolean;
}

export interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  role: UserRole | null;
  isSuperAdmin: boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
    facultyPasscode?: string,
  ) => Promise<SignUpResult>;
  signInWithGoogle: (roleHint?: UserRole) => Promise<{ ok: boolean; error?: string }>;
  signInDemo: (role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const DEMO_SESSION_KEY = 'lms_demo_active_user_id_v1';
const DEMO_PASSWORDS_KEY = 'lms_demo_user_passwords_v1';
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

function getDemoPasswords(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DEMO_PASSWORDS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveDemoPassword(email: string, pass: string): void {
  try {
    const map = getDemoPasswords();
    map[email.toLowerCase()] = pass;
    localStorage.setItem(DEMO_PASSWORDS_KEY, JSON.stringify(map));
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

function checkIsSuperAdmin(email: string, appMetadata?: Record<string, unknown>): boolean {
  if (appMetadata?.is_super_admin === true || appMetadata?.role === 'super_admin') {
    return true;
  }
  const configuredAdminEmail = (import.meta.env.VITE_SUPER_ADMIN_EMAIL as string | undefined)?.trim().toLowerCase();
  if (configuredAdminEmail && email.toLowerCase() === configuredAdminEmail) {
    return true;
  }
  // Standard initial system owner accounts
  const normalized = email.toLowerCase();
  if (normalized === 'admin@university.edu' || normalized === 'owner@university.edu' || normalized === 'professor@university.edu') {
    return true;
  }
  return false;
}

function mapSupabaseUser(sbUser: User, profile: Profile | null, role: UserRole): AuthUser {
  const isSuper = checkIsSuperAdmin(profile?.email ?? sbUser.email ?? '', sbUser.app_metadata);
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
    is_super_admin: isSuper,
  };
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  role: null,
  isSuperAdmin: false,
  isLoading: true,
  isDemoMode: !isSupabaseConfigured,
  signIn: async () => ({ ok: false }),
  signUp: async () => ({ ok: false }),
  signInWithGoogle: async () => ({ ok: false }),
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
        is_super_admin: checkIsSuperAdmin(profile.email),
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
        const msg = error.message.toLowerCase();
        if (msg.includes('rate limit')) {
          return { ok: false, error: 'Too many attempts. Please wait a moment and try again.' };
        }
        if (msg.includes('email not confirmed')) {
          return {
            ok: false,
            error:
              'Email not confirmed yet. Please check your email inbox to verify, or disable "Confirm email" in Supabase Dashboard (Authentication → Providers → Email).',
          };
        }
        if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
          return {
            ok: false,
            error:
              'Invalid email or password. If you just registered this account, please confirm your email first, or turn OFF "Confirm email" in your Supabase Dashboard.',
          };
        }
        return { ok: false, error: error.message };
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
    const userStoredPassword = getDemoPasswords()[normalizedEmail];
    const validPassword =
      (userStoredPassword && userStoredPassword === password) ||
      password === 'password123' ||
      password === 'demo1234';

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

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      role: UserRole,
      facultyPasscode?: string,
    ): Promise<SignUpResult> => {
      const normalizedEmail = email.trim().toLowerCase();
      const trimmedName = fullName.trim();

      let resolvedRole: UserRole = role;
      if (role === 'professor') {
        if (!facultyPasscode || !facultyPasscode.trim()) {
          return {
            ok: false,
            error:
              'A Faculty Admin Code is required to verify instructor privileges. Please enter the code provided by your department administrator.',
          };
        }

        const check = await validateAndConsumeFacultyCode(facultyPasscode, normalizedEmail);
        if (!check.valid) {
          return {
            ok: false,
            error: check.error ?? 'Invalid or expired Faculty Admin Code.',
          };
        }
        resolvedRole = 'professor';
      }

      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: {
                full_name: trimmedName,
                role: resolvedRole,
              },
              emailRedirectTo: `${window.location.origin}/dashboard`,
            },
          });

          if (error) {
            return { ok: false, error: error.message };
          }

          if (data.session) {
            return { ok: true };
          }

          // Try signing in immediately (works automatically when Confirm Email is turned off in Supabase)
          const autoSignIn = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });

          if (autoSignIn.data?.session) {
            return { ok: true };
          }

          return { ok: true, needsEmailConfirmation: true };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Sign up failed';
          return { ok: false, error: msg };
        }
      }

      // Demo Mode Registration
      const profiles = await lmsService.listProfiles();
      const existing = profiles.find((p) => p.email.toLowerCase() === normalizedEmail);
      if (existing) {
        return { ok: false, error: 'An account with this email address already exists in Demo mode.' };
      }

      saveDemoPassword(normalizedEmail, password);
      const newProfile = await lmsService.createDemoProfile({
        full_name: trimmedName,
        email: normalizedEmail,
        role: resolvedRole,
      });

      localStorage.setItem(DEMO_SESSION_KEY, newProfile.id);
      setUser({
        id: newProfile.id,
        email: newProfile.email,
        full_name: newProfile.full_name,
        role: newProfile.role,
        avatar_url: null,
        activity_status: 'active',
        program_course: newProfile.program_course ?? null,
        social_links: [],
      });

      return { ok: true };
    },
    [],
  );

  const signInWithGoogle = useCallback(
    async (roleHint: UserRole = 'student'): Promise<{ ok: boolean; error?: string }> => {
      if (isSupabaseConfigured) {
        try {
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/dashboard`,
              queryParams: {
                access_type: 'offline',
                prompt: 'select_account',
              },
            },
          });
          if (error) {
            return { ok: false, error: error.message };
          }
          return { ok: true };
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : 'Google sign-in failed' };
        }
      }

      // Demo Mode Google Login Simulation
      const demoEmail = roleHint === 'professor' ? 'faculty.google@gmail.com' : 'student.google@gmail.com';
      const demoName = roleHint === 'professor' ? 'Prof. Google User' : 'Google Student User';

      const profiles = await lmsService.listProfiles();
      let match = profiles.find((p) => p.email.toLowerCase() === demoEmail);
      if (!match) {
        match = await lmsService.createDemoProfile({
          full_name: demoName,
          email: demoEmail,
          role: roleHint,
        });
      }

      localStorage.setItem(DEMO_SESSION_KEY, match.id);
      setUser({
        id: match.id,
        email: match.email,
        full_name: match.full_name,
        role: match.role,
        avatar_url: null,
        activity_status: 'active',
        program_course: match.program_course ?? null,
        social_links: [],
      });

      return { ok: true };
    },
    [],
  );

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
      isSuperAdmin: Boolean(user?.is_super_admin),
      isLoading,
      isDemoMode: !isSupabaseConfigured,
      signIn,
      signUp,
      signInWithGoogle,
      signInDemo,
      signOut,
      refreshProfile,
    }),
    [user, session, isLoading, signIn, signUp, signInWithGoogle, signInDemo, signOut, refreshProfile],
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
