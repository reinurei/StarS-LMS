import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ClipboardCheck,
  Copy,
  Edit3,
  FileText,
  FolderPlus,
  ImagePlus,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Send,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { Badge, Button, Input, Modal, Table, Textarea } from '../../components/ui';
import { ActivityStatusBadge, ActivityStatusDot } from '../../components/ui/ActivityStatusDot';
import { useAuth } from '../../hooks/useAuth';
import { lmsService } from '../../lib/dataService';
import { toast } from '../../lib/toast';
import type { Activity, Announcement, Course, Enrollment, Module, Profile } from '../../lib/types';
import { courseSchema, validateAvatarFile } from '../../lib/validators';
import { useChatStore } from '../../store/chatStore';

type CourseTab = 'modules' | 'activities' | 'announcements' | 'roster' | 'settings';

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const openChatWith = useChatStore((s) => s.openChatWith);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [course, setCourse] = useState<Course | null>(null);
  const [instructor, setInstructor] = useState<Profile | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [activeTab, setActiveTab] = useState<CourseTab>('modules');
  const [loading, setLoading] = useState(true);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  // Add Module modal
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [newModName, setNewModName] = useState('');
  const [newModDesc, setNewModDesc] = useState('');

  // Announcement form (Requirement 11.7)
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [postingAnn, setPostingAnn] = useState(false);

  // Invite student form (Requirement 4.4)
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [inviting, setInviting] = useState(false);

  // Edit course form (Requirements 3.3, 3.9 — preserve unsaved input on error)
  const [editForm, setEditForm] = useState({
    name: '',
    subject_code: '',
    description: '',
    schedule: '',
    semester: '',
    academic_year: '',
    cover_image_url: '' as string | null,
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const loadAll = async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const c = await lmsService.getCourseById(courseId);
      setCourse(c);
      if (c) {
        setEditForm({
          name: c.name,
          subject_code: c.subject_code,
          description: c.description,
          schedule: c.schedule,
          semester: c.semester,
          academic_year: c.academic_year,
          cover_image_url: c.cover_image_url ?? null,
        });
        const [profProfile, mods, acts, anns, enrs] = await Promise.all([
          lmsService.getProfile(c.professor_id),
          lmsService.listModules(c.id),
          lmsService.listActivities(c.id),
          lmsService.listAnnouncements(c.id),
          lmsService.listCourseEnrollments(c.id),
        ]);
        setInstructor(profProfile);
        setModules(mods);
        setActivities(acts);
        setAnnouncements(anns);
        setEnrollments(enrs);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [courseId]);

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !course || !newModName.trim()) return;
    await lmsService.createModule(user.id, course.id, newModName, newModDesc);
    toast.success(`Module "${newModName}" published and students notified!`);
    setNewModName('');
    setNewModDesc('');
    setModuleModalOpen(false);
    await loadAll();
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !course || !annTitle.trim() || !annBody.trim()) return;
    setPostingAnn(true);
    try {
      await lmsService.createAnnouncement(user.id, course.id, annTitle, annBody);
      toast.success('Announcement posted and notifications sent to all enrolled students.');
      setAnnTitle('');
      setAnnBody('');
      await loadAll();
    } finally {
      setPostingAnn(false);
    }
  };

  const handleInviteStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !course || !inviteEmail.trim()) return;
    setInviteStatus(null);
    setInviting(true);
    try {
      const res = await lmsService.inviteStudentByEmail(user.id, course.id, inviteEmail);
      if (!res.delivered) {
        // Requirement 4.4: notify professor on delivery failure
        setInviteStatus({ type: 'error', text: res.error ?? 'Email delivery failed.' });
        toast.error(res.error ?? 'Invitation email delivery failed.');
      } else {
        setInviteStatus({
          type: 'success',
          text: `Invitation sent to ${inviteEmail}. Pending acceptance (expires in 7 days).`,
        });
        setInviteEmail('');
        toast.success('Student invitation sent!');
        await loadAll();
      }
    } finally {
      setInviting(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !course) return;
    setCoverError(null);
    const check = validateAvatarFile(file);
    if (!check.valid) {
      setCoverError(check.error ?? 'Please choose a valid JPEG, PNG, GIF, or WebP image (max 5 MB).');
      return;
    }
    setUploadingCover(true);
    try {
      const url = await lmsService.uploadCourseCover(course.id, file);
      setEditForm((f) => ({ ...f, cover_image_url: url }));
      toast.success('Course picture selected! Click "Save Changes" to publish it.');
    } catch (err) {
      setCoverError((err as Error).message);
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSaveCourseEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !course) return;
    setEditErrors({});

    const parsed = courseSchema.safeParse(editForm);
    if (!parsed.success) {
      // Requirement 3.9: keep unsaved form state intact and show field errors
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[String(issue.path[0])] = issue.message;
      }
      setEditErrors(errs);
      return;
    }

    setSavingEdit(true);
    try {
      const updated = await lmsService.updateCourse(user.id, course.id, {
        ...parsed.data,
        cover_image_url: editForm.cover_image_url || null,
      });
      setCourse(updated);
      toast.success('Course details and overview picture updated.');
    } catch (err) {
      toast.error(`Save unsuccessful: ${(err as Error).message}`);
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-white border border-[#E5E7EB]" />;
  }

  if (!course) {
    return (
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center">
        <p className="text-base font-semibold text-[#1E1B4B]">Course not found</p>
        <Button className="mt-4" onClick={() => navigate('/courses')}>
          Back to Courses
        </Button>
      </div>
    );
  }

  const activeRoster = enrollments.filter((e) => e.status === 'active');

  return (
    <div className="space-y-6">
      <Link
        to="/courses"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B7280] hover:text-[#7C5CFC]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Courses
      </Link>

      {/* Course Overview Header Banner (shows professor's selected cover picture when set) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] p-6 text-white shadow-md">
        {course.cover_image_url && (
          <>
            <img
              src={course.cover_image_url}
              alt={`${course.name} banner`}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#1E1B4B]/85 via-[#2E1065]/70 to-[#1E1B4B]/55" />
          </>
        )}

        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-white/25 px-2.5 py-0.5 text-xs font-bold backdrop-blur-xs">
                {course.subject_code}
              </span>
              <span className="text-xs text-white/90">
                {course.semester} · AY {course.academic_year}
              </span>
              {course.is_archived && (
                <span className="rounded-full bg-amber-400/90 px-2.5 py-0.5 text-xs font-semibold text-[#1E1B4B]">
                  Archived
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-bold drop-shadow-xs">{course.name}</h1>
            <p className="mt-1 text-sm text-white/90 max-w-2xl">{course.description}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-white/85">
              <span>Schedule: {course.schedule}</span>
              {instructor && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 backdrop-blur-xs">
                  <ActivityStatusDot status={instructor.activity_status} />
                  Instructor:{' '}
                  <Link
                    to={`/profile/${instructor.id}`}
                    className="font-semibold text-white underline-offset-2 hover:underline"
                  >
                    {instructor.full_name}
                  </Link>
                  {role === 'student' && (
                    <button
                      type="button"
                      onClick={() => openChatWith(instructor.id)}
                      className="ml-1 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#7C5CFC] hover:bg-[#EDE9FE] cursor-pointer"
                    >
                      <MessageCircle className="h-3 w-3" />
                      Chat
                    </button>
                  )}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {role === 'professor' && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(course.enrollment_code);
                  toast.success(`Enrollment code ${course.enrollment_code} copied!`);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-3.5 py-2 text-xs font-semibold backdrop-blur-xs hover:bg-white/30 cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                Code: {course.enrollment_code}
              </button>
            )}
            <Link to={`/courses/${course.id}/forums`}>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-[#7C5CFC] hover:bg-[#F5F3FF] cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Discussion Forum
              </button>
            </Link>
            <Link to={`/attendance?courseId=${course.id}`}>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20 cursor-pointer"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                Attendance
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#E5E7EB] pb-2">
        {(
          [
            { id: 'modules', label: `Modules (${modules.length})`, icon: BookOpen },
            { id: 'activities', label: `Activities (${activities.length})`, icon: FileText },
            { id: 'announcements', label: `Announcements (${announcements.length})`, icon: Megaphone },
            ...(role === 'professor'
              ? [
                  { id: 'roster', label: `Students (${activeRoster.length})`, icon: Users },
                  { id: 'settings', label: 'Edit Course', icon: Edit3 },
                ]
              : []),
          ] as Array<{ id: CourseTab; label: string; icon: typeof BookOpen }>
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition cursor-pointer ${
                active
                  ? 'bg-[#7C5CFC] text-white shadow-xs'
                  : 'bg-white text-[#6B7280] border border-[#E5E7EB] hover:bg-[#EDE9FE]/50 hover:text-[#7C5CFC]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB: Modules & Materials */}
      {activeTab === 'modules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#1E1B4B]">Course Modules</h2>
              <p className="text-xs text-[#6B7280]">
                {role === 'student'
                  ? 'Opening any module automatically records your attendance as Present.'
                  : 'Organize lecture slides, videos, documents, and external links by module.'}
              </p>
            </div>
            {role === 'professor' && (
              <Button size="sm" onClick={() => setModuleModalOpen(true)}>
                <FolderPlus className="h-4 w-4" />
                Add Module
              </Button>
            )}
          </div>

          {modules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D8D4F2] bg-white p-10 text-center text-sm text-[#6B7280]">
              No modules published yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {modules.map((mod) => (
                <Link
                  key={mod.id}
                  to={`/courses/${course.id}/modules/${mod.id}`}
                  className="group flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs transition hover:border-[#7C5CFC]/50 hover:shadow-md"
                >
                  <div>
                    <Badge variant="primary">Module {mod.display_order}</Badge>
                    <h3 className="mt-2.5 text-base font-semibold text-[#1E1B4B] group-hover:text-[#7C5CFC]">
                      {mod.name}
                    </h3>
                    {mod.description && (
                      <p className="mt-1 text-xs text-[#6B7280]">{mod.description}</p>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-[#E5E7EB] pt-3 text-xs">
                    <span className="text-[#6B7280]">
                      Published {new Date(mod.created_at).toLocaleDateString()}
                    </span>
                    <span className="font-semibold text-[#7C5CFC]">Open Module →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: Activities */}
      {activeTab === 'activities' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#1E1B4B]">Course Activities & Quizzes</h2>
            {role === 'professor' && (
              <Link to={`/activities/new?courseId=${course.id}`}>
                <Button size="sm">Create Activity</Button>
              </Link>
            )}
          </div>

          {activities.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D8D4F2] bg-white p-10 text-center text-sm text-[#6B7280]">
              No activities created for this course yet.
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((act) => (
                <Link
                  key={act.id}
                  to={`/activities/${act.id}`}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xs transition hover:border-[#7C5CFC]/40 hover:shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="primary">{act.activity_type.replace('_', ' ')}</Badge>
                      {act.time_limit_minutes && (
                        <Badge variant="neutral">{act.time_limit_minutes} min timer</Badge>
                      )}
                    </div>
                    <h3 className="mt-1.5 text-sm font-semibold text-[#1E1B4B]">{act.title}</h3>
                    <p className="mt-0.5 text-xs text-[#6B7280] line-clamp-1">{act.instructions}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-medium text-[#1E1B4B]">
                      Due {new Date(act.deadline).toLocaleString()}
                    </p>
                    <span className="text-xs font-semibold text-[#7C5CFC]">Open →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: Announcements (Requirement 11.7) */}
      {activeTab === 'announcements' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {role === 'professor' && (
            <form
              onSubmit={handlePostAnnouncement}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs space-y-4 h-fit"
            >
              <h2 className="text-sm font-semibold text-[#1E1B4B]">Post Announcement</h2>
              <Input
                label="Title"
                placeholder="e.g. Midterm Review Session"
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                required
              />
              <Textarea
                label="Message"
                rows={4}
                placeholder="Write your announcement to all enrolled students..."
                value={annBody}
                onChange={(e) => setAnnBody(e.target.value)}
                required
              />
              <Button type="submit" isLoading={postingAnn} className="w-full">
                <Send className="h-4 w-4" />
                Publish & Notify Class
              </Button>
            </form>
          )}

          <div className={role === 'professor' ? 'lg:col-span-2 space-y-3' : 'lg:col-span-3 space-y-3'}>
            {announcements.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#D8D4F2] bg-white p-10 text-center text-sm text-[#6B7280]">
                No announcements posted yet.
              </div>
            ) : (
              announcements.map((ann) => (
                <div key={ann.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#1E1B4B]">{ann.title}</h3>
                    <span className="text-xs text-[#6B7280]">
                      {new Date(ann.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[#4B5563]">{ann.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB: Roster & Invitations (Professor — Requirements 3.7, 4.4) */}
      {activeTab === 'roster' && role === 'professor' && (
        <div className="space-y-6">
          <form
            onSubmit={handleInviteStudent}
            className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs"
          >
            <h2 className="text-sm font-semibold text-[#1E1B4B]">Invite Student by Email</h2>
            <p className="mt-0.5 text-xs text-[#6B7280]">
              Creates a pending enrollment invitation (valid for 7 days) and notifies the student.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Input
                type="email"
                placeholder="student@university.edu"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
              <Button type="submit" isLoading={inviting} className="shrink-0">
                <UserPlus className="h-4 w-4" />
                Send Invitation
              </Button>
            </div>
            {inviteStatus && (
              <p
                role="alert"
                className={`mt-2.5 text-xs font-medium ${
                  inviteStatus.type === 'error' ? 'text-red-600' : 'text-emerald-700'
                }`}
              >
                {inviteStatus.text}
              </p>
            )}
          </form>

          <Table
            rowKey={(r) => r.id}
            data={enrollments}
            emptyMessage="No students enrolled or invited yet."
            columns={[
              {
                key: 'name',
                header: 'Student',
                render: (r) => (
                  <div className="flex items-center gap-2.5">
                    <ActivityStatusDot status={r.student?.activity_status} />
                    <div>
                      <Link
                        to={`/profile/${r.student_id}`}
                        className="font-medium text-[#1E1B4B] hover:text-[#7C5CFC] hover:underline"
                      >
                        {r.student?.full_name ?? r.student_id}
                      </Link>
                      {r.student?.program_course && (
                        <p className="text-[11px] text-[#6B7280]">{r.student.program_course}</p>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'email',
                header: 'Email',
                render: (r) => <span className="text-[#6B7280]">{r.student?.email ?? '—'}</span>,
              },
              {
                key: 'activity',
                header: 'Activity Status',
                render: (r) => <ActivityStatusBadge status={r.student?.activity_status} />,
              },
              {
                key: 'status',
                header: 'Enrollment',
                render: (r) => (
                  <Badge variant={r.status === 'active' ? 'present' : r.status === 'pending' ? 'pending' : 'absent'}>
                    {r.status}
                  </Badge>
                ),
              },
              {
                key: 'actions',
                header: 'Profile & Chat',
                render: (r) => (
                  <div className="flex items-center gap-2">
                    <Link to={`/profile/${r.student_id}`}>
                      <Button size="sm" variant="outline">
                        Profile
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openChatWith(r.student_id)}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Chat
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* TAB: Edit Course (Professor — Requirements 3.3, 3.9 + Editable Cover Image) */}
      {activeTab === 'settings' && role === 'professor' && (
        <form
          onSubmit={handleSaveCourseEdit}
          noValidate
          className="max-w-2xl rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xs space-y-5"
        >
          <h2 className="text-base font-semibold text-[#1E1B4B]">Edit Course Details & Picture</h2>

          {/* Editable Course Overview Picture */}
          <div className="space-y-2.5">
            <label className="block text-sm font-medium text-[#1E1B4B]">
              Course Overview Picture
            </label>
            <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-[#E5E7EB] bg-gradient-to-r from-[#8B5CF6] to-[#6366F1]">
              {editForm.cover_image_url ? (
                <>
                  <img
                    src={editForm.cover_image_url}
                    alt="Course cover preview"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1E1B4B]/60 to-transparent" />
                </>
              ) : (
                <div className="text-center text-white/90">
                  <ImagePlus className="mx-auto h-8 w-8 opacity-90" />
                  <p className="mt-1 text-xs font-medium">Default purple gradient banner</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleCoverUpload}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isLoading={uploadingCover}
                onClick={() => coverInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                {editForm.cover_image_url ? 'Change Picture' : 'Select Course Picture'}
              </Button>
              {editForm.cover_image_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditForm((f) => ({ ...f, cover_image_url: null }))}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                  Remove Picture
                </Button>
              )}
              <span className="text-xs text-[#6B7280]">JPEG, PNG, GIF, or WebP · Max 5 MB</span>
            </div>
            {coverError && (
              <p role="alert" className="text-xs text-red-600">
                {coverError}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Input
                label="Course Name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                error={editErrors.name}
              />
            </div>
            <Input
              label="Subject Code"
              value={editForm.subject_code}
              onChange={(e) => setEditForm((f) => ({ ...f, subject_code: e.target.value.toUpperCase() }))}
              error={editErrors.subject_code}
            />
          </div>
          <Textarea
            label="Description"
            rows={4}
            value={editForm.description}
            onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
            error={editErrors.description}
          />
          <Input
            label="Schedule"
            value={editForm.schedule}
            onChange={(e) => setEditForm((f) => ({ ...f, schedule: e.target.value }))}
            error={editErrors.schedule}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">Semester</label>
              <select
                value={editForm.semester}
                onChange={(e) => setEditForm((f) => ({ ...f, semester: e.target.value }))}
                className="block w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1E1B4B] focus:border-[#7C5CFC] focus:outline-none"
              >
                <option value="1st Semester">1st Semester</option>
                <option value="2nd Semester">2nd Semester</option>
                <option value="Summer Term">Summer Term</option>
              </select>
            </div>
            <Input
              label="Academic Year"
              value={editForm.academic_year}
              onChange={(e) => setEditForm((f) => ({ ...f, academic_year: e.target.value }))}
              error={editErrors.academic_year}
            />
          </div>
          <Button type="submit" isLoading={savingEdit}>
            Save Changes
          </Button>
        </form>
      )}

      {/* Add Module Modal */}
      <Modal
        isOpen={moduleModalOpen}
        onClose={() => setModuleModalOpen(false)}
        title="Add New Module"
        subtitle="Students will receive a notification and earn Present attendance upon viewing this module."
      >
        <form onSubmit={handleAddModule} className="space-y-4">
          <Input
            label="Module Name"
            placeholder="e.g. Module 4: Dynamic Programming"
            value={newModName}
            onChange={(e) => setNewModName(e.target.value)}
            required
          />
          <Textarea
            label="Description (optional)"
            rows={3}
            placeholder="Brief overview of what this module covers..."
            value={newModDesc}
            onChange={(e) => setNewModDesc(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModuleModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Publish Module</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
