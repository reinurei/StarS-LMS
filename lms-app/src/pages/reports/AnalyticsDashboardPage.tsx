import { useEffect, useMemo, useState } from 'react';
import { BarChart3, ClipboardCheck, Download, FileSpreadsheet, Users } from 'lucide-react';
import { Badge, Button, Input, Table } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { computeAttendancePercentage, deriveModuleAttendanceStatus } from '../../lib/attendance';
import { classifySubmission } from '../../lib/classifySubmission';
import { lmsService } from '../../lib/dataService';
import { exportReportCsv, exportReportXlsx, type StudentReportRow } from '../../lib/reportExport';
import { toast } from '../../lib/toast';
import type { Activity, AttendanceRecord, Course, Enrollment, Module, Submission } from '../../lib/types';

export default function AnalyticsDashboardPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseFilter, setCourseFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [studentFilter, setStudentFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [roster, setRoster] = useState<Enrollment[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    lmsService.listCourses(user.id, 'professor').then((list) => {
      setCourses(list);
      const active = list.find((c) => !c.is_archived) ?? list[0];
      if (active) setCourseFilter(active.id);
      else setLoading(false);
    });
  }, [user]);

  const filteredCourses = useMemo(
    () =>
      courses.filter(
        (c) => semesterFilter === 'all' || `${c.semester} ${c.academic_year}` === semesterFilter,
      ),
    [courses, semesterFilter],
  );

  useEffect(() => {
    if (!courseFilter) return;
    async function load() {
      setLoading(true);
      try {
        const [enrs, mods, atts, acts, subs] = await Promise.all([
          lmsService.listCourseEnrollments(courseFilter),
          lmsService.listModules(courseFilter),
          lmsService.listCourseAttendance(courseFilter),
          lmsService.listActivities(courseFilter),
          lmsService.listSubmissions(),
        ]);
        setRoster(enrs.filter((e) => e.status === 'active'));
        setModules(mods);
        setAttendance(atts);
        setActivities(acts);
        setSubmissions(subs);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [courseFilter]);

  const semesters = useMemo(
    () => Array.from(new Set(courses.map((c) => `${c.semester} ${c.academic_year}`))),
    [courses],
  );

  // Apply student + date range filters (Requirement 12.3 & 12.6)
  const visibleRoster = useMemo(
    () => roster.filter((e) => studentFilter === 'all' || e.student_id === studentFilter),
    [roster, studentFilter],
  );

  const visibleAttendance = useMemo(() => {
    const startMs = startDate ? new Date(startDate).getTime() : null;
    const endMs = endDate ? new Date(`${endDate}T23:59:59`).getTime() : null;
    return attendance.filter((a) => {
      if (studentFilter !== 'all' && a.student_id !== studentFilter) return false;
      if (startMs || endMs) {
        const ts = a.first_viewed_at ? new Date(a.first_viewed_at).getTime() : 0;
        if (startMs && ts < startMs) return false;
        if (endMs && ts > endMs) return false;
      }
      return true;
    });
  }, [attendance, studentFilter, startDate, endDate]);

  const studentMetrics = useMemo(() => {
    return visibleRoster.map((enr) => {
      const stuAtt = visibleAttendance.filter((a) => a.student_id === enr.student_id);
      const attendancePct = computeAttendancePercentage(stuAtt, modules.length);
      const gradesByAct: Record<string, string | number> = {};
      for (const act of activities) {
        const sub = submissions.find(
          (s) => s.activity_id === act.id && s.student_id === enr.student_id,
        );
        if (!sub) gradesByAct[act.title] = 'Missing';
        else if (sub.grade === null) gradesByAct[act.title] = 'Pending';
        else gradesByAct[act.title] = `${sub.grade}/${act.max_score || 100}`;
      }
      return {
        studentId: enr.student_id,
        studentName: enr.student?.full_name ?? enr.student_id,
        email: enr.student?.email ?? '',
        attendancePct,
        gradesByAct,
      };
    });
  }, [visibleRoster, visibleAttendance, modules.length, activities, submissions]);

  const overallClassAttendance = useMemo(() => {
    if (studentMetrics.length === 0) return 0;
    const sum = studentMetrics.reduce((acc, s) => acc + s.attendancePct, 0);
    return Math.round((sum / studentMetrics.length) * 100) / 100;
  }, [studentMetrics]);

  // Requirement 12.1: Per-activity submission statistics (total submissions, % on-time)
  const activityStats = useMemo(() => {
    const allowedIds = new Set(visibleRoster.map((e) => e.student_id));
    return activities.map((act) => {
      const actSubs = submissions.filter(
        (s) => s.activity_id === act.id && allowedIds.has(s.student_id),
      );
      const onTime = actSubs.filter((s) => {
        const status = classifySubmission({
          submittedAt: s.submitted_at,
          deadline: act.deadline,
          isGraded: s.status === 'graded' || s.grade !== null,
        });
        return status === 'submitted' || status === 'graded';
      }).length;
      const pctOnTime =
        actSubs.length === 0 ? 0 : Math.round((onTime / actSubs.length) * 10000) / 100;
      return {
        id: act.id,
        title: act.title,
        totalSubmissions: actSubs.length,
        expectedCount: visibleRoster.length,
        onTimePct: pctOnTime,
      };
    });
  }, [activities, submissions, visibleRoster]);

  // Requirement 12.5: Per-module Present / Absent / Excused counts
  const moduleSummary = useMemo(() => {
    return modules.map((mod) => {
      let present = 0;
      let absent = 0;
      let excused = 0;
      for (const enr of visibleRoster) {
        const rec = visibleAttendance.find(
          (a) => a.module_id === mod.id && a.student_id === enr.student_id,
        );
        const st = deriveModuleAttendanceStatus(rec);
        if (st === 'present') present += 1;
        else if (st === 'excused') excused += 1;
        else absent += 1;
      }
      return { id: mod.id, name: mod.name, present, absent, excused };
    });
  }, [modules, visibleRoster, visibleAttendance]);

  const handleExport = (format: 'csv' | 'xlsx') => {
    const course = courses.find((c) => c.id === courseFilter);
    const cols = activities.map((a) => a.title);
    const rows: StudentReportRow[] = studentMetrics.map((m) => ({
      studentName: m.studentName,
      studentId: m.studentId,
      email: m.email,
      activityGrades: m.gradesByAct,
      attendancePercentage: m.attendancePct,
    }));
    const filename = `${course?.subject_code ?? 'course'}-analytics-report`;
    if (format === 'csv') exportReportCsv(filename, rows, cols);
    else exportReportXlsx(filename, rows, cols);
    toast.success(`Downloaded ${format.toUpperCase()} course report.`);
  };

  const noDataMatches =
    !loading &&
    (studentMetrics.length === 0 ||
      ((startDate || endDate) && visibleAttendance.length === 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E1B4B]">Analytics Dashboard & Reports</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Monitor class attendance rates, module participation, submission timeliness, and export CSV/Excel reports.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button size="sm" onClick={() => handleExport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel (.xlsx)
          </Button>
        </div>
      </div>

      {/* Filters (Requirement 12.3 & 12.6) */}
      <div className="grid gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xs sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#6B7280]">Semester</label>
          <select
            value={semesterFilter}
            onChange={(e) => setSemesterFilter(e.target.value)}
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs text-[#1E1B4B]"
          >
            <option value="all">All Semesters</option>
            {semesters.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[#6B7280]">Course</label>
          <select
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setStudentFilter('all');
            }}
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs text-[#1E1B4B]"
          >
            {filteredCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.subject_code} — {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[#6B7280]">Student</label>
          <select
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs text-[#1E1B4B]"
          >
            <option value="all">All Students</option>
            {roster.map((e) => (
              <option key={e.student_id} value={e.student_id}>
                {e.student?.full_name ?? e.student_id}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="From Date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Input
          label="To Date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      {/* Requirement 12.6: No data matches filters (preserving filter selections) */}
      {noDataMatches && (
        <div
          role="status"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          No data matches the selected filters. Adjust your date range, student, or course selection above.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6B7280]">Total Enrolled Students</span>
            <Users className="h-4 w-4 text-[#7C5CFC]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#1E1B4B]">{visibleRoster.length}</p>
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6B7280]">Overall Class Attendance Rate</span>
            <ClipboardCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#1E1B4B]">{overallClassAttendance}%</p>
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6B7280]">Published Modules / Activities</span>
            <BarChart3 className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#1E1B4B]">
            {modules.length} / {activities.length}
          </p>
        </div>
      </div>

      {/* Per-Module Attendance Summary (Requirement 12.5) */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-[#1E1B4B]">Attendance Summary by Module</h2>
        <Table
          rowKey={(m) => m.id}
          data={moduleSummary}
          emptyMessage="No modules in this course."
          columns={[
            { key: 'name', header: 'Module', render: (m) => <span className="font-medium">{m.name}</span> },
            { key: 'present', header: 'Present', render: (m) => <Badge variant="present">{m.present}</Badge> },
            { key: 'excused', header: 'Excused', render: (m) => <Badge variant="excused">{m.excused}</Badge> },
            { key: 'absent', header: 'Absent', render: (m) => <Badge variant="absent">{m.absent}</Badge> },
          ]}
        />
      </div>

      {/* Per-Activity Submission Statistics (Requirement 12.1) */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-[#1E1B4B]">Activity Submission Statistics</h2>
        <Table
          rowKey={(a) => a.id}
          data={activityStats}
          emptyMessage="No activities in this course."
          columns={[
            { key: 'title', header: 'Activity', render: (a) => <span className="font-medium">{a.title}</span> },
            {
              key: 'total',
              header: 'Submissions Received',
              render: (a) => (
                <span>
                  {a.totalSubmissions} / {a.expectedCount}
                </span>
              ),
            },
            {
              key: 'ontime',
              header: '% On-Time Submissions',
              render: (a) => <Badge variant="primary">{a.onTimePct}%</Badge>,
            },
          ]}
        />
      </div>

      {/* Student Performance & Attendance Table (Requirements 12.1 & 12.2) */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-[#1E1B4B]">
          Per-Student Attendance & Grade Summary
        </h2>
        <Table
          rowKey={(s) => s.studentId}
          data={studentMetrics}
          emptyMessage="No student records match the current filters."
          columns={[
            {
              key: 'student',
              header: 'Student',
              render: (s) => (
                <div>
                  <p className="font-medium text-[#1E1B4B]">{s.studentName}</p>
                  <p className="text-xs text-[#6B7280]">{s.email}</p>
                </div>
              ),
            },
            {
              key: 'att',
              header: 'Attendance %',
              render: (s) => <Badge variant="present">{s.attendancePct.toFixed(2)}%</Badge>,
            },
            ...activities.map((act) => ({
              key: act.id,
              header: act.title.slice(0, 20),
              render: (s: (typeof studentMetrics)[number]) => (
                <span className="text-xs font-medium">{s.gradesByAct[act.title]}</span>
              ),
            })),
          ]}
        />
      </div>
    </div>
  );
}
