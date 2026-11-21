import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock, LayoutList, Play, Rows3 } from 'lucide-react';
import { StarMascot } from '../mascot/StarMascot';
import { Badge, Button, Input } from '../ui';
import { randomizeQuestions } from '../../lib/scoreQuizSubmission';
import type { Activity, Question, Submission } from '../../lib/types';

interface QuizPlayerProps {
  activity: Activity;
  studentId: string;
  existingSubmission?: Submission | null;
  onComplete: (params: {
    answers: Record<string, string>;
    startedAt: string;
    timedOut: boolean;
  }) => Promise<void>;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function QuizPlayer({
  activity,
  studentId,
  existingSubmission,
  onComplete,
}: QuizPlayerProps) {
  const [started, setStarted] = useState(false);
  const [startedAt, setStartedAt] = useState<string>('');
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(
    (activity.time_limit_minutes ?? 30) * 60,
  );
  const [submitting, setSubmitting] = useState(false);

  const answersRef = useRef(answers);
  const startedAtRef = useRef(startedAt);
  const submittedRef = useRef(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    startedAtRef.current = startedAt;
  }, [startedAt]);

  // Requirement 17.4: Randomize question order per student session when enabled
  const orderedQuestions: Question[] = useMemo(() => {
    const base = activity.questions ?? [];
    if (activity.randomize_questions) {
      return randomizeQuestions(base, `${activity.id}:${studentId}:${startedAt || 'init'}`);
    }
    return [...base].sort((a, b) => a.display_order - b.display_order);
  }, [activity.id, activity.questions, activity.randomize_questions, studentId, startedAt]);

