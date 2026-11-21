import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import { passwordResetRequestSchema } from '../../lib/validators';

// Identical response body regardless of whether email exists (Requirement 1.4)
const GENERIC_RESET_MESSAGE =
  'If an account is registered for that email address, a single-use password reset link (valid for 30 minutes) will be sent within 60 seconds.';

export default function PasswordResetRequestPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);

    const parsed = passwordResetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.resetPasswordForEmail(parsed.data.email, {
          redirectTo: `${window.location.origin}/auth/reset-password/confirm`,
        });
      }
      // Requirement 1.4: Always display the exact same message whether or not email exists
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F3FF] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <img
            src="/logo.jpg"
            alt="StarS LMS logo"
            className="h-11 w-11 rounded-xl object-cover shadow-sm"
          />
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EDE9FE] text-[#7C5CFC]">
            <Mail className="h-5 w-5" />
          </div>
        </div>

        <h1 className="text-xl font-bold text-[#1E1B4B]">Reset your password</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Enter your university email and we will send a secure reset link.
        </p>

        {submitted ? (
          <div className="mt-6 space-y-4">
            <div
              role="status"
              className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{GENERIC_RESET_MESSAGE}</p>
            </div>
            <Link
              to="/auth/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7C5CFC] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="you@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
            />
            <Button type="submit" isLoading={isSubmitting} className="w-full" size="lg">
              Send reset link
            </Button>
            <div className="text-center">
              <Link
                to="/auth/login"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7280] hover:text-[#7C5CFC]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Return to login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
