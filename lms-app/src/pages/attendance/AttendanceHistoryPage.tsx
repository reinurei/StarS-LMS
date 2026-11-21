import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Edit2 } from 'lucide-react';
import { Badge, Button, Modal, Table } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { computeAttendancePercentage, deriveModuleAttendanceStatus } from '../../lib/attendance';
import { lmsService } from '../../lib/dataService';
import { exportReportCsv, exportReportXlsx, type StudentReportRow } from '../../lib/reportExport';
import { toast } from '../../lib/toast';
import type { AttendanceRecord, AttendanceStatus, Course, Enrollment, Module } from '../../lib/types';

interface AttendanceRow {
  key: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  moduleId: string;
  moduleName: string;
  moduleOrder: number;
  status: AttendanceStatus;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  manuallyCorrected: boolean;
  correctedAt: string | null;
}

export default function AttendanceHistoryPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState(searchParams.get('courseId') ?? '');
  const [modules, setModules] = useState<Module[]>([]);
  const [roster, setRoster] = useState<Enrollment[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [sortBy, setSortBy] = useState<'module' | 'date'>('module');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Manual correction modal (Requirement 8.4)
  const [editTarget, setEditTarget] = useState<AttendanceRow | null>(null);
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('present');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    lmsService.listCourses(user.id, 'professor').then((list) => {
      const active = list.filter((c) => !c.is_archived);
      setCourses(active);
      if (!selectedCourseId && active[0]) setSelectedCourseId(active[0].id);
      if (active.length === 0) setLoading(false);
    });
  }, [user]);

  const loadCourseData = async () => {
    if (!selectedCourseId) return;
    setLoading(true);
    try {
      const [mods, enrs, atts] = await Promise.all([
        lmsService.listModules(selectedCourseId),
        lmsService.listCourseEnrollments(selectedCourseId),
        lmsService.listCourseAttendance(selectedCourseId),
      ]);
      setModules(mods);
      setRoster(enrs.filter((e) => e.status === 'active'));
      setRecords(atts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourseData();
  }, [selectedCourseId]);

  const rows = useMemo<AttendanceRow[]>(() => {
    const recMap = new Map<string, AttendanceRecord>();
    for (const r of records) recMap.set(`${r.module_id}:${r.student_id}`, r);

    const list: AttendanceRow[] = [];
    for (const mod of modules) {
      if (moduleFilter !== 'all' && mod.id !== moduleFilter) continue;
      for (const enr of roster) {
        const rec = recMap.get(`${mod.id}:${enr.student_id}`);
        list.push({
          key: `${mod.id}:${enr.student_id}`,
          studentId: enr.student_id,
          studentName: enr.student?.full_name ?? enr.student_id,
          studentEmail: enr.student?.email ?? '',
          moduleId: mod.id,
          moduleName: mod.name,
          moduleOrder: mod.display_order,
          status: deriveModuleAttendanceStatus(rec),
          firstViewedAt: rec?.first_viewed_at ?? null,
          lastViewedAt: rec?.last_viewed_at ?? null,
          manuallyCorrected: rec?.manually_corrected ?? false,
          correctedAt: rec?.corrected_at ?? null,
        });
      }
    }

    if (sortBy === 'date') {
      list.sort((a, b) => {
        const ta = a.firstViewedAt ? new Date(a.firstViewedAt).getTime() : 0;
        const tb = b.firstViewedAt ? new Date(b.firstViewedAt).getTime() : 0;
        return tb - ta;
      });
    } else {
      list.sort((a, b) =>
        a.moduleOrder !== b.moduleOrder
          ? a.moduleOrder - b.moduleOrder
          : a.studentName.localeCompare(b.studentName),
      );
    }
    return list;
  }, [modules, roster, records, sortBy, moduleFilter]);

  // Requirement 10.2: Per-module Present / Absent / Excused summary
  const moduleSummaries = useMemo(() => {
    const recMap = new Map<string, AttendanceRecord>();
    for (const r of records) recMap.set(`${r.module_id}:${r.student_id}`, r);

    return modules.map((mod) => {
      let present = 0;
      let absent = 0;
      let excused = 0;
      for (const enr of roster) {
        const st = deriveModuleAttendanceStatus(recMap.get(`${mod.id}:${enr.student_id}`));
        if (st === 'present') present += 1;
        else if (st === 'excused') excused += 1;
        else absent += 1;
      }
      return { module: mod, present, absent, excused };
    });
  }, [modules, roster, records]);

  const handleSaveCorrection = async () => {
    if (!user || !editTarget || !selectedCourseId) return;
    setSaving(true);
    try {
      await lmsService.correctAttendanceRecord({
        courseId: selectedCourseId,
        moduleId: editTarget.moduleId,
        studentId: editTarget.studentId,
        status: newStatus,
        professorId: user.id,
      });
      toast.success(`Updated ${editTarget.studentName}'s attendance to ${newStatus}.`);
      setEditTarget(null);
      await loadCourseData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = (format: 'csv' | 'xlsx') => {
    const course = courses.find((c) => c.id === selectedCourseId);
    const modCols = modules.map((m) => m.name);
    const reportRows: StudentReportRow[] = roster.map((enr) => {
      const studentRecs = records.filter((r) => r.student_id === enr.student_id);
      const pct = computeAttendancePercentage(studentRecs, modules.length);
      const map: Record<string, string> = {};
      for (const m of modules) {
        const rec = studentRecs.find((r) => r.module_id === m.id);
        map[m.name] = deriveModuleAttendanceStatus(rec);
      }
      return {
        studentName: enr.student?.full_name ?? enr.student_id,
        studentId: enr.student_id,
        email: enr.student?.email ?? '',
        activityGrades: map,
        attendancePercentage: pct,
      };
    });

    const baseName = `${course?.subject_code ?? 'course'}-attendance`;
    if (format === 'csv') exportReportCsv(baseName, reportRows, modCols);
    else exportReportXlsx(baseName, reportRows, modCols);
    toast.success(`Exported ${format.toUpperCase()} attendance report.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E1B4B]">Attendance Management</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Track module-view attendance across all students and apply manual adjustments when needed.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExport('xlsx')}>
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedCourseId}
          onChange={(e) => {
            setSelectedCourseId(e.target.value);
            setModuleFilter('all');
          }}
          className="rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-sm text-[#1E1B4B]"
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.subject_code} — {c.name}
            </option>
          ))}
        </select>

        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-sm text-[#1E1B4B]"
        >
          <option value="all">All Modules</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'module' | 'date')}
          className="rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-sm text-[#1E1B4B]"
        >
          <option value="module">Sort by Module Order</option>
          <option value="date">Sort by View Date (Newest)</option>
        </select>
      </div>

      {/* Per-Module Attendance Summary Cards (Requirement 10.2) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {moduleSummaries.map(({ module, present, absent, excused }) => (
          <div key={module.id} className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xs">
            <p className="text-xs font-semibold text-[#7C5CFC]">Module {module.display_order}</p>
            <h3 className="mt-0.5 text-sm font-semibold text-[#1E1B4B] truncate">{module.name}</h3>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="present">Present: {present}</Badge>
              <Badge variant="excused">Excused: {excused}</Badge>
              <Badge variant="absent">Absent: {absent}</Badge>
            </div>
          </div>
        ))}
      </div>

      {/* Full Attendance Table */}
      {loading ? (
        <div className="h-56 animate-pulse rounded-2xl bg-white border border-[#E5E7EB]" />
      ) : (
        <Table
          rowKey={(r) => r.key}
          data={rows}
          emptyMessage="No attendance records available for this selection."
          columns={[
            {
              key: 'module',
              header: 'Module',
              render: (r) => <span className="font-medium text-[#1E1B4B]">{r.moduleName}</span>,
            },
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
                <div className="flex items-center gap-1.5">
                  <Badge variant={r.status}>{r.status}</Badge>
                  {r.manuallyCorrected && (
                    <span className="text-[11px] text-[#6B7280]" title={`Corrected ${r.correctedAt ?? ''}`}>
                      (Edited)
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: 'viewed',
              header: 'First Viewed',
              render: (r) => (
                <span className="text-xs text-[#6B7280]">
                  {r.firstViewedAt ? new Date(r.firstViewedAt).toLocaleString() : '—'}
                </span>
              ),
            },
            {
              key: 'action',
              header: 'Correction',
              render: (r) => (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditTarget(r);
                    setNewStatus(r.status);
                  }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Correct
                </Button>
              ),
            },
          ]}
        />
      )}

      {/* Manual Correction Modal (Requirement 8.4) */}
      <Modal
        isOpen={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Manual Attendance Correction"
        subtitle={`${editTarget?.studentName ?? ''} — ${editTarget?.moduleName ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button isLoading={saving} onClick={handleSaveCorrection}>
              Save Correction
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-[#6B7280]">
            Select the corrected attendance status. Your user ID and correction timestamp will be recorded.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(['present', 'absent', 'excused'] as AttendanceStatus[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setNewStatus(st)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition cursor-pointer ${
                  newStatus === st
                    ? 'border-[#7C5CFC] bg-[#EDE9FE] text-[#7C5CFC]'
                    : 'border-[#E5E7EB] bg-white text-[#6B7280]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
