import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import { toast } from '../../lib/toast';
import { passwordResetConfirmSchema } from '../../lib/validators';

export default function PasswordResetConfirmPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSubmitError(null);

    const parsed = passwordResetConfirmSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const next: { password?: string; confirmPassword?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'password') next.password = issue.message;
        if (issue.path[0] === 'confirmPassword') next.confirmPassword = issue.message;
      }
      setErrors(next);
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
        if (error) {
          setSubmitError(error.message);
          return;
        }
      }
      toast.success('Your password has been updated. Please sign in with your new password.');
      navigate('/auth/login', { replace: true });
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
            <KeyRound className="h-5 w-5" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-[#1E1B4B]">Set a new password</h1>
        <p className="mt-1 text-sm text-[#6B7280]">Choose a strong password of at least 8 characters.</p>

        {submitError && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <Input
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
          />
          <Button type="submit" isLoading={isSubmitting} className="w-full" size="lg">
            Update password
          </Button>
          <div className="text-center">
            <Link to="/auth/login" className="text-xs font-medium text-[#7C5CFC] hover:underline">
              Back to Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
