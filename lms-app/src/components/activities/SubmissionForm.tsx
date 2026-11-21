import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Paperclip, Trash2 } from 'lucide-react';
import { Badge, Button, Textarea } from '../ui';
import { canResubmit } from '../../lib/classifySubmission';
import type { Activity, Submission } from '../../lib/types';
import { validateSubmissionFiles } from '../../lib/validators';

interface SubmissionFormProps {
  activity: Activity;
  existingSubmission?: Submission | null;
  onSubmit: (files: File[], textAnswer: string) => Promise<void>;
}

export function SubmissionForm({
  activity,
  existingSubmission,
  onSubmit,
}: SubmissionFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [textAnswer, setTextAnswer] = useState(existingSubmission?.text_answer ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const now = new Date();
  const isPastDeadline = now.getTime() > new Date(activity.deadline).getTime();

  const resubCheck = canResubmit({
    hasExistingSubmission: Boolean(existingSubmission),
    allowResubmission: activity.allow_resubmission,
    resubmissionCount: existingSubmission?.resubmission_count ?? 0,
    maxResubmissions: activity.max_resubmissions,
    deadline: activity.deadline,
    now,
  });

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const picked = Array.from(e.target.files ?? []);
    const combined = [...files, ...picked];
    const validation = validateSubmissionFiles(combined);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid files selected.');
      return;
    }
    setFiles(combined);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!resubCheck.allowed) {
      setError(resubCheck.reason ?? 'Resubmission not allowed.');
      return;
    }

    if (files.length === 0 && textAnswer.trim().length === 0) {
      setError('Please enter a text response or attach at least one file before submitting.');
      return;
    }

    const validation = validateSubmissionFiles(files);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid submission files.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(files, textAnswer.trim());
      setFiles([]);
    } catch (err) {
      setError((err as Error).message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Existing submission summary & released grade/feedback (Requirement 7.7) */}
      {existingSubmission && (
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#F5F3FF] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-semibold text-[#1E1B4B]">Current Submission</span>
            </div>
            <Badge variant={existingSubmission.status}>{existingSubmission.status}</Badge>
          </div>

          <p className="text-xs text-[#6B7280]">
            Submitted:{' '}
            {existingSubmission.submitted_at
              ? new Date(existingSubmission.submitted_at).toLocaleString()
              : '—'}
            {activity.allow_resubmission &&
              ` · Resubmissions used: ${existingSubmission.resubmission_count}/${activity.max_resubmissions}`}
          </p>

          {existingSubmission.grade !== null ? (
            <div className="rounded-xl border border-emerald-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                  Released Grade
                </span>
                <span className="text-xl font-bold text-emerald-600">
                  {existingSubmission.grade} / {existingSubmission.max_score || 100}
                </span>
              </div>
              {existingSubmission.feedback && (
                <p className="mt-2 text-sm text-[#374151]">
                  <strong className="text-[#1E1B4B]">Instructor Feedback:</strong>{' '}
                  {existingSubmission.feedback}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-[#EDE9FE] bg-white px-4 py-2.5 text-xs font-medium text-[#7C5CFC]">
              Pending Grade — Your professor has not released a grade yet.
            </div>
          )}

          {existingSubmission.files.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#6B7280]">Attached Files:</p>
              <div className="flex flex-wrap gap-2">
                {existingSubmission.files.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs text-[#1E1B4B]"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-[#7C5CFC]" />
                    {f.original_filename}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Submission / Resubmission Form */}
      {!resubCheck.allowed ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-800">
          {resubCheck.reason}
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1E1B4B]">
              {existingSubmission ? 'Update / Resubmit Work' : 'Submit Your Work'}
            </h3>
            {isPastDeadline && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                Past deadline — will be marked Late
              </span>
            )}
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <Textarea
            label="Text Answer / Notes"
            rows={5}
            placeholder="Type your response, essay, or notes for your instructor..."
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">
              Attach Files (PDF, DOC, DOCX, JPEG, PNG, ZIP · Max 10 files, 100 MB total)
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#D8D4F2] bg-[#F5F3FF]/50 px-4 py-6 text-center transition hover:border-[#7C5CFC]">
              <FileUp className="h-6 w-6 text-[#7C5CFC]" />
              <span className="mt-2 text-xs font-semibold text-[#7C5CFC]">
                Click to choose files
              </span>
              <span className="mt-0.5 text-[11px] text-[#6B7280]">
                {files.length}/10 files selected
              </span>
              <input
                type="file"
                multiple
                onChange={handleFilePick}
                className="hidden"
              />
            </label>

            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map((f, idx) => (
                  <li
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between rounded-lg border border-[#E5E7EB] bg-gray-50 px-3 py-2 text-xs"
                  >
                    <span className="truncate font-medium text-[#1E1B4B]">
                      {f.name} ({(f.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-red-500 hover:text-red-700 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button type="submit" isLoading={submitting} size="lg">
            {existingSubmission ? 'Submit Updated Work' : 'Submit Activity'}
          </Button>
        </form>
      )}
    </div>
  );
}
