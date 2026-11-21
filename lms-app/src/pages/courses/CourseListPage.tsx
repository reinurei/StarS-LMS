import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive,
  BookOpen,
  CalendarRange,
  Copy,
  KeyRound,
  MailCheck,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  COURSE_CARD_GRADIENTS,
  StudentCourseCard,
} from '../../components/courses/CourseCard';
import { Badge, Button, Input, Modal } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { computeAttendancePercentage } from '../../lib/attendance';
import { EnrollmentError, lmsService } from '../../lib/dataService';
import { toast } from '../../lib/toast';
import type { Course, Enrollment } from '../../lib/types';

const SEMESTER_OPTIONS = ['1st Semester', '2nd Semester', 'Summer Term'] as const;

interface StudentProgressMeta {
  attendancePct: number;
  viewedModules: number;
  totalModules: number;
}

export default function CourseListPage() {
  const { user, role } = useAuth();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  const [courses, setCourses] = useState<Course[]>([]);
  const [studentProgress, setStudentProgress] = useState<Record<string, StudentProgressMeta>>({});
  const [invitations, setInvitations] = useState<Enrollment[]>([]);
  const [search, setSearch] = useState(initialQuery);
  const [semesterFilter, setSemesterFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);

  // Student enroll modal
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  // Professor semester edit modal
  const [semesterEditTarget, setSemesterEditTarget] = useState<Course | null>(null);
  const [editSemesterVal, setEditSemesterVal] = useState('1st Semester');
  const [editAcademicYearVal, setEditAcademicYearVal] = useState('2026-2027');
  const [savingSemester, setSavingSemester] = useState(false);

  // Professor delete confirmation modal (Requirement 3.5)
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCourses = async () => {
    if (!user || !role) return;
    setLoading(true);
    try {
      const list = await lmsService.listCourses(user.id, role);
      setCourses(list);
      if (role === 'student') {
        const [inv, myAtts] = await Promise.all([
          lmsService.listStudentInvitations(user.id),
          lmsService.listStudentAttendance(user.id),
        ]);
        setInvitations(inv);

        const progressMap: Record<string, StudentProgressMeta> = {};
        for (const c of list) {
          const mods = await lmsService.listModules(c.id);
          const courseAtts = myAtts.filter((a) => a.course_id === c.id);
          progressMap[c.id] = {
            attendancePct: computeAttendancePercentage(courseAtts, mods.length),
            viewedModules: courseAtts.filter(
              (a) => a.status === 'present' || a.status === 'excused',
            ).length,
            totalModules: mods.length,
          };
        }
        setStudentProgress(progressMap);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, [user, role]);

  useEffect(() => {
    setSearch(searchParams.get('q') ?? '');
  }, [searchParams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) => {
      if (role === 'professor' && !showArchived && c.is_archived) return false;
      if (semesterFilter !== 'all' && c.semester !== semesterFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.subject_code.toLowerCase().includes(q) ||
        c.semester.toLowerCase().includes(q) ||
        c.academic_year.toLowerCase().includes(q)
      );
    });
  }, [courses, search, semesterFilter, showArchived, role]);

  // Requirement 3.2: Group by semester and academic year
  const grouped = useMemo(() => {
    const groups = new Map<string, Course[]>();
    for (const c of filtered) {
      const key = `${c.semester} · AY ${c.academic_year}`;
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  const handleToggleArchive = async (course: Course) => {
    if (!user) return;
    await lmsService.updateCourse(user.id, course.id, { is_archived: !course.is_archived });
    toast.success(
      course.is_archived
        ? `${course.subject_code} restored to active courses.`
        : `${course.subject_code} archived.`,
    );
    await loadCourses();
  };

  const handleQuickSemesterChange = async (course: Course, newSem: string) => {
    if (!user || course.semester === newSem) return;
    await lmsService.updateCourse(user.id, course.id, { semester: newSem });
    toast.success(`${course.subject_code} moved to ${newSem}.`);
    await loadCourses();
  };

  const openSemesterModal = (course: Course) => {
    setSemesterEditTarget(course);
    setEditSemesterVal(course.semester);
    setEditAcademicYearVal(course.academic_year);
  };

  const handleSaveSemesterModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !semesterEditTarget) return;
    setSavingSemester(true);
    try {
      await lmsService.updateCourse(user.id, semesterEditTarget.id, {
        semester: editSemesterVal,
        academic_year: editAcademicYearVal.trim() || semesterEditTarget.academic_year,
      });
      toast.success(
        `Updated ${semesterEditTarget.subject_code} to ${editSemesterVal} (AY ${editAcademicYearVal}).`,
      );
      setSemesterEditTarget(null);
      await loadCourses();
    } finally {
      setSavingSemester(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    try {
      await lmsService.deleteCourse(user.id, deleteTarget.id);
      toast.success(`Course "${deleteTarget.name}" permanently deleted.`);
      setDeleteTarget(null);
      await loadCourses();
    } finally {
      setDeleting(false);
    }
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setEnrollError(null);
    if (!enrollCode.trim()) {
      setEnrollError('Please enter an 8-character enrollment code.');
      return;
    }
    setEnrolling(true);
    try {
      const { course } = await lmsService.enrollByCode(user.id, enrollCode);
      toast.success(`Enrolled in ${course.subject_code} — ${course.name}!`);
      setEnrollCode('');
      setEnrollModalOpen(false);
      await loadCourses();
    } catch (err) {
      if (err instanceof EnrollmentError) {
        setEnrollError(err.message);
      } else {
        setEnrollError((err as Error).message || 'Could not complete enrollment.');
      }
    } finally {
      setEnrolling(false);
    }
  };

  const handleAcceptInvite = async (enrollmentId: string) => {
    if (!user) return;
    try {
      await lmsService.acceptInvitation(user.id, enrollmentId);
      toast.success('Course invitation accepted!');
      await loadCourses();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E1B4B]">
            {role === 'professor' ? 'Course Management' : 'My Enrolled Courses'}
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            {role === 'professor'
              ? 'Organized by semester and academic year. Edit a course’s semester to separate 1st and 2nd semester classes.'
              : 'Access your active classes, track module attendance, or join a new course using an enrollment code.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {role === 'professor' ? (
            <>
              <Button
                variant={showArchived ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowArchived((v) => !v)}
              >
                <Archive className="h-4 w-4" />
                {showArchived ? 'Hide Archived' : 'Show Archived'}
              </Button>
              <Link to="/courses/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Create Course
                </Button>
              </Link>
            </>
          ) : (
            <Button onClick={() => setEnrollModalOpen(true)}>
              <KeyRound className="h-4 w-4" />
              Enroll with Code
            </Button>
          )}
        </div>
      </div>

      {/* Filter & Semester Tabs Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Input
            placeholder="Filter by course name or subject code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['all', ...SEMESTER_OPTIONS] as const).map((sem) => (
            <button
              key={sem}
              type="button"
              onClick={() => setSemesterFilter(sem)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                semesterFilter === sem
                  ? 'bg-[#7C5CFC] text-white shadow-xs'
                  : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#EDE9FE]/50 hover:text-[#7C5CFC]'
              }`}
            >
              {sem === 'all' ? 'All Semesters' : sem}
            </button>
          ))}
        </div>
      </div>

      {/* Student Pending Invitations */}
      {role === 'student' && invitations.length > 0 && (
        <div className="rounded-2xl border border-[#7C5CFC]/30 bg-[#EDE9FE]/50 p-4 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#1E1B4B]">
            <MailCheck className="h-4 w-4 text-[#7C5CFC]" />
            Pending Course Invitations
          </h2>
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
                    Valid until{' '}
                    {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '7 days'}
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

      {/* Courses List */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-52 animate-pulse rounded-xl bg-white border border-[#E5E7EB]" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D8D4F2] bg-white p-12 text-center">
          <BookOpen className="mx-auto h-9 w-9 text-[#7C5CFC]" />
          <p className="mt-2 text-sm font-semibold text-[#1E1B4B]">No courses found</p>
          <p className="mt-1 text-xs text-[#6B7280]">
            {role === 'professor'
              ? 'Create a course or adjust your semester filter.'
              : 'Enter an enrollment code (e.g. DB402SQL) to join a course.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([termLabel, termCourses]) => (
            <section key={termLabel} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6B7280]">
                  {termLabel}
                </h2>
                <Badge variant="neutral">{termCourses.length}</Badge>
              </div>

              {/* STUDENT VIEW — Identical card interface to Student Dashboard */}
              {role === 'student' ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {termCourses.map((course, idx) => {
                    const prog = studentProgress[course.id] ?? {
                      attendancePct: 0,
                      viewedModules: 0,
                      totalModules: 0,
                    };
                    return (
                      <StudentCourseCard
                        key={course.id}
                        course={course}
                        attendancePct={prog.attendancePct}
                        viewedModules={prog.viewedModules}
                        totalModules={prog.totalModules}
                        colorIndex={idx}
                      />
                    );
                  })}
                </div>
              ) : (
                /* PROFESSOR VIEW — Cover image + quick semester editor + enrollment code */
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {termCourses.map((course, idx) => (
                    <div
                      key={course.id}
                      className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-xs transition-shadow hover:shadow-md"
                    >
                      <div>
                        <Link to={`/courses/${course.id}`}>
                          <div
                            className={`relative flex h-32 flex-col justify-between overflow-hidden bg-gradient-to-br p-4 text-white ${
                              COURSE_CARD_GRADIENTS[idx % COURSE_CARD_GRADIENTS.length]
                            }`}
                          >
                            {course.cover_image_url && (
                              <>
                                <img
                                  src={course.cover_image_url}
                                  alt={`${course.name} cover`}
                                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#1E1B4B]/80 via-[#1E1B4B]/35 to-black/20" />
                              </>
                            )}
                            <div className="relative z-10 flex items-center justify-between gap-2">
                              <span className="rounded-lg bg-white/25 px-2.5 py-0.5 text-xs font-bold backdrop-blur-xs">
                                {course.subject_code}
                              </span>
                              {course.is_archived && (
                                <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-[#1E1B4B]">
                                  Archived
                                </span>
                              )}
                            </div>
                            <h3 className="relative z-10 text-base font-bold leading-snug drop-shadow-xs line-clamp-2">
                              {course.name}
                            </h3>
                          </div>
                        </Link>

                        <div className="p-4 space-y-2.5">
                          <p className="text-xs text-[#6B7280] line-clamp-2">{course.description}</p>
                          <p className="text-xs font-medium text-[#4B5563]">{course.schedule}</p>

                          {/* Inline Quick Semester Edit */}
                          <div className="flex items-center justify-between gap-2 rounded-xl bg-[#F5F3FF] px-3 py-2">
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6B7280]">
                              <CalendarRange className="h-3.5 w-3.5 text-[#7C5CFC]" />
                              Semester:
                            </span>
                            <div className="flex items-center gap-1.5">
                              <select
                                aria-label={`Change semester for ${course.name}`}
                                value={course.semester}
                                onChange={(e) => handleQuickSemesterChange(course, e.target.value)}
                                className="rounded-lg border border-[#DDD6FE] bg-white px-2 py-1 text-xs font-semibold text-[#1E1B4B] focus:border-[#7C5CFC] focus:outline-none cursor-pointer"
                              >
                                {SEMESTER_OPTIONS.map((sem) => (
                                  <option key={sem} value={sem}>
                                    {sem}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => openSemesterModal(course)}
                                title="Edit semester & academic year"
                                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#7C5CFC] hover:bg-[#EDE9FE] cursor-pointer"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-[#E5E7EB] px-4 py-3 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#6B7280]">Enrollment Code:</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(course.enrollment_code);
                              toast.success(`Copied ${course.enrollment_code}`);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#EDE9FE] px-2.5 py-1 font-mono font-semibold text-[#7C5CFC] hover:bg-[#DDD6FE] cursor-pointer"
                          >
                            <Copy className="h-3 w-3" />
                            {course.enrollment_code}
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <Link to={`/courses/${course.id}`}>
                            <Button size="sm" variant="secondary">
                              Open Course
                            </Button>
                          </Link>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleToggleArchive(course)}
                              title={course.is_archived ? 'Restore course' : 'Archive course'}
                              className="rounded-lg p-1.5 text-[#6B7280] hover:bg-gray-100 hover:text-[#1E1B4B] cursor-pointer"
                            >
                              {course.is_archived ? (
                                <RotateCcw className="h-4 w-4" />
                              ) : (
                                <Archive className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(course)}
                              title="Delete course"
                              className="rounded-lg p-1.5 text-[#6B7280] hover:bg-red-50 hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Professor Edit Semester & Academic Year Modal */}
      <Modal
        isOpen={Boolean(semesterEditTarget)}
        onClose={() => setSemesterEditTarget(null)}
        title={`Edit Semester — ${semesterEditTarget?.subject_code ?? ''}`}
        subtitle="Move this course to 1st Semester, 2nd Semester, or Summer Term."
      >
        <form onSubmit={handleSaveSemesterModal} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">Semester</label>
            <select
              value={editSemesterVal}
              onChange={(e) => setEditSemesterVal(e.target.value)}
              className="block w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1E1B4B] focus:border-[#7C5CFC] focus:outline-none"
            >
              {SEMESTER_OPTIONS.map((sem) => (
                <option key={sem} value={sem}>
                  {sem}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Academic Year"
            placeholder="2026-2027"
            value={editAcademicYearVal}
            onChange={(e) => setEditAcademicYearVal(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSemesterEditTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={savingSemester}>
              Save Semester
            </Button>
          </div>
        </form>
      </Modal>

      {/* Student Enroll By Code Modal */}
      <Modal
        isOpen={enrollModalOpen}
        onClose={() => {
          setEnrollModalOpen(false);
          setEnrollError(null);
        }}
        title="Enroll in a Course"
        subtitle="Enter the 8-character alphanumeric enrollment code provided by your professor."
      >
        <form onSubmit={handleEnrollSubmit} className="space-y-4">
          <Input
            label="Enrollment Code"
            placeholder="e.g. DB402SQL"
            value={enrollCode}
            onChange={(e) => setEnrollCode(e.target.value.toUpperCase())}
            error={enrollError ?? undefined}
            maxLength={12}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEnrollModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={enrolling}>
              Enroll Now
            </Button>
          </div>
        </form>
      </Modal>

      {/* Professor Delete Confirmation Dialog */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Course Permanently"
        subtitle="This action cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" isLoading={deleting} onClick={handleConfirmDelete}>
              Confirm Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-[#6B7280]">
          Are you sure you want to permanently delete{' '}
          <strong className="text-[#1E1B4B]">
            {deleteTarget?.subject_code} — {deleteTarget?.name}
          </strong>
          ? All modules, materials, activities, submissions, and attendance records associated with
          this course will be permanently removed.
        </p>
      </Modal>
    </div>
  );
}
