import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Download, FileText, Paperclip } from 'lucide-react';
import { QuizPlayer } from '../../components/activities/QuizPlayer';
import { SubmissionForm } from '../../components/activities/SubmissionForm';
import { Badge, Button, Input, Modal, Table, Textarea } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { classifySubmission } from '../../lib/classifySubmission';
import { lmsService } from '../../lib/dataService';
import { toast } from '../../lib/toast';
import type { Activity, Course, Enrollment, Material, Submission } from '../../lib/types';
import { validateGrade } from '../../lib/validators';

interface StudentSubmissionRow {
  studentId: string;
  studentName: string;
  studentEmail: string;
  status: string;
  submission: Submission | null;
}

export default function ActivityDetailPage() {
  const { activityId } = useParams<{ activityId: string }>();
  const { user, role } = useAuth();

  const [activity, setActivity] = useState<Activity | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [refMaterials, setRefMaterials] = useState<Material[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [roster, setRoster] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  // Grading modal (Professor)
  const [gradingTarget, setGradingTarget] = useState<StudentSubmissionRow | null>(null);
  const [gradeValue, setGradeValue] = useState('');
  const [feedbackValue, setFeedbackValue] = useState('');
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [savingGrade, setSavingGrade] = useState(false);

  const loadData = async () => {
    if (!activityId || !user) return;
    setLoading(true);
    try {
      const act = await lmsService.getActivityById(activityId);
      setActivity(act);
      if (act) {
        const [c, mats, subs, enrs] = await Promise.all([
          lmsService.getCourseById(act.course_id),
          lmsService.listMaterials(act.course_id),
          lmsService.listSubmissions({
            activityId: act.id,
            ...(role === 'student' ? { studentId: user.id } : {}),
          }),
          role === 'professor' ? lmsService.listCourseEnrollments(act.course_id) : Promise.resolve([]),
        ]);
        setCourse(c);
        setRefMaterials(mats.filter((m) => act.reference_material_ids?.includes(m.id)));
        setSubmissions(subs);
        setRoster(enrs.filter((e) => e.status === 'active'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activityId, user, role]);

  const handleStudentSubmit = async (files: File[], textAnswer: string) => {
    if (!user || !activity) return;
    const sub = await lmsService.submitActivity({
      activity,
      studentId: user.id,
      files,
      textAnswer,
    });
    toast.success(
      sub.status === 'late'
        ? 'Submission received after the deadline and marked as Late.'
        : 'Submission recorded successfully!',
    );
    await loadData();
  };

  const handleQuizComplete = async (params: {
    answers: Record<string, string>;
    startedAt: string;
    timedOut: boolean;
  }) => {
    if (!user || !activity) return;
    const sub = await lmsService.submitQuiz({
      activity,
      studentId: user.id,
      answers: params.answers,
      startedAt: params.startedAt,
      timedOut: params.timedOut,
    });
    toast.success(`Quiz submitted! Auto-graded score: ${sub.grade ?? 0}%`);
    await loadData();
  };

  const openGradeModal = (row: StudentSubmissionRow) => {
    setGradingTarget(row);
    setGradeValue(row.submission?.grade !== null && row.submission?.grade !== undefined ? String(row.submission.grade) : '');
    setFeedbackValue(row.submission?.feedback ?? '');
    setGradeError(null);
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !gradingTarget?.submission) return;
    setGradeError(null);
    const num = Number(gradeValue);
    const check = validateGrade(gradeValue.trim() === '' ? Number.NaN : num);
    if (!check.valid) {
      setGradeError(check.error ?? 'Grade must be between 0 and 100.');
      return;
    }

    setSavingGrade(true);
    try {
      await lmsService.gradeSubmission({
        professorId: user.id,
        submissionId: gradingTarget.submission.id,
        grade: num,
        feedback: feedbackValue.trim(),
      });
      toast.success(`Grade saved (${num}/100) and student notified.`);
      setGradingTarget(null);
      await loadData();
    } catch (err) {
      setGradeError((err as Error).message);
    } finally {
      setSavingGrade(false);
    }
  };

  const handleDownloadSubmissionFile = async (submissionId: string, filePath: string, filename: string) => {
    if (!user) return;
    try {
      const url = await lmsService.logSubmissionDownload(user.id, submissionId, filePath);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      toast.success(`Downloaded ${filename} (access logged).`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-white border border-[#E5E7EB]" />;
  }

  if (!activity) {
    return (
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center">
        <p className="text-base font-semibold text-[#1E1B4B]">Activity not found</p>
      </div>
    );
  }

  const now = new Date();
  const studentSubmission = role === 'student' ? submissions[0] ?? null : null;
  const studentStatus = classifySubmission({
    submittedAt: studentSubmission?.submitted_at,
    deadline: activity.deadline,
    now,
    isGraded: studentSubmission?.status === 'graded' || studentSubmission?.grade !== null,
  });

  // Professor rows grouped with status
  const profRows: StudentSubmissionRow[] = roster.map((enr) => {
    const sub = submissions.find((s) => s.student_id === enr.student_id) ?? null;
    const status = classifySubmission({
      submittedAt: sub?.submitted_at,
      deadline: activity.deadline,
      now,
      isGraded: sub?.status === 'graded' || sub?.grade !== null,
    });
    return {
      studentId: enr.student_id,
      studentName: enr.student?.full_name ?? enr.student_id,
      studentEmail: enr.student?.email ?? '—',
      status: status === 'upcoming' ? 'pending' : status,
      submission: sub,
    };
  });

  const isQuizActivity =
    (activity.activity_type === 'quiz' || activity.activity_type === 'multiple_choice') &&
    (activity.questions?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <Link
        to="/activities"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B7280] hover:text-[#7C5CFC]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Activities
      </Link>

      {/* Activity Details Card */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">{activity.activity_type.replace('_', ' ')}</Badge>
              {course && (
                <span className="text-xs font-medium text-[#6B7280]">
                  {course.subject_code} — {course.name}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-xl font-bold text-[#1E1B4B]">{activity.title}</h1>
          </div>

          <div className="flex items-center gap-2">
            {role === 'student' && (
              <Badge variant={studentStatus as 'upcoming' | 'submitted' | 'graded' | 'late' | 'missing'}>
                {studentStatus}
              </Badge>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5F3FF] px-3 py-1.5 text-xs font-medium text-[#1E1B4B]">
              <Clock className="h-3.5 w-3.5 text-[#7C5CFC]" />
              Due {new Date(activity.deadline).toLocaleString()}
            </span>
          </div>
        </div>

        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#374151]">
          {activity.instructions}
        </p>

        {refMaterials.length > 0 && (
          <div className="border-t border-[#E5E7EB] pt-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
              Reference Materials
            </h2>
            <div className="flex flex-wrap gap-2">
              {refMaterials.map((m) => (
                <Link
                  key={m.id}
                  to={`/courses/${activity.course_id}/modules/${m.module_id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#F5F3FF] px-3 py-1.5 text-xs font-medium text-[#7C5CFC] hover:bg-[#EDE9FE]"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {m.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* STUDENT VIEW */}
      {role === 'student' && user && (
        isQuizActivity ? (
          <QuizPlayer
            activity={activity}
            studentId={user.id}
            existingSubmission={studentSubmission}
            onComplete={handleQuizComplete}
          />
        ) : (
          <SubmissionForm
            activity={activity}
            existingSubmission={studentSubmission}
            onSubmit={handleStudentSubmit}
          />
        )
      )}

      {/* PROFESSOR VIEW: Grade summary & submissions table (Requirements 6.6 – 6.10) */}
      {role === 'professor' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
              <p className="text-xs text-[#6B7280]">Submitted (On Time)</p>
              <p className="mt-1 text-xl font-bold text-blue-600">
                {profRows.filter((r) => r.status === 'submitted' || r.status === 'graded').length}
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
              <p className="text-xs text-[#6B7280]">Graded</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">
                {profRows.filter((r) => r.status === 'graded').length}
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
              <p className="text-xs text-[#6B7280]">Late</p>
              <p className="mt-1 text-xl font-bold text-amber-600">
                {profRows.filter((r) => r.status === 'late').length}
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
              <p className="text-xs text-[#6B7280]">Missing / Pending</p>
              <p className="mt-1 text-xl font-bold text-red-600">
                {profRows.filter((r) => r.status === 'missing' || r.status === 'pending').length}
              </p>
            </div>
          </div>

          <Table
            rowKey={(r) => r.studentId}
            data={profRows}
            emptyMessage="No students enrolled in this course yet."
            columns={[
              {
                key: 'student',
                header: 'Student',
                render: (r) => (
                  <div>
                    <p className="font-medium text-[#1E1B4B]">{r.studentName}</p>
                    <p className="text-xs text-[#6B7280]">{r.studentEmail}</p>
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <Badge
                    variant={
                      r.status as 'submitted' | 'graded' | 'late' | 'pending' | 'missing'
                    }
                  >
                    {r.status}
                  </Badge>
                ),
              },
              {
                key: 'submission',
                header: 'Submission & Files',
                render: (r) =>
                  r.submission ? (
                    <div className="space-y-1 text-xs">
                      {r.submission.text_answer && (
                        <p className="max-w-xs truncate text-[#374151]">
                          {r.submission.text_answer}
                        </p>
                      )}
                      {r.submission.files.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() =>
                            handleDownloadSubmissionFile(
                              r.submission!.id,
                              f.file_path,
                              f.original_filename,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-md bg-[#EDE9FE] px-2 py-0.5 font-medium text-[#7C5CFC] hover:bg-[#DDD6FE] cursor-pointer"
                        >
                          <Download className="h-3 w-3" />
                          {f.original_filename}
                        </button>
                      ))}
                      {!r.submission.text_answer && r.submission.files.length === 0 && (
                        <span className="inline-flex items-center gap-1 text-[#6B7280]">
                          <Paperclip className="h-3 w-3" /> Quiz / Digital Submission
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-[#9CA3AF]">No submission</span>
                  ),
              },
              {
                key: 'grade',
                header: 'Grade',
                render: (r) =>
                  r.submission?.grade !== null && r.submission?.grade !== undefined ? (
                    <span className="font-semibold text-emerald-700">
                      {r.submission.grade} / {r.submission.max_score || 100}
                    </span>
                  ) : (
                    <span className="text-xs text-[#9CA3AF]">—</span>
                  ),
              },
              {
                key: 'action',
                header: 'Action',
                render: (r) =>
                  r.submission ? (
                    <Button size="sm" variant="secondary" onClick={() => openGradeModal(r)}>
                      {r.submission.grade !== null ? 'Edit Grade' : 'Grade'}
                    </Button>
                  ) : null,
              },
            ]}
          />
        </div>
      )}

      {/* Grade Entry Modal (Requirement 6.9) */}
      <Modal
        isOpen={Boolean(gradingTarget)}
        onClose={() => setGradingTarget(null)}
        title={`Grade Submission — ${gradingTarget?.studentName ?? ''}`}
        subtitle="Enter a numeric grade between 0 and 100 inclusive and optional feedback."
      >
        <form onSubmit={handleSaveGrade} className="space-y-4">
          {gradingTarget?.submission?.text_answer && (
            <div className="rounded-xl bg-[#F5F3FF] p-3.5 text-xs text-[#374151]">
              <p className="font-semibold text-[#1E1B4B] mb-1">Student Response:</p>
              <p className="whitespace-pre-wrap">{gradingTarget.submission.text_answer}</p>
            </div>
          )}

          <Input
            label="Numeric Grade (0 – 100)"
            type="number"
            step="0.01"
            min={0}
            max={100}
            value={gradeValue}
            onChange={(e) => setGradeValue(e.target.value)}
            error={gradeError ?? undefined}
          />

          <Textarea
            label="Feedback"
            rows={4}
            placeholder="Share constructive feedback for the student..."
            value={feedbackValue}
            onChange={(e) => setFeedbackValue(e.target.value)}
          />

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setGradingTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={savingGrade}>
              Release Grade
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
