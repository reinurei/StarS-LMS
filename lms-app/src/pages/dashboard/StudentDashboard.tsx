import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  MailCheck,
  Sparkles,
} from 'lucide-react';
import { StudentCourseCard } from '../../components/courses/CourseCard';
import { StarMascot } from '../../components/mascot/StarMascot';
import { Badge, Button } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { computeAttendancePercentage } from '../../lib/attendance';
import { classifySubmission } from '../../lib/classifySubmission';
import { lmsService } from '../../lib/dataService';
import { toast } from '../../lib/toast';
import type { Activity, Announcement, Course, Enrollment, Submission } from '../../lib/types';

interface CourseWithProgress {
  course: Course;
  attendancePct: number;
  viewedModules: number;
  totalModules: number;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseWithProgress[]>([]);
  const [invitations, setInvitations] = useState<Enrollment[]>([]);
  const [upcomingActivities, setUpcomingActivities] = useState<
    Array<{ activity: Activity; status: string }>
  >([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [myCourses, myInvites, myAtts, mySubs, allActs, allAnns] = await Promise.all([
        lmsService.listCourses(user.id, 'student'),
        lmsService.listStudentInvitations(user.id),
        lmsService.listStudentAttendance(user.id),
        lmsService.listSubmissions({ studentId: user.id }),
        lmsService.listActivities(),
        lmsService.listAnnouncements(),
      ]);

      const courseProgress: CourseWithProgress[] = [];
      for (const course of myCourses) {
        const mods = await lmsService.listModules(course.id);
        const courseAtts = myAtts.filter((a) => a.course_id === course.id);
        const pct = computeAttendancePercentage(courseAtts, mods.length);
        const viewed = courseAtts.filter((a) => a.status === 'present' || a.status === 'excused').length;
        courseProgress.push({
          course,
          attendancePct: pct,
          viewedModules: viewed,
          totalModules: mods.length,
        });
      }

      const enrolledIds = new Set(myCourses.map((c) => c.id));
      const subMap = new Map<string, Submission>();
      for (const s of mySubs) subMap.set(s.activity_id, s);

      const myActs = allActs
        .filter((a) => enrolledIds.has(a.course_id))
        .map((activity) => {
          const sub = subMap.get(activity.id);
          const status = classifySubmission({
            submittedAt: sub?.submitted_at,
            deadline: activity.deadline,
            isGraded: sub?.status === 'graded' || sub?.grade !== null,
          });
          return { activity, status };
        });

      setCourses(courseProgress);
      setInvitations(myInvites);
      setUpcomingActivities(myActs.slice(0, 6));
      setAnnouncements(allAnns.filter((a) => enrolledIds.has(a.course_id)).slice(0, 4));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleAcceptInvite = async (enrollmentId: string) => {
    if (!user) return;
    try {
      await lmsService.acceptInvitation(user.id, enrollmentId);
      toast.success('Invitation accepted! You are now enrolled in the course.');
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] p-6 sm:p-8 text-white shadow-md">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Student Learning Portal · 1st Semester 2026–2027
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight">
              Hi, {user?.full_name ?? 'Student'}
            </h1>
            <p className="mt-1.5 text-sm text-white/85">
              Open your course modules to study materials and automatically record your attendance, take quizzes, and track your grades.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/courses">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#7C5CFC] shadow-sm transition hover:bg-[#F5F3FF] cursor-pointer"
                >
                  <BookOpen className="h-4 w-4" />
                  My Courses
                </button>
              </Link>
              <Link to="/grades">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/20 cursor-pointer"
                >
                  Progress & Grades
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </div>

          <div className="hidden md:flex items-center">
            <StarMascot
              pose="wave"
              size={210}
              message="Ready to learn today?"
            />
          </div>
        </div>
      </section>

      {/* Pending Course Invitations Banner (Requirement 4.5, 4.6) */}
      {invitations.length > 0 && (
        <div className="rounded-2xl border border-[#7C5CFC]/30 bg-[#EDE9FE]/60 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1E1B4B]">
            <MailCheck className="h-4 w-4 text-[#7C5CFC]" />
            Pending Course Invitations ({invitations.length})
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-white p-3.5 border border-[#E5E7EB]"
              >
                <div>
                  <p className="text-sm font-semibold text-[#1E1B4B]">
                    {inv.course?.subject_code} — {inv.course?.name}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    Expires {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : 'in 7 days'}
                  </p>
                </div>
                <Button size="sm" onClick={() => handleAcceptInvite(inv.id)}>
                  Accept
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Enrolled Courses */}
        <div className="space-y-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#1E1B4B]">Ongoing Courses</h2>
            <Link to="/courses" className="text-xs font-semibold text-[#7C5CFC] hover:underline">
              VIEW ALL / ENROLL
            </Link>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-52 animate-pulse rounded-xl bg-white border border-[#E5E7EB]" />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D8D4F2] bg-white p-10 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-[#7C5CFC]" />
              <p className="mt-2 text-sm font-medium text-[#1E1B4B]">No enrolled courses yet</p>
              <p className="mt-1 text-xs text-[#6B7280]">
                Use an 8-character enrollment code from your professor to join a course.
              </p>
              <Link to="/courses" className="mt-4 inline-block">
                <Button size="sm">Enroll with Code</Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {courses.map(({ course, attendancePct, viewedModules, totalModules }, idx) => (
                <StudentCourseCard
                  key={course.id}
                  course={course}
                  attendancePct={attendancePct}
                  viewedModules={viewedModules}
                  totalModules={totalModules}
                  colorIndex={idx}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Rail: Deadlines & Announcements */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#1E1B4B]">Activities & Deadlines</h2>
              <Link to="/activities" className="text-xs font-semibold text-[#7C5CFC] hover:underline">
                View all
              </Link>
            </div>
            <div className="space-y-2.5">
              {upcomingActivities.length === 0 ? (
                <p className="text-xs text-[#6B7280]">No activities assigned yet.</p>
              ) : (
                upcomingActivities.map(({ activity, status }) => (
                  <Link
                    key={activity.id}
                    to={`/activities/${activity.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] p-3 transition hover:border-[#7C5CFC]/40 hover:bg-[#F5F3FF]/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[#1E1B4B]">{activity.title}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#6B7280]">
                        <Clock className="h-3 w-3" />
                        Due {new Date(activity.deadline).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={status as 'upcoming' | 'submitted' | 'graded' | 'late' | 'missing'}>
                      {status}
                    </Badge>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
            <h2 className="mb-3 text-sm font-semibold text-[#1E1B4B]">Course Announcements</h2>
            <div className="space-y-2.5">
              {announcements.length === 0 ? (
                <p className="text-xs text-[#6B7280]">No recent announcements.</p>
              ) : (
                announcements.map((ann) => (
                  <div key={ann.id} className="rounded-xl bg-[#F5F3FF] p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-[#1E1B4B]">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#7C5CFC]" />
                      {ann.title}
                    </p>
                    <p className="mt-1 text-xs text-[#6B7280] line-clamp-2">{ann.body}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