  const submitNow = useCallback(
    async (timedOut: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        await onComplete({
          answers: answersRef.current,
          startedAt: startedAtRef.current || new Date().toISOString(),
          timedOut,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [onComplete],
  );

  // Requirement 17.2 & 17.5: Countdown timer that auto-submits on expiry saving all entered answers
  useEffect(() => {
    if (!started || !activity.time_limit_minutes) return;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          submitNow(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [started, activity.time_limit_minutes, submitNow]);

  if (existingSubmission) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <h3 className="text-lg font-semibold text-[#1E1B4B]">Quiz Completed</h3>
          </div>
          <Badge variant={existingSubmission.status}>{existingSubmission.status}</Badge>
        </div>

        <div className="rounded-xl bg-[#F5F3FF] p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <StarMascot pose="cheer" size={84} message="Awesome job!" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                Auto-Graded Score
              </p>
              <p className="mt-1 text-sm text-[#374151]">{existingSubmission.feedback}</p>
            </div>
          </div>
          <div className="text-3xl font-extrabold text-[#7C5CFC]">
            {existingSubmission.grade ?? 0}%
          </div>
        </div>

        {existingSubmission.timed_out_at && (
          <p className="text-xs text-orange-700">
            Session expired at {new Date(existingSubmission.timed_out_at).toLocaleString()}; all
            entered answers were automatically saved.
          </p>
        )}
      </div>
    );
  }

  if (!started) {
    return (
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xs space-y-4">
        <h3 className="text-lg font-semibold text-[#1E1B4B]">Ready to begin?</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[#F5F3FF] p-3.5">
            <p className="text-xs text-[#6B7280]">Questions</p>
            <p className="mt-1 text-lg font-bold text-[#1E1B4B]">{orderedQuestions.length}</p>
          </div>
          <div className="rounded-xl bg-[#F5F3FF] p-3.5">
            <p className="text-xs text-[#6B7280]">Time Limit</p>
            <p className="mt-1 text-lg font-bold text-[#1E1B4B]">
              {activity.time_limit_minutes ? `${activity.time_limit_minutes} mins` : 'Untimed'}
            </p>
          </div>
          <div className="rounded-xl bg-[#F5F3FF] p-3.5">
            <p className="text-xs text-[#6B7280]">Question Order</p>
            <p className="mt-1 text-lg font-bold text-[#1E1B4B]">
              {activity.randomize_questions ? 'Randomized' : 'Sequential'}
            </p>
          </div>
        </div>
        <p className="text-xs text-[#6B7280]">
          Once started, your start time is recorded and the timer will automatically submit your answers when time expires.
        </p>
        <Button
          size="lg"
          onClick={() => {
            submittedRef.current = false;
            setStartedAt(new Date().toISOString());
            setSecondsLeft((activity.time_limit_minutes ?? 30) * 60);
            setStarted(true);
          }}
        >
          <Play className="h-4 w-4" />
          Start Quiz Now
        </Button>
      </div>
    );
  }

  const renderQuestion = (q: Question, idx: number) => {
    const val = answers[q.id] ?? '';
    const isMcq = q.options && q.options.length > 0;
    return (
      <div key={q.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant="primary">
            Question {idx + 1} of {orderedQuestions.length}
          </Badge>
          <span className="text-xs text-[#6B7280]">
            {isMcq ? 'Multiple Choice' : 'Short Answer'}
          </span>
        </div>
        <p className="text-sm font-semibold text-[#1E1B4B]">{q.question_text}</p>

        {isMcq ? (
          <div className="space-y-2">
            {q.options.map((opt) => {
              const checked = val === opt.option_text;
              return (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                    checked
                      ? 'border-[#7C5CFC] bg-[#EDE9FE]/60 font-medium text-[#1E1B4B]'
                      : 'border-[#E5E7EB] hover:bg-gray-50 text-[#374151]'
                  }`}
                >
                  <input
                    type="radio"
                    name={`question-${q.id}`}
                    value={opt.option_text}
                    checked={checked}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.option_text }))}
                    className="accent-[#7C5CFC]"
                  />
                  <span>{opt.option_text}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <Input
            placeholder="Type your short answer..."
            value={val}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
          />
        )}
      </div>
    );
  };

  const answeredCount = orderedQuestions.filter((q) => (answers[q.id] ?? '').trim().length > 0).length;

  return (
    <div className="space-y-4">
      {/* Sticky Quiz Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#7C5CFC]/30 bg-white px-5 py-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          {activity.time_limit_minutes && (
            <div
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold ${
                secondsLeft <= 60
                  ? 'bg-red-100 text-red-700 animate-pulse'
                  : 'bg-[#EDE9FE] text-[#7C5CFC]'
              }`}
            >
              <Clock className="h-4 w-4" />
              {formatTimer(secondsLeft)}
            </div>
          )}
          <span className="text-xs font-medium text-[#6B7280]">
            Answered {answeredCount}/{orderedQuestions.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'single' ? 'all' : 'single')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium text-[#1E1B4B] hover:bg-[#F5F3FF] cursor-pointer"
          >
            {viewMode === 'single' ? (
              <>
                <Rows3 className="h-3.5 w-3.5" /> Show All
              </>
            ) : (
              <>
                <LayoutList className="h-3.5 w-3.5" /> One-by-One
              </>
            )}
          </button>
          <Button size="sm" isLoading={submitting} onClick={() => submitNow(false)}>
            Submit Quiz
          </Button>
        </div>
      </div>

      {/* Question Display */}
      {viewMode === 'all' ? (
        <div className="space-y-4">
          {orderedQuestions.map((q, idx) => renderQuestion(q, idx))}
        </div>
      ) : (
        <div className="space-y-4">
          {orderedQuestions[currentIndex] &&
            renderQuestion(orderedQuestions[currentIndex], currentIndex)}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            >
              Previous
            </Button>
            {currentIndex < orderedQuestions.length - 1 ? (
              <Button onClick={() => setCurrentIndex((i) => i + 1)}>Next Question</Button>
            ) : (
              <Button isLoading={submitting} onClick={() => submitNow(false)}>
                Finish & Submit Quiz
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
