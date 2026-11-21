import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Badge, Table } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { computeAttendancePercentage, deriveModuleAttendanceStatus } from '../../lib/attendance';
import { classifySubmission } from '../../lib/classifySubmission';
import { lmsService } from '../../lib/dataService';
import type { Activity, AttendanceRecord, Course, Module, Submission } from '../../lib/types';

interface CourseProgressBlock {
  course: Course;
  completedCount: number;
  pendingCount: number;
  missingCount: number;
  attendancePct: number;
  gradeRows: Array<{
    activityId: string;
    title: string;
    deadline: string;
    status: string;
    scoreDisplay: string;
    feedback: string | null;
  }>;
  attendanceRows: Array<{
    moduleId: string;
    moduleName: string;
    status: 'present' | 'absent' | 'excused';
    firstViewedAt: string | null;
  }>;
}

export default function StudentGradesPage() {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<CourseProgressBlock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function load() {
      setLoading(true);
      try {
        const [courses, subs, atts] = await Promise.all([
          lmsService.listCourses(user!.id, 'student'),
          lmsService.listSubmissions({ studentId: user!.id }),
          lmsService.listStudentAttendance(user!.id),
        ]);

        const now = new Date();
        const results: CourseProgressBlock[] = [];

        for (const course of courses) {
          const [acts, mods]: [Activity[], Module[]] = await Promise.all([
            lmsService.listActivities(course.id),
            lmsService.listModules(course.id),
          ]);

          let completedCount = 0;
          let pendingCount = 0;
          let missingCount = 0;

          const gradeRows = acts.map((act) => {
            const sub: Submission | undefined = subs.find((s) => s.activity_id === act.id);
            const status = classifySubmission({
              submittedAt: sub?.submitted_at,
              deadline: act.deadline,
              now,
              isGraded: sub?.status === 'graded' || sub?.grade !== null,
            });

            // Requirement 13.4: completed (submitted on/before due date), pending (not submitted & due not passed), missing (not submitted & due passed)
            if (status === 'submitted' || status === 'graded') completedCount += 1;
            else if (status === 'upcoming') pendingCount += 1;
            else if (status === 'missing') missingCount += 1;

            // Requirements 13.1 & 13.2
            let scoreDisplay = 'Not Submitted';
            if (sub) {
              if (sub.grade !== null && sub.grade !== undefined) {
                scoreDisplay = `${sub.grade} / ${act.max_score || 100}`;
              } else {
                scoreDisplay = 'Pending Grade';
              }
            }

            return {
              activityId: act.id,
              title: act.title,
              deadline: act.deadline,
              status,
              scoreDisplay,
              feedback: sub?.feedback ?? null,
            };
          });

          const courseAtts: AttendanceRecord[] = atts.filter((a) => a.course_id === course.id);
          const attRows = mods.map((m) => {
            const rec = courseAtts.find((a) => a.module_id === m.id);
            return {
              moduleId: m.id,
              moduleName: m.name,
              status: deriveModuleAttendanceStatus(rec),
              firstViewedAt: rec?.first_viewed_at ?? null,
            };
          });

          results.push({
            course,
            completedCount,
            pendingCount,
            missingCount,
            attendancePct: computeAttendancePercentage(courseAtts, mods.length),
            gradeRows,
            attendanceRows: attRows,
          });
        }

        setBlocks(results);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#1E1B4B]">My Progress, Grades & Attendance</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Monitor your scores, pending grades, activity completion, and module attendance per course.
        </p>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-white border border-[#E5E7EB]" />
      ) : blocks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D8D4F2] bg-white p-10 text-center">
          <Award className="mx-auto h-9 w-9 text-[#7C5CFC]" />
          <p className="mt-2 text-sm font-semibold text-[#1E1B4B]">No enrolled courses yet</p>
        </div>
      ) : (
        <div className="space-y-8">
          {blocks.map((block) => (
            <section
              key={block.course.id}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xs space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] pb-4">
                <div>
                  <Badge variant="primary">{block.course.subject_code}</Badge>
                  <h2 className="mt-1.5 text-lg font-semibold text-[#1E1B4B]">
                    {block.course.name}
                  </h2>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#6B7280]">Course Attendance</p>
                  <p className="text-xl font-bold text-[#7C5CFC]">{block.attendancePct}%</p>
                </div>
              </div>

              {/* Progress Summary (Requirement 13.4) */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3.5 text-emerald-800">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-xs font-medium">Completed On Time</p>
                    <p className="text-lg font-bold">{block.completedCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-[#EDE9FE] p-3.5 text-[#1E1B4B]">
                  <Clock className="h-5 w-5 text-[#7C5CFC]" />
                  <div>
                    <p className="text-xs font-medium">Pending (Upcoming)</p>
                    <p className="text-lg font-bold">{block.pendingCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-red-50 p-3.5 text-red-800">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-xs font-medium">Missing</p>
                    <p className="text-lg font-bold">{block.missingCount}</p>
                  </div>
                </div>
              </div>

              {/* Grades Table (Requirements 13.1 & 13.2) */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[#1E1B4B]">Activity Grades</h3>
                <Table
                  rowKey={(r) => r.activityId}
                  data={block.gradeRows}
                  emptyMessage="No activities posted for this course."
                  columns={[
                    {
                      key: 'title',
                      header: 'Activity',
                      render: (r) => (
                        <Link
                          to={`/activities/${r.activityId}`}
                          className="font-medium text-[#1E1B4B] hover:text-[#7C5CFC]"
                        >
                          {r.title}
                        </Link>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (r) => (
                        <Badge
                          variant={
                            r.status as 'upcoming' | 'submitted' | 'graded' | 'late' | 'missing'
                          }
                        >
                          {r.status}
                        </Badge>
                      ),
                    },
                    {
                      key: 'score',
                      header: 'Score / Max',
                      render: (r) => (
                        <span
                          className={`font-semibold ${
                            r.scoreDisplay === 'Pending Grade'
                              ? 'text-[#7C5CFC]'
                              : r.scoreDisplay === 'Not Submitted'
                                ? 'text-[#9CA3AF]'
                                : 'text-emerald-700'
                          }`}
                        >
                          {r.scoreDisplay}
                        </span>
                      ),
                    },
                    {
                      key: 'feedback',
                      header: 'Feedback',
                      render: (r) => (
                        <span className="text-xs text-[#6B7280]">{r.feedback ?? '—'}</span>
                      ),
                    },
                  ]}
                />
              </div>

              {/* Module Attendance Table (Requirement 13.3) */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[#1E1B4B]">Module Attendance</h3>
                <Table
                  rowKey={(r) => r.moduleId}
                  data={block.attendanceRows}
                  emptyMessage="No modules published yet."
                  columns={[
                    {
                      key: 'mod',
                      header: 'Module',
                      render: (r) => <span className="font-medium">{r.moduleName}</span>,
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (r) => <Badge variant={r.status}>{r.status}</Badge>,
                    },
                    {
                      key: 'date',
                      header: 'View Date',
                      render: (r) => (
                        <span className="text-xs text-[#6B7280]">
                          {r.firstViewedAt ? new Date(r.firstViewedAt).toLocaleString() : '—'}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
