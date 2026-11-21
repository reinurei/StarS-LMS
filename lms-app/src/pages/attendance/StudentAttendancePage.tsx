import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, ExternalLink } from 'lucide-react';
import { Badge, Table } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { computeAttendancePercentage, deriveModuleAttendanceStatus } from '../../lib/attendance';
import { lmsService } from '../../lib/dataService';
import type { AttendanceRecord, AttendanceStatus, Course, Module } from '../../lib/types';

interface ModuleAttendanceRow {
  moduleId: string;
  moduleName: string;
  displayOrder: number;
  status: AttendanceStatus;
  firstViewedAt: string | null;
  manuallyCorrected: boolean;
}

export default function StudentAttendancePage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState(searchParams.get('courseId') ?? '');
  const [rows, setRows] = useState<ModuleAttendanceRow[]>([]);
  const [percentage, setPercentage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    lmsService.listCourses(user.id, 'student').then((list) => {
      setCourses(list);
      if (!selectedCourseId && list[0]) {
        setSelectedCourseId(list[0].id);
      }
      if (list.length === 0) setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!user || !selectedCourseId) return;
    async function load() {
      setLoading(true);
      try {
        const [mods, atts] = await Promise.all([
          lmsService.listModules(selectedCourseId),
          lmsService.listStudentAttendance(user!.id),
        ]);
        const courseAtts = atts.filter((a) => a.course_id === selectedCourseId);
        const byMod = new Map<string, AttendanceRecord>();
        for (const a of courseAtts) byMod.set(a.module_id, a);

        const mapped: ModuleAttendanceRow[] = mods.map((m) => {
          const rec = byMod.get(m.id);
          return {
            moduleId: m.id,
            moduleName: m.name,
            displayOrder: m.display_order,
            status: deriveModuleAttendanceStatus(rec),
            firstViewedAt: rec?.first_viewed_at ?? null,
            manuallyCorrected: rec?.manually_corrected ?? false,
          };
        });

        setRows(mapped);
        setPercentage(computeAttendancePercentage(courseAtts, mods.length));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, selectedCourseId]);

  const presentCount = rows.filter((r) => r.status === 'present').length;
  const excusedCount = rows.filter((r) => r.status === 'excused').length;
  const absentCount = rows.filter((r) => r.status === 'absent').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E1B4B]">My Module Attendance</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Attendance is automatically marked as Present when you open a course module.
          </p>
        </div>

        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          aria-label="Select course"
          className="rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-sm text-[#1E1B4B] focus:border-[#7C5CFC] focus:outline-none"
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.subject_code} — {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xs">
          <p className="text-xs text-[#6B7280]">Attendance Rate</p>
          <p className="mt-1 text-2xl font-bold text-[#7C5CFC]">{percentage}%</p>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xs">
          <p className="text-xs text-[#6B7280]">Present</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{presentCount}</p>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xs">
          <p className="text-xs text-[#6B7280]">Excused</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{excusedCount}</p>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xs">
          <p className="text-xs text-[#6B7280]">Absent (Not Viewed)</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{absentCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="h-52 animate-pulse rounded-2xl bg-white border border-[#E5E7EB]" />
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D8D4F2] bg-white p-10 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-[#7C5CFC]" />
          <p className="mt-2 text-sm font-medium text-[#1E1B4B]">No enrolled courses yet</p>
        </div>
      ) : (
        <Table
          rowKey={(r) => r.moduleId}
          data={rows}
          emptyMessage="No modules published in this course yet."
          columns={[
            {
              key: 'module',
              header: 'Module',
              render: (r) => (
                <Link
                  to={`/courses/${selectedCourseId}/modules/${r.moduleId}`}
                  className="inline-flex items-center gap-1.5 font-medium text-[#1E1B4B] hover:text-[#7C5CFC]"
                >
                  {r.moduleName}
                  <ExternalLink className="h-3.5 w-3.5 text-[#7C5CFC]" />
                </Link>
              ),
            },
            {
              key: 'status',
              header: 'Attendance Status',
              render: (r) => (
                <div className="flex items-center gap-2">
                  <Badge variant={r.status}>{r.status}</Badge>
                  {r.manuallyCorrected && (
                    <span className="text-[11px] text-[#6B7280]">(Instructor adjusted)</span>
                  )}
                </div>
              ),
            },
            {
              key: 'viewed',
              header: 'First Viewed Timestamp',
              render: (r) => (
                <span className="text-xs text-[#6B7280]">
                  {r.firstViewedAt ? new Date(r.firstViewedAt).toLocaleString() : 'Not viewed yet'}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
