import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applyManualAttendanceCorrection,
  applyModuleViewAttendance,
  computeAttendancePercentage,
  deriveModuleAttendanceStatus,
} from '../lib/attendance';
import { canResubmit, classifySubmission } from '../lib/classifySubmission';
import { generateUniqueEnrollmentCode, isValidEnrollmentCodeFormat } from '../lib/enrollmentCode';
import { buildCourseNotifications, markNotificationReadState } from '../lib/notifications';
import { normalizeQuizAnswer, scoreQuizSubmission } from '../lib/scoreQuizSubmission';
import type { AttendanceRecord, AttendanceStatus, EnrollmentStatus, Notification } from '../lib/types';
import {
  ALLOWED_MATERIAL_MIME_TYPES,
  ALLOWED_SUBMISSION_MIME_TYPES,
  MAX_MATERIAL_SIZE_BYTES,
  MAX_SUBMISSION_FILES,
  MAX_SUBMISSION_TOTAL_BYTES,
  validateAttendanceStatus,
  validateExternalUrl,
  validateGrade,
  validateMaterialUpload,
  validateSubmissionFiles,
} from '../lib/validators';

describe('LMS Platform — 14 Correctness Properties (fast-check, >=100 runs each)', () => {
  // Property 1: Enrollment code uniqueness (Requirement 3.1)
  it('Property 1: Enrollment code uniqueness across batches', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 25 }), async (batchSize) => {
        const existing = new Set<string>();
        const generated: string[] = [];
        for (let i = 0; i < batchSize; i++) {
          const code = await generateUniqueEnrollmentCode((c) => existing.has(c));
          expect(isValidEnrollmentCodeFormat(code)).toBe(true);
          expect(existing.has(code)).toBe(false);
          existing.add(code);
          generated.push(code);
        }
        expect(new Set(generated).size).toBe(batchSize);
      }),
      { numRuns: 100 },
    );
  });

  // Property 2: Submission status classification (Requirements 6.6, 7.1, 7.3, 7.8)
  it('Property 2: Submission status classification', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_700_000_000_000, max: 1_900_000_000_000 }),
        fc.integer({ min: -500_000_000, max: 500_000_000 }),
        fc.boolean(),
        fc.boolean(),
        (deadlineMs, offsetMs, hasSubmission, isGraded) => {
          const deadline = new Date(deadlineMs);
          if (hasSubmission) {
            const submittedAt = new Date(deadlineMs + offsetMs);
            const result = classifySubmission({ submittedAt, deadline, isGraded });
            if (submittedAt.getTime() > deadline.getTime()) {
              expect(result).toBe('late');
            } else {
              expect(result).toBe(isGraded ? 'graded' : 'submitted');
            }
          } else {
            const now = new Date(deadlineMs + offsetMs);
            const result = classifySubmission({ submittedAt: null, deadline, now, isGraded: false });
            expect(result).toBe(now.getTime() > deadline.getTime() ? 'missing' : 'upcoming');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 3: Resubmission count invariant (Requirement 7.6)
  it('Property 3: Resubmission count invariant', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 1, max: 20 }),
        (maxResubmissions, attempts) => {
          const futureDeadline = new Date(Date.now() + 60_000);
          let hasExisting = false;
          let resubmissionCount = 0;
          let acceptedTotal = 0;

          for (let i = 0; i < attempts; i++) {
            const check = canResubmit({
              hasExistingSubmission: hasExisting,
              allowResubmission: true,
              resubmissionCount,
              maxResubmissions,
              deadline: futureDeadline,
            });
            if (check.allowed) {
              acceptedTotal += 1;
              if (hasExisting) {
                resubmissionCount += 1;
              } else {
                hasExisting = true;
              }
            } else {
              expect(resubmissionCount).toBeGreaterThanOrEqual(maxResubmissions);
            }
          }

          expect(acceptedTotal).toBeLessThanOrEqual(maxResubmissions + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 4: Module view attendance recording idempotence (Requirements 8.1, 8.2, 9.1)
  it('Property 4: Module view attendance recording idempotence', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1_700_000_000_000, max: 1_800_000_000_000 }), {
          minLength: 1,
          maxLength: 15,
        }),
        (rawTimestamps) => {
          const timestamps = [...rawTimestamps].sort((a, b) => a - b).map((ms) => new Date(ms).toISOString());
          let records: AttendanceRecord[] = [];
          for (const ts of timestamps) {
            const res = applyModuleViewAttendance({
              existingRecords: records,
              courseId: 'course-1',
              moduleId: 'mod-1',
              studentId: 'stud-1',
              enrollmentStatus: 'active',
              viewedAt: ts,
            });
            expect(res.ok).toBe(true);
            if (res.ok) records = res.records;
          }

          expect(records).toHaveLength(1);
          expect(records[0].status).toBe('present');
          expect(records[0].first_viewed_at).toBe(timestamps[0]);
          expect(records[0].last_viewed_at).toBe(timestamps[timestamps.length - 1]);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 5: Attendance status derivation from module views (Requirements 8.1, 8.3, 8.4)
  it('Property 5: Attendance status derivation from module views', () => {
    const statusArb = fc.constantFrom<AttendanceStatus>('present', 'absent', 'excused');
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        statusArb,
        (hasView, manuallyCorrected, storedStatus) => {
          if (!hasView && !manuallyCorrected) {
            expect(deriveModuleAttendanceStatus(null)).toBe('absent');
            return;
          }
          const rec = {
            first_viewed_at: hasView ? new Date().toISOString() : null,
            status: storedStatus,
            manually_corrected: manuallyCorrected,
          };
          const derived = deriveModuleAttendanceStatus(rec);
          if (manuallyCorrected) {
            expect(derived).toBe(storedStatus);
          } else if (storedStatus === 'excused') {
            expect(derived).toBe('excused');
          } else if (hasView) {
            expect(derived).toBe('present');
          } else {
            expect(derived).toBe('absent');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 6: Notification delivery completeness (Requirements 11.1, 11.2, 11.4, 11.7)
  it('Property 6: Notification delivery completeness', () => {
    const enrollStatusArb = fc.constantFrom<EnrollmentStatus>('active', 'pending', 'expired');
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            student_id: fc.string({ minLength: 1, maxLength: 10 }),
            course_id: fc.constantFrom('c1', 'c2'),
            status: enrollStatusArb,
          }),
          { maxLength: 30 },
        ),
        (enrollments) => {
          const notifs = buildCourseNotifications({
            enrollments,
            courseId: 'c1',
            type: 'material_uploaded',
            title: 'New Material',
            body: 'Uploaded',
          });

          const expectedStudents = new Set(
            enrollments
              .filter((e) => e.course_id === 'c1' && e.status === 'active')
              .map((e) => e.student_id),
          );

          expect(notifs).toHaveLength(expectedStudents.size);
          const recipientSet = new Set(notifs.map((n) => n.recipient_id));
          expect(recipientSet.size).toBe(expectedStudents.size);
          for (const sid of expectedStudents) {
            expect(recipientSet.has(sid)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 7: Quiz auto-grade correctness (Requirement 17.3)
  it('Property 7: Quiz auto-grade correctness', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            studentAnswer: fc.string({ maxLength: 20 }),
            correctAnswer: fc.string({ maxLength: 20 }),
          }),
          { maxLength: 30 },
        ),
        (pairs) => {
          const result = scoreQuizSubmission(pairs);
          const expected = pairs.filter(
            (p) => normalizeQuizAnswer(p.studentAnswer) === normalizeQuizAnswer(p.correctAnswer),
          ).length;
          expect(result.correctCount).toBe(expected);
          expect(result.totalQuestions).toBe(pairs.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 8: Notification read-state transition (Requirement 11.6)
  it('Property 8: Notification read-state transition', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }),
        (readStates) => {
          const notifications: Notification[] = readStates.map((isRead, idx) => ({
            id: `n-${idx}`,
            recipient_id: 'u1',
            type: 'announcement_posted',
            title: `T${idx}`,
            body: 'Body',
            metadata: null,
            is_read: isRead,
            created_at: new Date().toISOString(),
            read_at: isRead ? new Date().toISOString() : null,
          }));

          const unreadIndex = notifications.findIndex((n) => !n.is_read);
          if (unreadIndex < 0) return;

          const beforeUnread = notifications.filter((n) => !n.is_read).length;
          const res = markNotificationReadState(notifications, notifications[unreadIndex].id);
          expect(res.transitioned).toBe(true);
          expect(res.notifications[unreadIndex].is_read).toBe(true);
          expect(res.unreadCount).toBe(beforeUnread - 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 9: Manual attendance correction persistence (Requirement 8.4)
  it('Property 9: Manual attendance correction persistence', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 15 }), (candidateStatus) => {
        const isValid = candidateStatus === 'present' || candidateStatus === 'absent' || candidateStatus === 'excused';
        expect(validateAttendanceStatus(candidateStatus)).toBe(isValid);

        const res = applyManualAttendanceCorrection({
          record: null,
          courseId: 'c1',
          moduleId: 'm1',
          studentId: 's1',
          newStatus: candidateStatus,
          professorId: 'prof-1',
        });

        expect(res.ok).toBe(isValid);
        if (res.ok) {
          expect(res.record.manually_corrected).toBe(true);
          expect(res.record.corrected_by).toBe('prof-1');
          expect(res.record.corrected_at).toBeTruthy();
          expect(res.record.status).toBe(candidateStatus);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Property 10: Grade range invariant (Requirement 6.9)
  it('Property 10: Grade range invariant [0, 100]', () => {
    fc.assert(
      fc.property(fc.double({ min: -500, max: 500, noNaN: true }), (val) => {
        const res = validateGrade(val);
        const expected = Number.isFinite(val) && val >= 0 && val <= 100;
        expect(res.valid).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  // Property 11: File upload constraint validation (Requirements 5.1, 5.2, 7.4, 7.5)
  it('Property 11: File upload constraint validation (materials & submissions)', () => {
    const allowedMat = Array.from(ALLOWED_MATERIAL_MIME_TYPES);
    const allowedSub = Array.from(ALLOWED_SUBMISSION_MIME_TYPES);
    const allMimes = [...allowedMat, 'application/x-msdownload', 'text/html', 'application/javascript'];

    fc.assert(
      fc.property(
        fc.constantFrom(...allMimes),
        fc.integer({ min: 0, max: MAX_MATERIAL_SIZE_BYTES + 10_000_000 }),
        (type, size) => {
          const res = validateMaterialUpload({ type, size });
          const expected = ALLOWED_MATERIAL_MIME_TYPES.has(type) && size <= MAX_MATERIAL_SIZE_BYTES;
          expect(res.valid).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom(...allowedSub, 'application/x-sh', 'video/mp4'),
            size: fc.integer({ min: 1, max: 30 * 1024 * 1024 }),
          }),
          { minLength: 0, maxLength: 13 },
        ),
        (files) => {
          const res = validateSubmissionFiles(files);
          const totalSize = files.reduce((acc, f) => acc + f.size, 0);
          const allAllowed = files.every((f) => ALLOWED_SUBMISSION_MIME_TYPES.has(f.type));
          const expected =
            files.length <= MAX_SUBMISSION_FILES &&
            allAllowed &&
            totalSize <= MAX_SUBMISSION_TOTAL_BYTES;
          expect(res.valid).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 12: URL validation (Requirements 5.5, 5.6)
  it('Property 12: URL validation (http/https + RFC 3986)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.webUrl({ validSchemes: ['http', 'https'] }),
          fc.constantFrom(
            'ftp://example.com/file',
            'javascript:alert(1)',
            'not-a-url',
            'https://example.com/has space',
            '',
            'http://',
          ),
        ),
        (candidate) => {
          const res = validateExternalUrl(candidate);
          const startsOk = candidate.startsWith('http://') || candidate.startsWith('https://');
          const hasIllegalChars = /[\s<>"{}|\\^`]/.test(candidate);
          let parses = false;
          try {
            const u = new URL(candidate);
            parses =
              Boolean(u.hostname) &&
              /^[a-zA-Z0-9.-]+$|^\[[0-9a-fA-F:]+\]$/.test(u.hostname) &&
              !u.hostname.startsWith('.') &&
              !u.hostname.endsWith('.');
          } catch {
            parses = false;
          }
          expect(res.valid).toBe(startsOk && !hasIllegalChars && parses);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 13: Enrolled-only module attendance recording (Requirements 8.1, 9.2)
  it('Property 13: Enrolled-only module attendance recording', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<EnrollmentStatus | null>('active', 'pending', 'expired', null),
        (enrollmentStatus) => {
          const res = applyModuleViewAttendance({
            existingRecords: [],
            courseId: 'c1',
            moduleId: 'm1',
            studentId: 's1',
            enrollmentStatus,
          });
          expect(res.ok).toBe(enrollmentStatus === 'active');
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 14: Attendance percentage calculation (Requirements 10.1, 12.1)
  it('Property 14: Attendance percentage calculation', () => {
    const recArb = fc.record({
      first_viewed_at: fc.option(fc.constant('2026-11-19T00:00:00.000Z'), { nil: null }),
      status: fc.constantFrom<AttendanceStatus>('present', 'absent', 'excused'),
      manually_corrected: fc.boolean(),
    });

    fc.assert(
      fc.property(
        fc.array(recArb, { maxLength: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (records, totalModules) => {
          const pct = computeAttendancePercentage(records, totalModules);
          if (totalModules === 0) {
            expect(pct).toBe(0);
          } else {
            const attended = records.filter((r) => {
              const eff = deriveModuleAttendanceStatus(r);
              return eff === 'present' || eff === 'excused';
            }).length;
            const capped = Math.min(attended, totalModules);
            const expected = Math.round((capped / totalModules) * 10000) / 100;
            expect(pct).toBe(expected);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
