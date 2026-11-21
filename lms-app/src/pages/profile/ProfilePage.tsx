import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Camera,
  Download,
  ExternalLink,
  GraduationCap,
  Link2,
  MessageCircle,
  Plus,
  Shield,
  Trash2,
  UserCircle,
  Users,
} from 'lucide-react';
import { Badge, Button, Input, Modal } from '../../components/ui';
import {
  ACTIVITY_STATUS_META,
  ActivityStatusBadge,
  ActivityStatusDot,
} from '../../components/ui/ActivityStatusDot';
import { useAuth } from '../../hooks/useAuth';
import { lmsService } from '../../lib/dataService';
import { toast } from '../../lib/toast';
import type { Course, Profile, SocialLink, UserActivityStatus } from '../../lib/types';
import { profileSchema, validateAvatarFile, validateExternalUrl } from '../../lib/validators';
import { useChatStore } from '../../store/chatStore';

const STATUS_OPTIONS: UserActivityStatus[] = ['active', 'idle', 'dnd', 'offline'];

export default function ProfilePage() {
  const { userId: paramUserId } = useParams<{ userId?: string }>();
  const { user, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const openChatWith = useChatStore((s) => s.openChatWith);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isViewingOther = Boolean(paramUserId && user && paramUserId !== user.id);

  // Viewed profile (when viewing another student/professor)
  const [viewedProfile, setViewedProfile] = useState<Profile | null>(null);
  const [viewedCourses, setViewedCourses] = useState<Course[]>([]);
  const [peers, setPeers] = useState<Profile[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Own editable form state
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatar_url ?? null);
  const [activityStatus, setActivityStatus] = useState<UserActivityStatus>(
    user?.activity_status ?? 'active',
  );
  const [programCourse, setProgramCourse] = useState(user?.program_course ?? '');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(user?.social_links ?? []);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const [errors, setErrors] = useState<{ full_name?: string; email?: string; avatar?: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    lmsService.listProfiles().then((all) => {
      setPeers(all.filter((p) => p.id !== user.id));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;

    if (isViewingOther && paramUserId) {
      setLoadingProfile(true);
      lmsService
        .getProfile(paramUserId)
        .then(async (prof) => {
          setViewedProfile(prof);
          if (prof) {
            const cList = await lmsService.listCourses(prof.id, prof.role);
            setViewedCourses(cList.filter((c) => !c.is_archived));
          }
        })
        .finally(() => setLoadingProfile(false));
      return;
    }

    // Load fresh own profile
    lmsService.getProfile(user.id).then((prof) => {
      if (prof) {
        setFullName(prof.full_name);
        setEmail(prof.email);
        setAvatarUrl(prof.avatar_url);
        setActivityStatus(prof.activity_status ?? 'active');
        setProgramCourse(prof.program_course ?? '');
        setSocialLinks(prof.social_links ?? []);
      } else {
        setFullName(user.full_name);
        setEmail(user.email);
        setAvatarUrl(user.avatar_url);
        setActivityStatus(user.activity_status ?? 'active');
        setProgramCourse(user.program_course ?? '');
        setSocialLinks(user.social_links ?? []);
      }
    });
  }, [user, isViewingOther, paramUserId]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setErrors((prev) => ({ ...prev, avatar: undefined }));

    const check = validateAvatarFile(file);
    if (!check.valid) {
      setErrors((prev) => ({ ...prev, avatar: check.error }));
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const uploadedUrl = await lmsService.uploadAvatar(user.id, file);
      setAvatarUrl(uploadedUrl);
      await lmsService.updateProfile(user.id, {
        full_name: fullName.trim() || user.full_name,
        email: email.trim() || user.email,
        avatar_url: uploadedUrl,
        activity_status: activityStatus,
        program_course: programCourse.trim() || null,
        social_links: socialLinks,
      });
      await refreshProfile();
      toast.success('Profile photo updated.');
    } catch (err) {
      setErrors((prev) => ({ ...prev, avatar: (err as Error).message }));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAddLink = () => {
    setLinkError(null);
    const label = newLinkLabel.trim();
    const url = newLinkUrl.trim();
    if (!label) {
      setLinkError('Please enter a label for this link (e.g., GitHub, LinkedIn, Portfolio).');
      return;
    }
    const check = validateExternalUrl(url);
    if (!check.valid) {
      setLinkError(check.error ?? 'Enter a valid http:// or https:// URL.');
      return;
    }
    setSocialLinks((prev) => [...prev, { label, url }]);
    setNewLinkLabel('');
    setNewLinkUrl('');
  };

  const handleRemoveLink = (index: number) => {
    setSocialLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrors((prev) => ({ ...prev, full_name: undefined, email: undefined }));

    const parsed = profileSchema.safeParse({ full_name: fullName, email });
    if (!parsed.success) {
      const nextErrors: { full_name?: string; email?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'full_name') nextErrors.full_name = issue.message;
        if (issue.path[0] === 'email') nextErrors.email = issue.message;
      }
      setErrors((prev) => ({ ...prev, ...nextErrors }));
      return;
    }

    setIsSaving(true);
    try {
      await lmsService.updateProfile(user.id, {
        full_name: parsed.data.full_name,
        email: parsed.data.email,
        avatar_url: avatarUrl,
        activity_status: activityStatus,
        program_course: programCourse.trim() || null,
        social_links: socialLinks,
      });
      await refreshProfile();
      toast.success('Profile, activity status, course, and links saved!');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestData = async () => {
    if (!user) return;
    const exported = await lmsService.exportPersonalData(user.id);
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stars-lms-personal-data-${user.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Your personal data archive has been downloaded.');
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setIsDeleting(true);
    try {
      await lmsService.requestAccountDeletion(user.id);
      toast.success('Your account deletion request has been submitted and your session closed.');
      setDeleteModalOpen(false);
      await signOut();
      navigate('/auth/login', { replace: true });
    } finally {
      setIsDeleting(false);
    }
  };

  // =========================================================================
  // VIEWING ANOTHER USER'S PROFILE (Professor viewing Student / Student viewing Professor or Classmate)
  // =========================================================================
  if (isViewingOther) {
    if (loadingProfile) {
      return <div className="h-64 animate-pulse rounded-2xl bg-white border border-[#E5E7EB]" />;
    }

    if (!viewedProfile) {
      return (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center">
          <p className="text-base font-semibold text-[#1E1B4B]">Profile not found</p>
          <Link to="/profile" className="mt-4 inline-block">
            <Button size="sm">Return to My Profile</Button>
          </Link>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          to="/profile"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B7280] hover:text-[#7C5CFC]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to My Profile & Directory
        </Link>

        {/* Peer Profile Hero Card */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xs space-y-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between border-b border-[#E5E7EB] pb-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                {viewedProfile.avatar_url ? (
                  <img
                    src={viewedProfile.avatar_url}
                    alt={viewedProfile.full_name}
                    className="h-20 w-20 rounded-2xl object-cover ring-4 ring-[#EDE9FE]"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EDE9FE] to-[#DDD6FE] text-[#7C5CFC]">
                    <UserCircle className="h-12 w-12" />
                  </div>
                )}
                <ActivityStatusDot
                  status={viewedProfile.activity_status}
                  size="md"
                  className="absolute -bottom-1 -right-1"
                />
              </div>

              <div>
                <h1 className="text-xl font-bold text-[#1E1B4B]">{viewedProfile.full_name}</h1>
                <p className="text-sm text-[#6B7280]">{viewedProfile.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="primary">{viewedProfile.role}</Badge>
                  <ActivityStatusBadge status={viewedProfile.activity_status} />
                </div>
              </div>
            </div>

            {/* Direct Chat Button between Professor & Student */}
            <Button size="lg" onClick={() => openChatWith(viewedProfile.id)}>
              <MessageCircle className="h-4 w-4" />
              Chat with {viewedProfile.full_name.split(' ')[0]}
            </Button>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Program / Course Info */}
            <div className="rounded-xl bg-[#F5F3FF] p-4 space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                <GraduationCap className="h-4 w-4 text-[#7C5CFC]" />
                Course / Program
              </p>
              <p className="text-sm font-semibold text-[#1E1B4B]">
                {viewedProfile.program_course || 'Not specified yet'}
              </p>
            </div>

            {/* External Links */}
            <div className="rounded-xl bg-[#F5F3FF] p-4 space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                <Link2 className="h-4 w-4 text-[#7C5CFC]" />
                Links
              </p>
              {viewedProfile.social_links && viewedProfile.social_links.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {viewedProfile.social_links.map((link, i) => (
                    <a
                      key={`${link.url}-${i}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDD6FE] bg-white px-3 py-1.5 text-xs font-semibold text-[#7C5CFC] hover:bg-[#EDE9FE]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {link.label}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#6B7280]">No links added yet.</p>
              )}
            </div>
          </div>

          {/* Courses */}
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1E1B4B]">
              <BookOpen className="h-4 w-4 text-[#7C5CFC]" />
              {viewedProfile.role === 'professor' ? 'Courses Taught' : 'Enrolled Courses'} (
              {viewedCourses.length})
            </h2>
            {viewedCourses.length === 0 ? (
              <p className="text-xs text-[#6B7280]">No active courses to show.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {viewedCourses.map((c) => (
                  <Link
                    key={c.id}
                    to={`/courses/${c.id}`}
                    className="rounded-xl border border-[#E5E7EB] p-3.5 transition hover:border-[#7C5CFC]/40 hover:bg-[#F5F3FF]/50"
                  >
                    <Badge variant="primary">{c.subject_code}</Badge>
                    <p className="mt-1.5 text-sm font-semibold text-[#1E1B4B]">{c.name}</p>
                    <p className="mt-0.5 text-xs text-[#6B7280]">
                      {c.semester} · {c.schedule}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // OWN PROFILE VIEW & EDITOR + CAMPUS PEOPLE DIRECTORY
  // =========================================================================
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#1E1B4B]">Profile & Account Settings</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Customize your profile details, live activity status, course/program, external links, and connect with professors or classmates.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Editable Profile Card */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xs lg:col-span-2">
          <div className="flex flex-col items-start gap-5 border-b border-[#E5E7EB] pb-6 sm:flex-row sm:items-center">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="h-20 w-20 rounded-2xl object-cover ring-4 ring-[#EDE9FE]"
                />
              ) : (
                <div
                  aria-label="Default profile avatar placeholder"
                  className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EDE9FE] to-[#DDD6FE] text-[#7C5CFC]"
                >
                  <UserCircle className="h-12 w-12" />
                </div>
              )}
              <ActivityStatusDot
                status={activityStatus}
                size="md"
                className="absolute -left-1 -top-1"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                aria-label="Upload profile photo"
                className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-[#7C5CFC] text-white shadow-md hover:bg-[#6A48F5] cursor-pointer"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            <div>
              <h2 className="text-base font-semibold text-[#1E1B4B]">{user?.full_name}</h2>
              <p className="text-sm text-[#6B7280]">{user?.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="primary">{user?.role ?? 'student'}</Badge>
                <ActivityStatusBadge status={activityStatus} />
                <span className="text-xs text-[#6B7280]">JPEG, PNG, GIF, WebP · Max 5 MB</span>
              </div>
              {errors.avatar && (
                <p role="alert" className="mt-1.5 text-xs text-red-600">
                  {errors.avatar}
                </p>
              )}
            </div>
          </div>

          <form onSubmit={handleSaveProfile} noValidate className="mt-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                error={errors.full_name}
                helperText={`${fullName.length}/100 characters`}
              />
              <Input
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
              />
            </div>

            {/* Activity Status Selector (Active, Idle, Do not disturb, Offline) */}
            <div>
              <label className="mb-2 block text-sm font-medium text-[#1E1B4B]">
                Activity Status
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STATUS_OPTIONS.map((st) => {
                  const meta = ACTIVITY_STATUS_META[st];
                  const selected = activityStatus === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setActivityStatus(st)}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition cursor-pointer ${
                        selected
                          ? 'border-[#7C5CFC] bg-[#EDE9FE] text-[#1E1B4B] ring-2 ring-[#7C5CFC]/25'
                          : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-gray-50'
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.dotClass}`} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Course / Program */}
            <Input
              label={user?.role === 'professor' ? 'Department / Specialization' : 'Course / Degree Program'}
              placeholder={
                user?.role === 'professor'
                  ? 'e.g. Computer Science Department'
                  : 'e.g. BS Computer Science — 3rd Year'
              }
              value={programCourse}
              onChange={(e) => setProgramCourse(e.target.value)}
              helperText="Visible to professors and classmates viewing your profile."
            />

            {/* External Links Editor */}
            <div className="space-y-3 rounded-xl border border-[#E5E7EB] bg-[#F5F3FF]/50 p-4">
              <div>
                <label className="block text-sm font-medium text-[#1E1B4B]">
                  Profile Links (GitHub, LinkedIn, Portfolio, etc.)
                </label>
                <p className="text-xs text-[#6B7280]">
                  Add external links so professors and classmates can view your projects.
                </p>
              </div>

              {socialLinks.length > 0 && (
                <ul className="space-y-2">
                  {socialLinks.map((link, idx) => (
                    <li
                      key={`${link.url}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-[#7C5CFC]" />
                        <span className="font-semibold text-[#1E1B4B]">{link.label}:</span>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-[#7C5CFC] hover:underline"
                        >
                          {link.url}
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveLink(idx)}
                        aria-label={`Remove ${link.label}`}
                        className="rounded p-1 text-[#9CA3AF] hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid gap-2 sm:grid-cols-5">
                <div className="sm:col-span-2">
                  <Input
                    placeholder="Label (e.g. GitHub)"
                    value={newLinkLabel}
                    onChange={(e) => setNewLinkLabel(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    placeholder="https://github.com/username"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                  />
                </div>
                <Button type="button" variant="secondary" onClick={handleAddLink}>
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
              {linkError && (
                <p role="alert" className="text-xs text-red-600">
                  {linkError}
                </p>
              )}
            </div>

            <div className="pt-2">
              <Button type="submit" isLoading={isSaving} size="lg">
                Save Profile Changes
              </Button>
            </div>
          </form>
        </div>

        {/* Right Column: People Directory (View Profile + Chat) & Data Privacy */}
        <div className="space-y-6">
          {/* Campus People Directory */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDE9FE] text-[#7C5CFC]">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#1E1B4B]">
                  {user?.role === 'professor' ? 'Students & Peers' : 'Professor & Classmates'}
                </h2>
                <p className="text-xs text-[#6B7280]">View profiles or start a direct chat</p>
              </div>
            </div>

            <div className="space-y-2.5">
              {peers.map((peer) => (
                <div
                  key={peer.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] p-3 transition hover:border-[#7C5CFC]/40 hover:bg-[#F5F3FF]/40"
                >
                  <Link to={`/profile/${peer.id}`} className="flex min-w-0 items-center gap-2.5">
                    <div className="relative shrink-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] text-xs font-bold text-white">
                        {peer.full_name
                          .split(' ')
                          .map((w) => w[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <ActivityStatusDot
                        status={peer.activity_status}
                        className="absolute -bottom-0.5 -right-0.5"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[#1E1B4B] hover:text-[#7C5CFC]">
                        {peer.full_name}
                      </p>
                      <p className="truncate text-[11px] text-[#6B7280]">
                        {peer.program_course || peer.role}
                      </p>
                    </div>
                  </Link>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openChatWith(peer.id)}
                    aria-label={`Chat with ${peer.full_name}`}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Chat
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Data Privacy Card (Requirement 15.5) */}
          <div className="space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDE9FE] text-[#7C5CFC]">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#1E1B4B]">Data Privacy</h2>
                <p className="text-xs text-[#6B7280]">RA 10173 Compliance</p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-[#6B7280]">
              In accordance with the Philippine Data Privacy Act of 2012, you may export a copy of
              your personal academic records or request deletion of your account at any time.
            </p>

            <div className="space-y-2.5">
              <Button variant="secondary" className="w-full" onClick={handleRequestData}>
                <Download className="h-4 w-4" />
                Request my data
              </Button>

              <Button
                variant="danger"
                className="w-full"
                onClick={() => setDeleteModalOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete my account
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm Account Deletion"
        subtitle="This action initiates permanent removal of your personal data."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" isLoading={isDeleting} onClick={handleDeleteAccount}>
              Confirm Delete Account
            </Button>
          </>
        }
      >
        <p className="text-sm text-[#6B7280]">
          Are you sure you want to delete your account (
          <strong className="text-[#1E1B4B]">{user?.email}</strong>)? Your personal data deletion
          request will be logged and processed immediately, and you will be signed out.
        </p>
      </Modal>
    </div>
  );
}
