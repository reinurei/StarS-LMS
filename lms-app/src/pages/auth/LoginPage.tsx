import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, Lock, ShieldAlert, UserCheck } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { loginSchema } from '../../lib/validators';

export function formatLockoutMessage(lockedUntilIso: string): string {
  const date = new Date(lockedUntilIso);
  const formatted = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `Account locked due to 5 consecutive failed login attempts. Try again after ${formatted} (15-minute lockout).`;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signInDemo, isDemoMode } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [lockoutMessage, setLockoutMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLockoutMessage(null);
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errs: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'email') errs.email = issue.message;
        if (issue.path[0] === 'password') errs.password = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn(parsed.data.email, parsed.data.password);
      if (!result.ok) {
        if (result.lockedUntil) {
          setLockoutMessage(formatLockoutMessage(result.lockedUntil));
        } else {
          setAuthError(result.error ?? 'Invalid credentials. Please try again.');
        }
        return;
      }
      navigate('/dashboard', { replace: true });
    } finally {
      setIsSubmitting(false);
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
        {/* Brand Logo */}
        <div className="mb-5 flex flex-col items-center text-center">
          <img
            src="/logo.jpg"
            alt="StarS LMS logo"
            className="h-24 w-24 rounded-3xl object-cover shadow-lg ring-4 ring-white"
          />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#1E1B4B]">StarS LMS</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            University Learning Management Platform
          </p>
        </div>

        {/* Main Card */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-lg">
          <h2 className="text-lg font-semibold text-[#1E1B4B]">Sign in to your account</h2>
          <p className="mt-1 text-xs text-[#6B7280]">
            Enter your university credentials to continue.
          </p>

          {lockoutMessage && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{lockoutMessage}</span>
            </div>
          )}

          {authError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="professor@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
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
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
              />
            </div>

            <Button type="submit" isLoading={isSubmitting} className="w-full" size="lg">
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {/* Instant Demo Access */}
          {isDemoMode && (
            <div className="mt-6 border-t border-[#E5E7EB] pt-5">
              <p className="mb-3 text-center text-xs font-medium text-[#6B7280]">
                Instant Local Preview (Demo Password: <code className="text-[#7C5CFC]">password123</code>)
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
