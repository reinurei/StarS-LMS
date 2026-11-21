import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart2 } from 'lucide-react';
import { Table } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { lmsService } from '../../lib/dataService';
import type { Activity, Course, Enrollment, Submission } from '../../lib/types';

export default function GradeBookPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [roster, setRoster] = useState<Enrollment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    lmsService.listCourses(user.id, 'professor').then((list) => {
      const active = list.filter((c) => !c.is_archived);
      setCourses(active);
      if (active[0]) setSelectedCourseId(active[0].id);
      else setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!selectedCourseId) return;
    async function load() {
      setLoading(true);
      try {
        const [enrs, acts, subs] = await Promise.all([
          lmsService.listCourseEnrollments(selectedCourseId),
          lmsService.listActivities(selectedCourseId),
          lmsService.listSubmissions(),
        ]);
        setRoster(enrs.filter((e) => e.status === 'active'));
        setActivities(acts);
        setSubmissions(subs);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedCourseId]);

  const columns = [
    {
      key: 'student',
      header: 'Student',
      render: (enr: Enrollment) => (
        <div>
          <p className="font-medium text-[#1E1B4B]">{enr.student?.full_name ?? enr.student_id}</p>
          <p className="text-xs text-[#6B7280]">{enr.student?.email}</p>
        </div>
      ),
    },
    ...activities.map((act) => ({
      key: act.id,
      header: `${act.title.slice(0, 22)}${act.title.length > 22 ? '…' : ''} (/${act.max_score || 100})`,
      render: (enr: Enrollment) => {
        const sub = submissions.find(
          (s) => s.activity_id === act.id && s.student_id === enr.student_id,
        );
        if (!sub) return <span className="text-xs text-red-500">Missing</span>;
        if (sub.grade === null)
          return (
            <Link to={`/activities/${act.id}`} className="text-xs font-medium text-[#7C5CFC] hover:underline">
              Pending Grade
            </Link>
          );
        return (
          <span className="font-semibold text-[#1E1B4B]">
            {sub.grade} / {act.max_score || 100}
          </span>
        );
      },
    })),
    {
      key: 'average',
      header: 'Average',
      render: (enr: Enrollment) => {
        const graded = activities
          .map((a) => submissions.find((s) => s.activity_id === a.id && s.student_id === enr.student_id))
          .filter((s): s is Submission => Boolean(s && s.grade !== null));
        if (graded.length === 0) return <span className="text-xs text-[#9CA3AF]">—</span>;
        const avg = graded.reduce((acc, s) => acc + (s.grade ?? 0), 0) / graded.length;
        return <span className="font-bold text-[#7C5CFC]">{avg.toFixed(1)}%</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E1B4B]">Course Gradebook</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Numerical grades for every activity alongside each activity’s maximum possible score.
          </p>
        </div>

        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          className="rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-sm text-[#1E1B4B]"
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.subject_code} — {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="h-56 animate-pulse rounded-2xl bg-white border border-[#E5E7EB]" />
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D8D4F2] bg-white p-10 text-center">
          <BarChart2 className="mx-auto h-8 w-8 text-[#7C5CFC]" />
          <p className="mt-2 text-sm font-medium text-[#1E1B4B]">No courses yet</p>
        </div>
      ) : (
        <Table
          rowKey={(e) => e.id}
          data={roster}
          columns={columns}
          emptyMessage="No students enrolled in this course yet."
        />
      )}
    </div>
  );
}
