import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, FileText, Plus } from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { classifySubmission } from '../../lib/classifySubmission';
import { lmsService } from '../../lib/dataService';
import type { Activity, Course, Enrollment, Submission } from '../../lib/types';

export default function ActivityListPage() {
  const { user, role } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [enrollmentsByCourse, setEnrollmentsByCourse] = useState<Record<string, Enrollment[]>>({});
  const [selectedCourseId, setSelectedCourseId] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !role) return;
    async function load() {
      setLoading(true);
      try {
        const myCourses = await lmsService.listCourses(user!.id, role!);
        const courseIds = new Set(myCourses.map((c) => c.id));
        const allActs = await lmsService.listActivities();
        const myActs = allActs.filter((a) => courseIds.has(a.course_id));
        const subs =
          role === 'student'
            ? await lmsService.listSubmissions({ studentId: user!.id })
            : await lmsService.listSubmissions();

        const enrMap: Record<string, Enrollment[]> = {};
        if (role === 'professor') {
          for (const c of myCourses) {
            enrMap[c.id] = (await lmsService.listCourseEnrollments(c.id)).filter(
              (e) => e.status === 'active',
            );
          }
        }

        setCourses(myCourses);
        setActivities(myActs);
        setSubmissions(subs);
        setEnrollmentsByCourse(enrMap);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, role]);

  const courseNameMap = useMemo(
    () => new Map(courses.map((c) => [c.id, `${c.subject_code} — ${c.name}`])),
    [courses],
  );

  const enriched = useMemo(() => {
    const now = new Date();
    return activities
      .filter((a) => selectedCourseId === 'all' || a.course_id === selectedCourseId)
      .map((activity) => {
        if (role === 'student') {
          const sub = submissions.find((s) => s.activity_id === activity.id);
          const status = classifySubmission({
            submittedAt: sub?.submitted_at,
            deadline: activity.deadline,
            now,
            isGraded: sub?.status === 'graded' || sub?.grade !== null,
          });
          return { activity, studentStatus: status, submission: sub, summary: null };
        }

        // Professor summary counts (Requirement 6.6 & 6.10)
        const roster = enrollmentsByCourse[activity.course_id] ?? [];
        const actSubs = submissions.filter((s) => s.activity_id === activity.id);
        let submitted = 0;
        let graded = 0;
        let late = 0;
        let pending = 0;
        let missing = 0;

        for (const enr of roster) {
          const sub = actSubs.find((s) => s.student_id === enr.student_id);
          const status = classifySubmission({
            submittedAt: sub?.submitted_at,
            deadline: activity.deadline,
            now,
            isGraded: sub?.status === 'graded' || sub?.grade !== null,
          });
          if (status === 'graded') {
            graded += 1;
            submitted += 1;
          } else if (status === 'submitted') {
            submitted += 1;
          } else if (status === 'late') {
            late += 1;
          } else if (status === 'missing') {
            missing += 1;
          } else {
            pending += 1;
          }
        }

        return {
          activity,
          studentStatus: null,
          submission: null,
          summary: { submitted, graded, late, pending, missing },
        };
      })
      .filter((item) => {
        if (role === 'student' && statusFilter !== 'all') {
          return item.studentStatus === statusFilter;
        }
        return true;
      });
  }, [activities, selectedCourseId, statusFilter, submissions, enrollmentsByCourse, role]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E1B4B]">Activities & Assessments</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            {role === 'professor'
              ? 'Manage assignments, quizzes, and submissions with grading summaries.'
              : 'View upcoming assignments, take timed quizzes, and track submission status.'}
          </p>
        </div>

        {role === 'professor' && (
          <Link to="/activities/new">
            <Button>
              <Plus className="h-4 w-4" />
              Create Activity
            </Button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          aria-label="Filter by course"
          className="rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-sm text-[#1E1B4B] focus:border-[#7C5CFC] focus:outline-none"
        >
          <option value="all">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.subject_code} — {c.name}
            </option>
          ))}
        </select>

        {role === 'student' && (
          <div className="flex flex-wrap gap-1.5">
            {['all', 'upcoming', 'submitted', 'graded', 'late', 'missing'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[#7C5CFC] text-white'
                    : 'bg-white text-[#6B7280] border border-[#E5E7EB] hover:bg-[#EDE9FE]/50'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white border border-[#E5E7EB]" />
          ))}
        </div>
      ) : enriched.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D8D4F2] bg-white p-12 text-center">
          <FileText className="mx-auto h-9 w-9 text-[#7C5CFC]" />
          <p className="mt-2 text-sm font-semibold text-[#1E1B4B]">No matching activities</p>
        </div>
      ) : (
        <div className="space-y-3">
          {enriched.map(({ activity, studentStatus, submission, summary }) => (
            <Link
              key={activity.id}
              to={`/activities/${activity.id}`}
              className="block rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs transition hover:border-[#7C5CFC]/40 hover:shadow-md"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="primary">{activity.activity_type.replace('_', ' ')}</Badge>
                    <span className="text-xs font-medium text-[#6B7280]">
                      {courseNameMap.get(activity.course_id)}
                    </span>
                    {activity.time_limit_minutes && (
                      <Badge variant="neutral">{activity.time_limit_minutes}m timed</Badge>
                    )}
                  </div>
                  <h2 className="text-base font-semibold text-[#1E1B4B]">{activity.title}</h2>
                  <p className="text-xs text-[#6B7280] line-clamp-2">{activity.instructions}</p>
                </div>

                <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                  {studentStatus && (
                    <Badge
                      variant={
                        studentStatus as 'upcoming' | 'submitted' | 'graded' | 'late' | 'missing'
                      }
                    >
                      {studentStatus}
                    </Badge>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-[#6B7280]">
                    <Clock className="h-3.5 w-3.5" />
                    Due {new Date(activity.deadline).toLocaleString()}
                  </span>
                  {role === 'student' && submission?.grade !== null && submission?.grade !== undefined && (
                    <span className="text-xs font-bold text-emerald-600">
                      Score: {submission.grade} / {submission.max_score || 100}
                    </span>
                  )}
                </div>
              </div>

              {role === 'professor' && summary && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E5E7EB] pt-3">
                  <Badge variant="submitted">Submitted: {summary.submitted}</Badge>
                  <Badge variant="graded">Graded: {summary.graded}</Badge>
                  <Badge variant="late">Late: {summary.late}</Badge>
                  <Badge variant="pending">Pending: {summary.pending}</Badge>
                  <Badge variant="missing">Missing: {summary.missing}</Badge>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
