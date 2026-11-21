// Automated Attendance Logic (Module-View Tracking & Analytics)
// Requirements: 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 10.1, 12.1
// Properties: 4, 5, 9, 13, 14

import type { AttendanceRecord, AttendanceStatus, EnrollmentStatus } from './types';
import { validateAttendanceStatus } from './validators';

/**
 * Derives effective attendance status for a student on a module (Property 5):
 * - `'excused'` if manually set to `'excused'`
 * - `'absent'` if manually corrected to `'absent'` OR if no view record exists
 * - `'present'` if viewed (unless manually overridden)
 */
export function deriveModuleAttendanceStatus(
  record: Pick<AttendanceRecord, 'first_viewed_at' | 'status' | 'manually_corrected'> | null | undefined,
): AttendanceStatus {
  if (!record) return 'absent';

  if (record.manually_corrected) {
    if (record.status === 'excused') return 'excused';
    if (record.status === 'absent') return 'absent';
    return 'present';
  }

  if (record.status === 'excused') return 'excused';
  if (record.first_viewed_at) return 'present';
  return 'absent';
}

/**
 * Computes attendance percentage (Property 14):
 * `(present + excused) / totalModules * 100`, rounded to two decimal places.
 * Returns 0 if `totalModules <= 0`.
 */
export function computeAttendancePercentage(
  records: ReadonlyArray<Pick<AttendanceRecord, 'first_viewed_at' | 'status' | 'manually_corrected'>>,
  totalModules: number,
): number {
  if (totalModules <= 0) return 0;

  let attendedCount = 0;
  for (const record of records) {
    const effective = deriveModuleAttendanceStatus(record);
    if (effective === 'present' || effective === 'excused') {
      attendedCount += 1;
    }
  }

  const capped = Math.min(attendedCount, totalModules);
  return Math.round((capped / totalModules) * 10000) / 100;
}

/**
 * Pure state-transition upsert for module view attendance (Properties 4 & 13).
 * - Requires `enrollmentStatus === 'active'`
 * - Idempotent: at most one record per `(module_id, student_id)`
 * - Preserves `first_viewed_at` on subsequent views, updates `last_viewed_at`
 * - Preserves professor manual corrections (`manually_corrected = true`)
 */
export function applyModuleViewAttendance(params: {
  existingRecords: AttendanceRecord[];
  courseId: string;
  moduleId: string;
  studentId: string;
  enrollmentStatus: EnrollmentStatus | null | undefined;
  viewedAt?: string;
}): { ok: true; records: AttendanceRecord[]; record: AttendanceRecord } | { ok: false; error: string } {
  if (params.enrollmentStatus !== 'active') {
    return {
      ok: false,
      error: 'Access denied: you are not actively enrolled in this course.',
    };
  }

  const timestamp = params.viewedAt ?? new Date().toISOString();
  const idx = params.existingRecords.findIndex(
    (r) => r.module_id === params.moduleId && r.student_id === params.studentId,
  );

  if (idx >= 0) {
    const prev = params.existingRecords[idx];
    const updated: AttendanceRecord = {
      ...prev,
      first_viewed_at: prev.first_viewed_at ?? timestamp,
      last_viewed_at: timestamp,
      status: prev.manually_corrected ? prev.status : 'present',
    };
    const next = [...params.existingRecords];
    next[idx] = updated;
    return { ok: true, records: next, record: updated };
  }

  const created: AttendanceRecord = {
    id: `att-${params.moduleId}-${params.studentId}`,
    course_id: params.courseId,
    module_id: params.moduleId,
    student_id: params.studentId,
    first_viewed_at: timestamp,
    last_viewed_at: timestamp,
    status: 'present',
    manually_corrected: false,
    corrected_by: null,
    corrected_at: null,
  };

  return { ok: true, records: [...params.existingRecords, created], record: created };
}

/**
 * Pure manual correction helper (Property 9).
 */
export function applyManualAttendanceCorrection(params: {
  record: AttendanceRecord | null;
  courseId: string;
  moduleId: string;
  studentId: string;
  newStatus: unknown;
  professorId: string;
  correctedAt?: string;
}): { ok: true; record: AttendanceRecord } | { ok: false; error: string } {
  if (!validateAttendanceStatus(params.newStatus)) {
    return {
      ok: false,
      error: "Invalid attendance status. Must be 'present', 'absent', or 'excused'.",
    };
  }

  const timestamp = params.correctedAt ?? new Date().toISOString();
  const base: AttendanceRecord = params.record ?? {
    id: `att-${params.moduleId}-${params.studentId}`,
    course_id: params.courseId,
    module_id: params.moduleId,
    student_id: params.studentId,
    first_viewed_at: null,
    last_viewed_at: null,
    status: params.newStatus,
    manually_corrected: true,
    corrected_by: params.professorId,
    corrected_at: timestamp,
  };

  return {
    ok: true,
    record: {
      ...base,
      status: params.newStatus,
      manually_corrected: true,
      corrected_by: params.professorId,
      corrected_at: timestamp,
    },
  };
}
