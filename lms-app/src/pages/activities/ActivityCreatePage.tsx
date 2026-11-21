import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Textarea } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { lmsService } from '../../lib/dataService';
import { toast } from '../../lib/toast';
import type { ActivityType, Course, Material, Question } from '../../lib/types';
import { ACTIVITY_TYPES, createActivitySchema } from '../../lib/validators';

interface DraftQuestion {
  id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'short_answer';
  options: Array<{ id: string; text: string; is_correct: boolean }>;
  short_answer: string;
}

function makeDraftQuestion(): DraftQuestion {
  const qid = `dq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id: qid,
    question_text: '',
    question_type: 'multiple_choice',
    options: [
      { id: `${qid}-a`, text: '', is_correct: true },
      { id: `${qid}-b`, text: '', is_correct: false },
    ],
    short_answer: '',
  };
}

export default function ActivityCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCourse = searchParams.get('courseId') ?? '';

  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  const [courseId, setCourseId] = useState(preselectedCourse);
  const [title, setTitle] = useState('');
  const [activityType, setActivityType] = useState<ActivityType>('assignment');
  const [instructions, setInstructions] = useState('');
  const [deadline, setDeadline] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [allowResubmission, setAllowResubmission] = useState(false);
  const [maxResubmissions, setMaxResubmissions] = useState(3);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(20);
  const [randomizeQuestions, setRandomizeQuestions] = useState(true);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<DraftQuestion[]>([makeDraftQuestion()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const isQuizLike = activityType === 'quiz' || activityType === 'multiple_choice';

  useEffect(() => {
    if (!user) return;
    lmsService.listCourses(user.id, 'professor').then((list) => {
      const active = list.filter((c) => !c.is_archived);
      setCourses(active);
      if (!courseId && active[0]) {
        setCourseId(active[0].id);
      }
    });
  }, [user]);

  useEffect(() => {
    if (!courseId) return;
    lmsService.listMaterials(courseId).then(setMaterials);
  }, [courseId]);

  const addQuestion = () => {
    if (questions.length >= 200) {
      toast.warning('Maximum of 200 questions reached.');
      return;
    }
    setQuestions((prev) => [...prev, makeDraftQuestion()]);
  };

  const updateQuestion = (idx: number, patch: Partial<DraftQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const addOption = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx || q.options.length >= 6) return q;
        return {
          ...q,
          options: [...q.options, { id: `${q.id}-${Date.now()}`, text: '', is_correct: false }],
        };
      }),
    );
  };

  const setCorrectOption = (qIdx: number, optIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        return {
          ...q,
          options: q.options.map((opt, oi) => ({ ...opt, is_correct: oi === optIdx })),
        };
      }),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrors({});

    if (!courseId) {
      setErrors({ courseId: 'Please select a course.' });
      return;
    }

    const schema = createActivitySchema(new Date());
    const parsed = schema.safeParse({
      title,
      activity_type: activityType,
      instructions,
      deadline: deadline ? new Date(deadline).toISOString() : '',
      allow_resubmission: allowResubmission,
      max_resubmissions: allowResubmission ? Number(maxResubmissions) : 0,
      time_limit_minutes: isQuizLike ? Number(timeLimitMinutes) : null,
      randomize_questions: isQuizLike ? randomizeQuestions : false,
      max_score: 100,
    });

    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[String(issue.path[0] ?? 'form')] = issue.message;
      }
      setErrors(errs);
      return;
    }

    let builtQuestions: Question[] | undefined;
    if (isQuizLike) {
      if (questions.length === 0) {
        setErrors({ questions: 'Add at least 1 question for a Quiz / Multiple Choice activity.' });
        return;
      }
      builtQuestions = [];
      for (let i = 0; i < questions.length; i++) {
        const dq = questions[i];
        if (!dq.question_text.trim()) {
          setErrors({ questions: `Question ${i + 1} text is required.` });
          return;
        }
        if (dq.question_type === 'multiple_choice') {
          const validOpts = dq.options.filter((o) => o.text.trim().length > 0);
          const correctOpts = validOpts.filter((o) => o.is_correct);
          if (validOpts.length < 2 || validOpts.length > 6 || correctOpts.length !== 1) {
            setErrors({
              questions: `Question ${i + 1} must have 2–6 non-empty options and exactly 1 correct answer.`,
            });
            return;
          }
          builtQuestions.push({
            id: dq.id,
            activity_id: '',
            question_text: dq.question_text.trim(),
            question_type: 'multiple_choice',
            display_order: i + 1,
            correct_answer: correctOpts[0].text.trim(),
            options: validOpts.map((o, oi) => ({
              id: o.id,
              question_id: dq.id,
              option_text: o.text.trim(),
              is_correct: o.is_correct,
              display_order: oi + 1,
            })),
            created_at: new Date().toISOString(),
          });
        } else {
          if (!dq.short_answer.trim()) {
            setErrors({ questions: `Question ${i + 1} requires a correct short answer.` });
            return;
          }
          builtQuestions.push({
            id: dq.id,
            activity_id: '',
            question_text: dq.question_text.trim(),
            question_type: 'short_answer',
            display_order: i + 1,
            correct_answer: dq.short_answer.trim(),
            options: [],
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    setSubmitting(true);
    try {
      const created = await lmsService.createActivity(user.id, {
        course_id: courseId,
        title: parsed.data.title,
        activity_type: parsed.data.activity_type,
        instructions: parsed.data.instructions,
        deadline: parsed.data.deadline,
        allow_resubmission: parsed.data.allow_resubmission,
        max_resubmissions: parsed.data.max_resubmissions,
        time_limit_minutes: parsed.data.time_limit_minutes ?? null,
        randomize_questions: parsed.data.randomize_questions,
        max_score: 100,
        reference_material_ids: selectedMaterialIds,
        questions: builtQuestions,
      });
      toast.success('Activity published and students notified!');
      navigate(`/activities/${created.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/activities"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B7280] hover:text-[#7C5CFC]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Activities
      </Link>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="rounded-2xl border border-[#E5E7EB] bg-white p-6 sm:p-8 shadow-xs space-y-5"
      >
        <div>
          <h1 className="text-xl font-semibold text-[#1E1B4B]">Create Activity / Assessment</h1>
          <p className="mt-1 text-xs text-[#6B7280]">
            Supports all 8 academic activity types, reference materials, and timed auto-graded quizzes.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">Course</label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="block w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1E1B4B]"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.subject_code} — {c.name}
                </option>
              ))}
            </select>
            {errors.courseId && <p className="mt-1 text-xs text-red-600">{errors.courseId}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">Activity Type</label>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as ActivityType)}
              className="block w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1E1B4B] capitalize"
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Input
          label="Title"
          placeholder="e.g. Midterm Quiz: Relational Algebra"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          helperText={`${title.length}/200 characters`}
        />

        <Textarea
          label="Instructions"
          rows={4}
          placeholder="Provide clear instructions, grading rubric, and expectations..."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          error={errors.instructions}
          helperText={`${instructions.length}/5000 characters`}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Submission Deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            error={errors.deadline}
          />

          <div className="flex flex-col justify-end space-y-2 rounded-xl border border-[#E5E7EB] bg-[#F5F3FF]/50 p-3.5">
            <label className="flex items-center gap-2 text-sm font-medium text-[#1E1B4B]">
              <input
                type="checkbox"
                checked={allowResubmission}
                onChange={(e) => setAllowResubmission(e.target.checked)}
                className="accent-[#7C5CFC]"
              />
              Allow student resubmissions
            </label>
            {allowResubmission && (
              <Input
                label="Max Resubmissions (1–10)"
                type="number"
                min={1}
                max={10}
                value={maxResubmissions}
                onChange={(e) => setMaxResubmissions(Number(e.target.value))}
              />
            )}
          </div>
        </div>

        {/* Attach Reference Materials (Requirement 6.4) */}
        {materials.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium text-[#1E1B4B]">
              Attach Reference Materials (optional)
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {materials.map((m) => {
                const checked = selectedMaterialIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-xs ${
                      checked
                        ? 'border-[#7C5CFC] bg-[#EDE9FE]/50 text-[#1E1B4B]'
                        : 'border-[#E5E7EB] text-[#6B7280]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedMaterialIds((prev) =>
                          prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id],
                        )
                      }
                      className="accent-[#7C5CFC]"
                    />
                    <span className="truncate font-medium">{m.title}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Quiz / Multiple Choice Question Builder (Requirements 6.5, 17.1) */}
        {isQuizLike && (
          <div className="space-y-4 rounded-2xl border border-[#7C5CFC]/30 bg-[#F5F3FF]/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[#1E1B4B]">
                  Quiz Settings & Question Builder
                </h2>
                <p className="text-xs text-[#6B7280]">
                  Up to 100/200 questions, 2–6 options per MCQ, exactly 1 correct answer.
                </p>
              </div>
              <Badge variant="primary">{questions.length} question(s)</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Time Limit (1–300 minutes)"
                type="number"
                min={1}
                max={300}
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                error={errors.time_limit_minutes}
              />
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm font-medium text-[#1E1B4B]">
                  <input
                    type="checkbox"
                    checked={randomizeQuestions}
                    onChange={(e) => setRandomizeQuestions(e.target.checked)}
                    className="accent-[#7C5CFC]"
                  />
                  Randomize question order per student
                </label>
              </div>
            </div>

            {errors.questions && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {errors.questions}
              </p>
            )}

            <div className="space-y-4">
              {questions.map((q, qIdx) => (
                <div
                  key={q.id}
                  className="rounded-xl border border-[#E5E7EB] bg-white p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#7C5CFC]">Question {qIdx + 1}</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={q.question_type}
                        onChange={(e) =>
                          updateQuestion(qIdx, {
                            question_type: e.target.value as 'multiple_choice' | 'short_answer',
                          })
                        }
                        className="rounded-lg border border-[#E5E7EB] px-2 py-1 text-xs"
                      >
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="short_answer">Short Answer (Auto-Graded)</option>
                      </select>
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setQuestions((prev) => prev.filter((_, i) => i !== qIdx))
                          }
                          className="text-red-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <Input
                    placeholder="Enter question prompt..."
                    value={q.question_text}
                    onChange={(e) => updateQuestion(qIdx, { question_text: e.target.value })}
                  />

                  {q.question_type === 'multiple_choice' ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium text-[#6B7280]">
                        Select the radio button next to the 1 correct answer:
                      </p>
                      {q.options.map((opt, optIdx) => (
                        <div key={opt.id} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            checked={opt.is_correct}
                            onChange={() => setCorrectOption(qIdx, optIdx)}
                            className="accent-[#7C5CFC]"
                          />
                          <Input
                            placeholder={`Option ${optIdx + 1}`}
                            value={opt.text}
                            onChange={(e) =>
                              updateQuestion(qIdx, {
                                options: q.options.map((o, oi) =>
                                  oi === optIdx ? { ...o, text: e.target.value } : o,
                                ),
                              })
                            }
                          />
                        </div>
                      ))}
                      {q.options.length < 6 && (
                        <Button size="sm" variant="ghost" onClick={() => addOption(qIdx)}>
                          <Plus className="h-3.5 w-3.5" /> Add Option
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Input
                      label="Expected Correct Answer (case-insensitive, trimmed)"
                      placeholder="e.g. inorder"
                      value={q.short_answer}
                      onChange={(e) => updateQuestion(qIdx, { short_answer: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>

            <Button variant="secondary" size="sm" onClick={addQuestion}>
              <Plus className="h-4 w-4" />
              Add Question
            </Button>
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-4 border-t border-[#E5E7EB]">
          <Link to="/activities">
            <Button variant="ghost">Cancel</Button>
          </Link>
          <Button type="submit" isLoading={submitting} size="lg">
            Publish Activity
          </Button>
        </div>
      </form>
    </div>
  );
}
