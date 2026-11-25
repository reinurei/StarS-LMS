import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lock,
  Mail,
  ShieldAlert,
  Sparkles,
  User,
  UserCheck,
} from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { getLatestActiveFacultyCode } from '../../lib/facultyCode';
import { loginSchema, signUpSchema } from '../../lib/validators';
import type { UserRole } from '../../lib/types';

export function formatLockoutMessage(lockedUntilIso: string): string {
  const date = new Date(lockedUntilIso);
  const formatted = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `Account locked due to 5 consecutive failed login attempts. Try again after ${formatted} (15-minute lockout).`;
}

interface LoginPageProps {
  initialMode?: 'signin' | 'signup';
}

export default function LoginPage({ initialMode = 'signin' }: LoginPageProps) {
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle, signInDemo, isDemoMode } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);

  // Common UI State
  const [authError, setAuthError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Sign In Form State
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signInFieldErrors, setSignInFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [lockoutMessage, setLockoutMessage] = useState<string | null>(null);

  // Sign Up Form State
  const [signUpFullName, setSignUpFullName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpRole, setSignUpRole] = useState<UserRole>('student');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState('');
  const [facultyPasscode, setFacultyPasscode] = useState('');
  const [signUpFieldErrors, setSignUpFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    facultyPasscode?: string;
  }>({});

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLockoutMessage(null);
    setSignInFieldErrors({});

    const parsed = loginSchema.safeParse({ email: signInEmail, password: signInPassword });
    if (!parsed.success) {
      const errs: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'email') errs.email = issue.message;
        if (issue.path[0] === 'password') errs.password = issue.message;
      }
      setSignInFieldErrors(errs);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn(parsed.data.email, parsed.data.password);
      if (!result.ok) {
        if (result.lockedUntil) {
          setLockoutMessage(formatLockoutMessage(result.lockedUntil));
        } else {
          setAuthError(result.error ?? 'Invalid email or password. Please try again.');
        }
        return;
      }
      navigate('/dashboard', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setSuccessMessage(null);
    setSignUpFieldErrors({});

    const parsed = signUpSchema.safeParse({
      fullName: signUpFullName,
      email: signUpEmail,
      role: signUpRole,
      password: signUpPassword,
      confirmPassword: signUpConfirmPassword,
      facultyPasscode,
    });

    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const fieldName = String(issue.path[0]);
        errs[fieldName] = issue.message;
      }
      setSignUpFieldErrors(errs);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signUp(
        parsed.data.email,
        parsed.data.password,
        parsed.data.fullName,
        parsed.data.role,
        parsed.data.facultyPasscode,
      );

      if (!result.ok) {
        setAuthError(result.error ?? 'Could not create account. Please try again.');
        return;
      }

      if (result.needsEmailConfirmation) {
        setSuccessMessage(
          `Account created for ${parsed.data.email}! Supabase requires email verification before signing in. Please check your inbox (or turn OFF "Confirm email" in Supabase Authentication → Providers → Email).`,
        );
        return;
      }

      navigate('/dashboard', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setIsGoogleSubmitting(true);
    try {
      const roleHint = mode === 'signup' ? signUpRole : 'student';
      const result = await signInWithGoogle(roleHint);
      if (!result.ok && result.error) {
        if (
          result.error.toLowerCase().includes('not enabled') ||
          result.error.toLowerCase().includes('unsupported provider')
        ) {
          setAuthError(
            'Google Sign-In is not enabled yet in your Supabase project. Enable Google under Authentication → Providers in the Supabase Dashboard, or sign in using Email & Password below.',
          );
        } else {
          setAuthError(result.error);
        }
        return;
      }
      if (isDemoMode) {
        navigate('/dashboard', { replace: true });
      }
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleDemoLogin = async (role: 'professor' | 'student') => {
    setIsSubmitting(true);
    try {
      await signInDemo(role);
      navigate('/dashboard', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#F5F3FF] via-[#EDE9FE]/60 to-[#EEF2FF] px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand Logo & Header */}
        <div className="mb-5 flex flex-col items-center text-center">
          <img
            src="/logo.jpg"
            alt="StarS LMS logo"
            className="h-20 w-20 rounded-3xl object-cover shadow-lg ring-4 ring-white"
          />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#1E1B4B]">StarS LMS</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            University Learning Management Platform
          </p>
        </div>

        {/* Main Card */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xl sm:p-8">
          {/* Mode Switch Tabs */}
          <div className="mb-6 flex rounded-xl bg-[#F3F4F6] p-1">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setAuthError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition-all duration-150 ${
                mode === 'signin'
                  ? 'bg-white text-[#1E1B4B] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#1E1B4B]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setAuthError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition-all duration-150 ${
                mode === 'signup'
                  ? 'bg-white text-[#1E1B4B] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#1E1B4B]'
              }`}
            >
              Create Account
            </button>
          </div>

          <div className="mb-5">
            <h2 className="text-xl font-bold text-[#1E1B4B]">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-1 text-xs text-[#6B7280]">
              {mode === 'signin'
                ? 'Sign in with your Google account or email credentials.'
                : 'Register your account with your own password or Google.'}
            </p>
          </div>

          {/* Success Message Banner */}
          {successMessage && (
            <div
              role="status"
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-800"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium text-emerald-900">{successMessage}</p>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setSuccessMessage(null);
                  }}
                  className="mt-2 text-xs font-semibold text-[#7C5CFC] underline hover:text-[#6842EA]"
                >
                  Proceed to Sign In
                </button>
              </div>
            </div>
          )}

          {/* Lockout Message Banner */}
          {lockoutMessage && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{lockoutMessage}</span>
            </div>
          )}

          {/* Error Message Banner */}
          {authError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {/* Google / Gmail Sign In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleSubmitting || isSubmitting}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#D1D5DB] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] shadow-sm transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {/* Google SVG Icon */}
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
            <span>
              {isGoogleSubmitting
                ? 'Connecting to Google…'
                : mode === 'signin'
                  ? 'Sign in with Google / Gmail'
                  : 'Sign up with Google / Gmail'}
            </span>
          </button>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E5E7EB]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2.5 font-medium text-[#9CA3AF]">
                or continue with email & password
              </span>
            </div>
          </div>

          {/* ===================== SIGN IN FORM ===================== */}
          {mode === 'signin' && (
            <form onSubmit={handleSignInSubmit} noValidate className="space-y-4">
              <Input
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="name@university.edu or @gmail.com"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                error={signInFieldErrors.email}
              />

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="login-password" className="text-sm font-medium text-[#1E1B4B]">
                    Password
                  </label>
                  <Link
                    to="/auth/reset-password"
                    className="text-xs font-medium text-[#7C5CFC] hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    error={signInFieldErrors.password}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-2.5 text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" isLoading={isSubmitting} className="w-full" size="lg">
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}

          {/* ===================== SIGN UP FORM ===================== */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUpSubmit} noValidate className="space-y-4">
              <Input
                label="Full name"
                type="text"
                autoComplete="name"
                placeholder="e.g. Dr. Jane Smith or Alex Rivera"
                value={signUpFullName}
                onChange={(e) => setSignUpFullName(e.target.value)}
                error={signUpFieldErrors.fullName}
              />

              <Input
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="yourname@gmail.com or @university.edu"
                value={signUpEmail}
                onChange={(e) => setSignUpEmail(e.target.value)}
                error={signUpFieldErrors.email}
              />

              {/* Role Selection */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">
                  I am registering as:
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSignUpRole('student')}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all ${
                      signUpRole === 'student'
                        ? 'border-[#7C5CFC] bg-[#F5F3FF] text-[#7C5CFC] shadow-sm'
                        : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-gray-50'
                    }`}
                  >
                    <GraduationCap className="h-4 w-4" />
                    <span>Student</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignUpRole('professor')}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all ${
                      signUpRole === 'professor'
                        ? 'border-[#7C5CFC] bg-[#F5F3FF] text-[#7C5CFC] shadow-sm'
                        : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-gray-50'
                    }`}
                  >
                    <UserCheck className="h-4 w-4" />
                    <span>Professor / Faculty</span>
                  </button>
                </div>
              </div>

              {/* Faculty Admin Passcode if Professor selected */}
              {signUpRole === 'professor' && (
                <div className="rounded-xl border border-[#E9D5FF] bg-[#FAF5FF] p-3.5 text-xs">
                  <div className="mb-1.5 flex items-center justify-between font-semibold text-[#6B21A8]">
                    <div className="flex items-center gap-1.5">
                      <KeyRound className="h-4 w-4" />
                      <span>Random Faculty Admin Code</span>
                    </div>
                    {isDemoMode && getLatestActiveFacultyCode() && (
                      <button
                        type="button"
                        onClick={() => {
                          const demoCode = getLatestActiveFacultyCode();
                          if (demoCode) setFacultyPasscode(demoCode);
                        }}
                        className="rounded-md bg-[#EDE9FE] px-2 py-0.5 text-[11px] font-bold text-[#7C5CFC] transition hover:bg-[#DDD6FE]"
                      >
                        Auto-fill: {getLatestActiveFacultyCode()}
                      </button>
                    )}
                  </div>
                  <p className="mb-2 text-[#7E22CE]">
                    To register as a Professor / Admin, enter the randomly generated code provided by your department administrator (e.g.{' '}
                    <code className="rounded bg-[#EDE9FE] px-1 py-0.5 font-bold">PROF-XXXX-XXXX</code>).
                  </p>
                  <Input
                    type="text"
                    placeholder="e.g. PROF-8K2N-9X4M"
                    value={facultyPasscode}
                    onChange={(e) => setFacultyPasscode(e.target.value.toUpperCase())}
                    error={signUpFieldErrors.facultyPasscode}
                    className="font-mono uppercase tracking-wider"
                  />
                </div>
              )}

              {/* Create Your Own Password */}
              <div>
                <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">
                  Create Password
                </label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={signUpPassword}
                    onChange={(e) => setSignUpPassword(e.target.value)}
                    error={signUpFieldErrors.password}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-2.5 text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="signup-confirm-password" className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">
                  Confirm Password
                </label>
                <div className="relative">
                  <Input
                    id="signup-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                    value={signUpConfirmPassword}
                    onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                    error={signUpFieldErrors.confirmPassword}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-2.5 text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" isLoading={isSubmitting} className="w-full" size="lg">
                {isSubmitting ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          )}

          {/* Bottom Switcher */}
          <div className="mt-6 text-center text-xs text-[#6B7280]">
            {mode === 'signin' ? (
              <p>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setAuthError(null);
                    setSuccessMessage(null);
                  }}
                  className="font-semibold text-[#7C5CFC] hover:underline"
                >
                  Create one now
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setAuthError(null);
                    setSuccessMessage(null);
                  }}
                  className="font-semibold text-[#7C5CFC] hover:underline"
                >
                  Sign in here
                </button>
              </p>
            )}
          </div>

          {/* Instant Demo Access (Demo Mode only) */}
          {isDemoMode && (
            <div className="mt-6 border-t border-[#E5E7EB] pt-5">
              <p className="mb-3 text-center text-xs font-medium text-[#6B7280]">
                Instant Local Preview (Pre-seeded Demo Accounts)
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => handleDemoLogin('professor')}
                  className="w-full"
                >
                  <UserCheck className="h-4 w-4" />
                  Professor Demo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => handleDemoLogin('student')}
                  className="w-full"
                >
                  <GraduationCap className="h-4 w-4" />
                  Student Demo
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
