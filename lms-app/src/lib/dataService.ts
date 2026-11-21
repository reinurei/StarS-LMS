// Unified LMS Data Service
// Uses Supabase when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are configured,
// and falls back seamlessly to a localStorage-backed DemoDatabase for instant
// zero-config local execution.

import { logActivity } from './activityLogger';
import {
  applyManualAttendanceCorrection,
  applyModuleViewAttendance,
} from './attendance';
import { canResubmit, classifySubmission } from './classifySubmission';
import {
  createInitialDemoDb,
  type DemoDatabase,
} from './demoData';
import { generateUniqueEnrollmentCode } from './enrollmentCode';
import {
  buildCourseNotifications,
  enforceNotificationCap,
  markNotificationReadState,
} from './notifications';
import { lmsRealtimeBus } from './realtimeBus';
import { scoreQuizSubmission } from './scoreQuizSubmission';
import { getEdgeFunctionUrl, isSupabaseConfigured, supabase } from './supabaseClient';
import type {
  Activity,
  Announcement,
  AttendanceRecord,
  AttendanceStatus,
  Course,
  DirectMessage,
  Enrollment,
  ForumPost,
  ForumThread,
  Material,
  MaterialAccessLog,
  Module,
  Notification,
  Profile,
  Question,
  SocialLink,
  Submission,
  SubmissionFile,
  UserActivityStatus,
} from './types';
import {
  validateExternalUrl,
  validateGrade,
  validateMaterialUpload,
  validateSubmissionFiles,
} from './validators';

const DB_STORAGE_KEY = 'lms_demo_database_v1';

function loadDb(): DemoDatabase {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as DemoDatabase;
    }
  } catch {
    // fallback to seed
  }
  const initial = createInitialDemoDb();
  saveDb(initial);
  return initial;
}

function saveDb(db: DemoDatabase): void {
  try {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore quota errors
  }
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readFileAsDataUrl(file: File): Promise<string | null> {
  if (file.size > 2 * 1024 * 1024) return null; // avoid blowing localStorage for big files in demo mode
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function fanOutNotificationsInDb(
  db: DemoDatabase,
  courseId: string,
  type: string,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
): void {
  const newNotifs = buildCourseNotifications({
    enrollments: db.enrollments,
    courseId,
    type,
    title,
    body,
    metadata,
  });
  db.notifications = enforceNotificationCap([...newNotifs, ...db.notifications]);
  for (const n of newNotifs) {
    lmsRealtimeBus.emit(`notifications:${n.recipient_id}`, n);
  }
}

export type EnrollErrorCode =
  | 'INVALID_CODE'
  | 'EXPIRED'
  | 'CAPACITY_REACHED'
  | 'ALREADY_ENROLLED';

export class EnrollmentError extends Error {
  code: EnrollErrorCode;
  constructor(code: EnrollErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const lmsService = {
  // -------------------------------------------------------------------------
  // Profiles & Privacy (Requirements 2.1-2.6, 15.5)
  // -------------------------------------------------------------------------
  async getProfile(userId: string): Promise<Profile | null> {
    if (isSupabaseConfigured) {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      return (data as Profile | null) ?? null;
    }
    const db = loadDb();
    return db.profiles.find((p) => p.id === userId) ?? null;
  },

  async listProfiles(): Promise<Profile[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase.from('profiles').select('*');
      return (data as Profile[]) ?? [];
    }
    return loadDb().profiles;
  },

  async updateProfile(
    userId: string,
    updates: {
      full_name: string;
      email: string;
      avatar_url?: string | null;
      activity_status?: UserActivityStatus;
      program_course?: string | null;
      social_links?: SocialLink[];
    },
  ): Promise<Profile> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('profiles')
        .update({ ...updates, updated_at: now })
        .eq('id', userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logActivity({ userId, actionType: 'update', resourceType: 'profile', resourceId: userId });
      return data as Profile;
    }

    const db = loadDb();
    const idx = db.profiles.findIndex((p) => p.id === userId);
    if (idx < 0) throw new Error('Profile not found.');
    db.profiles[idx] = {
      ...db.profiles[idx],
      full_name: updates.full_name,
      email: updates.email,
      avatar_url: updates.avatar_url !== undefined ? updates.avatar_url : db.profiles[idx].avatar_url,
      activity_status:
        updates.activity_status !== undefined
          ? updates.activity_status
          : (db.profiles[idx].activity_status ?? 'active'),
      program_course:
        updates.program_course !== undefined
          ? updates.program_course
          : (db.profiles[idx].program_course ?? null),
      social_links:
        updates.social_links !== undefined
          ? updates.social_links
          : (db.profiles[idx].social_links ?? []),
      updated_at: now,
    };
    saveDb(db);
    await logActivity({ userId, actionType: 'update', resourceType: 'profile', resourceId: userId });
    return db.profiles[idx];
  },

  async uploadCourseCover(courseId: string, file: File): Promise<string> {
    if (isSupabaseConfigured) {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${courseId}/cover/banner-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('materials').upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data } = await supabase.storage.from('materials').createSignedUrl(path, 60 * 60 * 24 * 30);
      return data?.signedUrl ?? path;
    }
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) {
      throw new Error('Image is too large for local preview (please choose an image under 2 MB).');
    }
    return dataUrl;
  },

  async uploadAvatar(userId: string, file: File): Promise<string> {
    if (isSupabaseConfigured) {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${userId}/avatar.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
      return data?.signedUrl ?? path;
    }
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) throw new Error('Could not read avatar file.');
    return dataUrl;
  },

  async exportPersonalData(userId: string): Promise<Record<string, unknown>> {
    const db = loadDb();
    const profile = await this.getProfile(userId);
    return {
      exportedAt: new Date().toISOString(),
      compliance: 'Philippine Data Privacy Act of 2012 (RA 10173)',
      profile,
      enrollments: db.enrollments.filter((e) => e.student_id === userId),
      submissions: db.submissions.filter((s) => s.student_id === userId),
      attendance_records: db.attendance_records.filter((a) => a.student_id === userId),
      notifications: db.notifications.filter((n) => n.recipient_id === userId),
      forum_posts: db.forum_posts.filter((p) => p.author_id === userId),
    };
  },

  async requestAccountDeletion(userId: string): Promise<void> {
    await logActivity({
      userId,
      actionType: 'delete',
      resourceType: 'account_deletion_request',
      resourceId: userId,
    });
    if (!isSupabaseConfigured) {
      const db = loadDb();
      db.notifications = db.notifications.filter((n) => n.recipient_id !== userId);
      saveDb(db);
    }
  },

  // -------------------------------------------------------------------------
  // Courses (Requirements 3.1 – 3.9)
  // -------------------------------------------------------------------------
  async listCourses(userId: string, role: 'professor' | 'student'): Promise<Course[]> {
    if (isSupabaseConfigured) {
      if (role === 'professor') {
        const { data, error } = await supabase
          .from('courses')
          .select('*')
          .eq('professor_id', userId)
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return (data as Course[]) ?? [];
      }
      const { data, error } = await supabase
        .from('enrollments')
        .select('courses(*)')
        .eq('student_id', userId)
        .eq('status', 'active');
      if (error) throw new Error(error.message);
      return ((data ?? [])
        .map((row: { courses: Course | Course[] | null }) =>
          Array.isArray(row.courses) ? row.courses[0] : row.courses,
        )
        .filter(Boolean) as Course[]);
    }

    const db = loadDb();
    if (role === 'professor') {
      return db.courses.filter((c) => c.professor_id === userId);
    }
    const enrolledIds = new Set(
      db.enrollments
        .filter((e) => e.student_id === userId && e.status === 'active')
        .map((e) => e.course_id),
    );
    return db.courses.filter((c) => enrolledIds.has(c.id) && !c.is_archived);
  },

  async getCourseById(courseId: string): Promise<Course | null> {
    if (isSupabaseConfigured) {
      const { data } = await supabase.from('courses').select('*').eq('id', courseId).maybeSingle();
      return (data as Course | null) ?? null;
    }
    return loadDb().courses.find((c) => c.id === courseId) ?? null;
  },

  async createCourse(
    professorId: string,
    payload: {
      name: string;
      subject_code: string;
      description: string;
      schedule: string;
      semester: string;
      academic_year: string;
      max_enrollment?: number | null;
    },
  ): Promise<Course> {
    const now = new Date().toISOString();
    const db = loadDb();

    const enrollmentCode = await generateUniqueEnrollmentCode(async (code) => {
      if (isSupabaseConfigured) {
        const { data } = await supabase
          .from('courses')
          .select('id')
          .eq('enrollment_code', code)
          .maybeSingle();
        return Boolean(data);
      }
      return db.courses.some((c) => c.enrollment_code === code);
    });

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('courses')
        .insert({
          professor_id: professorId,
          ...payload,
          subject_code: payload.subject_code.toUpperCase(),
          enrollment_code: enrollmentCode,
          is_archived: false,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logActivity({
        userId: professorId,
        actionType: 'create',
        resourceType: 'course',
        resourceId: (data as Course).id,
      });
      return data as Course;
    }

    const created: Course = {
      id: uid('course'),
      professor_id: professorId,
      name: payload.name,
      subject_code: payload.subject_code.toUpperCase(),
      description: payload.description,
      schedule: payload.schedule,
      semester: payload.semester,
      academic_year: payload.academic_year,
      enrollment_code: enrollmentCode,
      enrollment_expires_at: new Date(Date.now() + 120 * 86400_000).toISOString(),
      max_enrollment: payload.max_enrollment ?? null,
      is_archived: false,
      created_at: now,
      updated_at: now,
    };
    db.courses.unshift(created);
    saveDb(db);
    await logActivity({
      userId: professorId,
      actionType: 'create',
      resourceType: 'course',
      resourceId: created.id,
    });
    return created;
  },

  async updateCourse(
    userId: string,
    courseId: string,
    updates: Partial<
      Pick<
        Course,
        | 'name'
        | 'subject_code'
        | 'description'
        | 'schedule'
        | 'semester'
        | 'academic_year'
        | 'max_enrollment'
        | 'cover_image_url'
        | 'is_archived'
      >
    >,
  ): Promise<Course> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('courses')
        .update({ ...updates, updated_at: now })
        .eq('id', courseId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logActivity({ userId, actionType: 'update', resourceType: 'course', resourceId: courseId });
      return data as Course;
    }

    const db = loadDb();
    const idx = db.courses.findIndex((c) => c.id === courseId);
    if (idx < 0) throw new Error('Course not found.');
    db.courses[idx] = { ...db.courses[idx], ...updates, updated_at: now };
    saveDb(db);
    await logActivity({ userId, actionType: 'update', resourceType: 'course', resourceId: courseId });
    return db.courses[idx];
  },

  async deleteCourse(userId: string, courseId: string): Promise<void> {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('courses').delete().eq('id', courseId);
      if (error) throw new Error(error.message);
      await logActivity({ userId, actionType: 'delete', resourceType: 'course', resourceId: courseId });
      return;
    }
    const db = loadDb();
    db.courses = db.courses.filter((c) => c.id !== courseId);
    db.enrollments = db.enrollments.filter((e) => e.course_id !== courseId);
    db.modules = db.modules.filter((m) => m.course_id !== courseId);
    db.materials = db.materials.filter((m) => m.course_id !== courseId);
    db.activities = db.activities.filter((a) => a.course_id !== courseId);
    db.attendance_records = db.attendance_records.filter((a) => a.course_id !== courseId);
    db.announcements = db.announcements.filter((a) => a.course_id !== courseId);
    db.forum_threads = db.forum_threads.filter((t) => t.course_id !== courseId);
    saveDb(db);
    await logActivity({ userId, actionType: 'delete', resourceType: 'course', resourceId: courseId });
  },

  // -------------------------------------------------------------------------
  // Enrollments & Invitations (Requirements 3.7, 4.1 – 4.7)
  // -------------------------------------------------------------------------
  async listCourseEnrollments(courseId: string): Promise<Enrollment[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('enrollments')
        .select('*, student:profiles(*)')
        .eq('course_id', courseId);
      return (data as Enrollment[]) ?? [];
    }
    const db = loadDb();
    return db.enrollments
      .filter((e) => e.course_id === courseId)
      .map((e) => ({
        ...e,
        student: db.profiles.find((p) => p.id === e.student_id),
      }));
  },

  async listStudentInvitations(studentId: string): Promise<Enrollment[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('enrollments')
        .select('*, course:courses(*)')
        .eq('student_id', studentId)
        .eq('status', 'pending');
      return (data as Enrollment[]) ?? [];
    }
    const db = loadDb();
    return db.enrollments
      .filter((e) => e.student_id === studentId && e.status === 'pending')
      .map((e) => ({
        ...e,
        course: db.courses.find((c) => c.id === e.course_id),
      }));
  },

  async enrollByCode(studentId: string, rawCode: string): Promise<{ enrollment: Enrollment; course: Course }> {
    const code = rawCode.trim().toUpperCase();

    if (isSupabaseConfigured) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(getEdgeFunctionUrl('enroll-by-code'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ enrollmentCode: code }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new EnrollmentError((json.code as EnrollErrorCode) ?? 'INVALID_CODE', json.error ?? 'Enrollment failed');
      }
      return json;
    }

    const db = loadDb();
    const course = db.courses.find((c) => c.enrollment_code.toUpperCase() === code);
    if (!course) {
      throw new EnrollmentError('INVALID_CODE', 'Enrollment code was not recognized. Please check the code and try again.');
    }
    if (
      course.is_archived ||
      (course.enrollment_expires_at && new Date(course.enrollment_expires_at) < new Date())
    ) {
      throw new EnrollmentError('EXPIRED', 'This enrollment code has expired or the course is archived.');
    }
    const existing = db.enrollments.find(
      (e) => e.course_id === course.id && e.student_id === studentId && e.status === 'active',
    );
    if (existing) {
      throw new EnrollmentError('ALREADY_ENROLLED', 'You are already enrolled in this course.');
    }
    if (course.max_enrollment) {
      const activeCount = db.enrollments.filter(
        (e) => e.course_id === course.id && e.status === 'active',
      ).length;
      if (activeCount >= course.max_enrollment) {
        throw new EnrollmentError(
          'CAPACITY_REACHED',
          'This course has reached its maximum enrollment capacity.',
        );
      }
    }

    // Activate any pending invite or create new enrollment
    const pendingIdx = db.enrollments.findIndex(
      (e) => e.course_id === course.id && e.student_id === studentId && e.status === 'pending',
    );
    const now = new Date().toISOString();
    let enrollment: Enrollment;
    if (pendingIdx >= 0) {
      db.enrollments[pendingIdx] = { ...db.enrollments[pendingIdx], status: 'active', enrolled_at: now };
      enrollment = db.enrollments[pendingIdx];
    } else {
      enrollment = {
        id: uid('enr'),
        course_id: course.id,
        student_id: studentId,
        status: 'active',
        enrolled_at: now,
        invited_at: null,
        expires_at: null,
      };
      db.enrollments.push(enrollment);
    }
    saveDb(db);
    await logActivity({
      userId: studentId,
      actionType: 'create',
      resourceType: 'enrollment',
      resourceId: enrollment.id,
      metadata: { course_id: course.id },
    });
    return { enrollment, course };
  },

  async inviteStudentByEmail(
    professorId: string,
    courseId: string,
    studentEmail: string,
  ): Promise<{ delivered: boolean; error?: string; enrollment?: Enrollment }> {
    if (isSupabaseConfigured) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(getEdgeFunctionUrl('invite-student'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ courseId, studentEmail }),
      });
      const json = await res.json();
      if (!res.ok) {
        return { delivered: false, error: json.error ?? 'Email delivery failed.' };
      }
      return { delivered: true, enrollment: json.enrollment };
    }

    const db = loadDb();
    const course = db.courses.find((c) => c.id === courseId);
    const student = db.profiles.find(
      (p) => p.email.toLowerCase() === studentEmail.trim().toLowerCase() && p.role === 'student',
    );
    if (!student || !course) {
      return {
        delivered: false,
        error: `Email delivery failed: no registered student account found for "${studentEmail}".`,
      };
    }

    const already = db.enrollments.find(
      (e) => e.course_id === courseId && e.student_id === student.id && e.status === 'active',
    );
    if (already) {
      return { delivered: false, error: `${student.full_name} is already enrolled in this course.` };
    }

    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const enrollment: Enrollment = {
      id: uid('enr'),
      course_id: courseId,
      student_id: student.id,
      status: 'pending',
      enrolled_at: null,
      invited_at: now.toISOString(),
      expires_at: expires.toISOString(),
    };
    db.enrollments.push(enrollment);
    const notif: Notification = {
      id: uid('notif'),
      recipient_id: student.id,
      type: 'course_invitation',
      title: `Course Invitation: ${course.name}`,
      body: `You have been invited to join ${course.subject_code} — ${course.name}. Accept within 7 days.`,
      metadata: { course_id: courseId, enrollment_id: enrollment.id },
      is_read: false,
      created_at: now.toISOString(),
      read_at: null,
    };
    db.notifications = enforceNotificationCap([notif, ...db.notifications]);
    saveDb(db);
    lmsRealtimeBus.emit(`notifications:${student.id}`, notif);
    await logActivity({
      userId: professorId,
      actionType: 'create',
      resourceType: 'enrollment_invitation',
      resourceId: enrollment.id,
    });
    return { delivered: true, enrollment };
  },

  async acceptInvitation(studentId: string, enrollmentId: string): Promise<Enrollment> {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (isSupabaseConfigured) {
      const { data: inv } = await supabase
        .from('enrollments')
        .select('*')
        .eq('id', enrollmentId)
        .eq('student_id', studentId)
        .single();
      if (!inv) throw new Error('Invitation not found.');
      const invitedMs = inv.invited_at ? new Date(inv.invited_at).getTime() : 0;
      if (now - invitedMs > SEVEN_DAYS_MS || (inv.expires_at && new Date(inv.expires_at).getTime() < now)) {
        await supabase.from('enrollments').update({ status: 'expired' }).eq('id', enrollmentId);
        throw new Error('This course invitation has expired (older than 7 days).');
      }
      const { data, error } = await supabase
        .from('enrollments')
        .update({ status: 'active', enrolled_at: new Date().toISOString() })
        .eq('id', enrollmentId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Enrollment;
    }

    const db = loadDb();
    const idx = db.enrollments.findIndex(
      (e) => e.id === enrollmentId && e.student_id === studentId,
    );
    if (idx < 0) throw new Error('Invitation not found.');
    const inv = db.enrollments[idx];
    const alreadyActive = db.enrollments.some(
      (e) => e.course_id === inv.course_id && e.student_id === studentId && e.status === 'active',
    );
    if (alreadyActive) {
      throw new Error('You are already enrolled in this course.');
    }
    const invitedMs = inv.invited_at ? new Date(inv.invited_at).getTime() : 0;
    if (
      now - invitedMs > SEVEN_DAYS_MS ||
      (inv.expires_at && new Date(inv.expires_at).getTime() < now)
    ) {
      db.enrollments[idx] = { ...inv, status: 'expired' };
      saveDb(db);
      throw new Error('This invitation has expired (invitations must be accepted within 7 days).');
    }

    db.enrollments[idx] = {
      ...inv,
      status: 'active',
      enrolled_at: new Date().toISOString(),
    };
    saveDb(db);
    return db.enrollments[idx];
  },

  // -------------------------------------------------------------------------
  // Modules & Learning Materials (Requirements 5.1 – 5.13, 8.1 – 8.2, 9.1 – 9.2)
  // -------------------------------------------------------------------------
  async listModules(courseId: string): Promise<Module[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('modules')
        .select('*')
        .eq('course_id', courseId)
        .order('display_order', { ascending: true });
      return (data as Module[]) ?? [];
    }
    return loadDb()
      .modules.filter((m) => m.course_id === courseId)
      .sort((a, b) => a.display_order - b.display_order);
  },

  async createModule(
    professorId: string,
    courseId: string,
    name: string,
    description?: string,
  ): Promise<Module> {
    if (isSupabaseConfigured) {
      const existing = await this.listModules(courseId);
      const { data, error } = await supabase
        .from('modules')
        .insert({ course_id: courseId, name: name.trim(), display_order: existing.length + 1 })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logActivity({ userId: professorId, actionType: 'create', resourceType: 'module', resourceId: (data as Module).id });
      return data as Module;
    }

    const db = loadDb();
    const courseModules = db.modules.filter((m) => m.course_id === courseId);
    const mod: Module = {
      id: uid('mod'),
      course_id: courseId,
      name: name.trim(),
      description: description?.trim(),
      display_order: courseModules.length + 1,
      created_at: new Date().toISOString(),
    };
    db.modules.push(mod);
    fanOutNotificationsInDb(
      db,
      courseId,
      'module_published',
      `New Module Published: ${mod.name}`,
      'A new module is available in your course. View it to record your attendance.',
      { course_id: courseId, module_id: mod.id },
    );
    saveDb(db);
    await logActivity({ userId: professorId, actionType: 'create', resourceType: 'module', resourceId: mod.id });
    return mod;
  },

  async listMaterials(courseId: string): Promise<Material[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('materials')
        .select('*')
        .eq('course_id', courseId)
        .order('uploaded_at', { ascending: false });
      return (data as Material[]) ?? [];
    }
    return loadDb()
      .materials.filter((m) => m.course_id === courseId)
      .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
  },

  async createMaterial(
    professorId: string,
    payload: {
      course_id: string;
      module_id: string;
      title: string;
      description: string;
      material_type: 'file' | 'external_url';
      file?: File;
      external_url?: string;
    },
  ): Promise<Material> {
    const now = new Date().toISOString();

    if (payload.material_type === 'external_url') {
      const urlCheck = validateExternalUrl(payload.external_url ?? '');
      if (!urlCheck.valid) throw new Error(urlCheck.error);
    } else if (payload.file) {
      const fileCheck = validateMaterialUpload(payload.file);
      if (!fileCheck.valid) throw new Error(fileCheck.error);
    } else {
      throw new Error('Please choose a file to upload.');
    }

    const materialId = uid('mat');
    let filePath: string | null = null;
    let fileDataUrl: string | null = null;

    if (payload.material_type === 'file' && payload.file) {
      filePath = `${payload.course_id}/${payload.module_id}/${materialId}/${payload.file.name}`;
      if (isSupabaseConfigured) {
        const { error: upErr } = await supabase.storage
          .from('materials')
          .upload(filePath, payload.file);
        if (upErr) throw new Error(upErr.message);
      } else {
        fileDataUrl = await readFileAsDataUrl(payload.file);
      }
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('materials')
        .insert({
          course_id: payload.course_id,
          module_id: payload.module_id,
          title: payload.title.trim(),
          description: payload.description.trim() || null,
          material_type: payload.material_type,
          file_path: filePath,
          external_url: payload.material_type === 'external_url' ? payload.external_url : null,
          mime_type: payload.file?.type ?? null,
          file_size_bytes: payload.file?.size ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logActivity({
        userId: professorId,
        actionType: 'create',
        resourceType: 'material',
        resourceId: (data as Material).id,
      });
      return data as Material;
    }

    const db = loadDb();
    const created: Material = {
      id: materialId,
      course_id: payload.course_id,
      module_id: payload.module_id,
      title: payload.title.trim(),
      description: payload.description.trim() || null,
      material_type: payload.material_type,
      file_path: filePath,
      external_url: payload.material_type === 'external_url' ? (payload.external_url ?? null) : null,
      mime_type: payload.file?.type ?? null,
      file_size_bytes: payload.file?.size ?? null,
      file_data_url: fileDataUrl,
      uploaded_at: now,
      updated_at: now,
    };
    db.materials.unshift(created);
    fanOutNotificationsInDb(
      db,
      payload.course_id,
      'material_uploaded',
      `New Material: ${created.title}`,
      created.description ?? 'A new learning resource has been added to your course.',
      { course_id: payload.course_id, module_id: payload.module_id, material_id: created.id },
    );
    saveDb(db);
    await logActivity({
      userId: professorId,
      actionType: 'create',
      resourceType: 'material',
      resourceId: created.id,
    });
    return created;
  },

  async updateMaterial(
    professorId: string,
    materialId: string,
    updates: { title: string; description: string; module_id: string; replacementFile?: File },
  ): Promise<Material> {
    const now = new Date().toISOString();
    if (updates.replacementFile) {
      const check = validateMaterialUpload(updates.replacementFile);
      if (!check.valid) throw new Error(check.error);
    }

    if (isSupabaseConfigured) {
      const { data: existing } = await supabase
        .from('materials')
        .select('*')
        .eq('id', materialId)
        .single();
      let newFilePath = existing?.file_path ?? null;
      let newMime = existing?.mime_type ?? null;
      let newSize = existing?.file_size_bytes ?? null;

      if (updates.replacementFile && existing) {
        newFilePath = `${existing.course_id}/${updates.module_id}/${materialId}/${updates.replacementFile.name}`;
        const { error: upErr } = await supabase.storage
          .from('materials')
          .upload(newFilePath, updates.replacementFile, { upsert: true });
        if (upErr) throw new Error(upErr.message);
        if (existing.file_path && existing.file_path !== newFilePath) {
          await supabase.storage.from('materials').remove([existing.file_path]);
        }
        newMime = updates.replacementFile.type;
        newSize = updates.replacementFile.size;
      }

      const { data, error } = await supabase
        .from('materials')
        .update({
          title: updates.title.trim(),
          description: updates.description.trim() || null,
          module_id: updates.module_id,
          file_path: newFilePath,
          mime_type: newMime,
          file_size_bytes: newSize,
          updated_at: now,
        })
        .eq('id', materialId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logActivity({ userId: professorId, actionType: 'update', resourceType: 'material', resourceId: materialId });
      return data as Material;
    }

    const db = loadDb();
    const idx = db.materials.findIndex((m) => m.id === materialId);
    if (idx < 0) throw new Error('Material not found.');
    const prev = db.materials[idx];
    let filePath = prev.file_path;
    let fileDataUrl = prev.file_data_url;
    let mimeType = prev.mime_type;
    let fileSize = prev.file_size_bytes;

    if (updates.replacementFile) {
      filePath = `${prev.course_id}/${updates.module_id}/${materialId}/${updates.replacementFile.name}`;
      fileDataUrl = await readFileAsDataUrl(updates.replacementFile);
      mimeType = updates.replacementFile.type;
      fileSize = updates.replacementFile.size;
    }

    db.materials[idx] = {
      ...prev,
      title: updates.title.trim(),
      description: updates.description.trim() || null,
      module_id: updates.module_id,
      file_path: filePath,
      file_data_url: fileDataUrl,
      mime_type: mimeType,
      file_size_bytes: fileSize,
      updated_at: now,
    };
    saveDb(db);
    await logActivity({ userId: professorId, actionType: 'update', resourceType: 'material', resourceId: materialId });
    return db.materials[idx];
  },

  async deleteMaterial(
    professorId: string,
    materialId: string,
    simulateStorageFailure = false,
  ): Promise<void> {
    if (isSupabaseConfigured) {
      const { data: existing } = await supabase
        .from('materials')
        .select('*')
        .eq('id', materialId)
        .single();
      if (!existing) return;

      const { error: delErr } = await supabase.from('materials').delete().eq('id', materialId);
      if (delErr) throw new Error(delErr.message);

      if (existing.file_path) {
        const { error: storageErr } = await supabase.storage
          .from('materials')
          .remove([existing.file_path]);
        if (storageErr) {
          // Requirement 5.11: restore material record on Storage delete failure
          await supabase.from('materials').insert(existing);
          throw new Error('Failed to delete file from storage; material record has been restored.');
        }
      }
      await logActivity({ userId: professorId, actionType: 'delete', resourceType: 'material', resourceId: materialId });
      return;
    }

    const db = loadDb();
    const existing = db.materials.find((m) => m.id === materialId);
    if (!existing) return;
    const backup = [...db.materials];
    db.materials = db.materials.filter((m) => m.id !== materialId);
    saveDb(db);

    if (simulateStorageFailure) {
      // Requirement 5.11 rollback
      db.materials = backup;
      saveDb(db);
      throw new Error('Storage service failed to delete the associated file. Material record restored.');
    }

    await logActivity({ userId: professorId, actionType: 'delete', resourceType: 'material', resourceId: materialId });
  },

  async recordMaterialAccess(
    studentId: string,
    materialId: string,
  ): Promise<MaterialAccessLog> {
    const now = new Date().toISOString();
    await logActivity({
      userId: studentId,
      actionType: 'download',
      resourceType: 'material',
      resourceId: materialId,
    });

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('material_access_logs')
        .insert({ material_id: materialId, student_id: studentId, accessed_at: now })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as MaterialAccessLog;
    }

    const db = loadDb();
    const student = db.profiles.find((p) => p.id === studentId);
    const log: MaterialAccessLog = {
      id: uid('mal'),
      material_id: materialId,
      student_id: studentId,
      student_name: student?.full_name ?? 'Student',
      student_email: student?.email ?? '',
      accessed_at: now,
    };
    db.material_access_logs.unshift(log);
    saveDb(db);
    return log;
  },

  async listMaterialAccessLogs(materialId: string): Promise<MaterialAccessLog[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('material_access_logs')
        .select('*, student:profiles(full_name, email)')
        .eq('material_id', materialId)
        .order('accessed_at', { ascending: false });
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        material_id: String(row.material_id),
        student_id: String(row.student_id),
        student_name: (row.student as { full_name?: string } | null)?.full_name,
        student_email: (row.student as { email?: string } | null)?.email,
        accessed_at: String(row.accessed_at),
      }));
    }
    return loadDb()
      .material_access_logs.filter((l) => l.material_id === materialId)
      .sort((a, b) => new Date(b.accessed_at).getTime() - new Date(a.accessed_at).getTime());
  },

  async getSignedDownloadUrl(bucket: 'materials' | 'submissions' | 'avatars', objectPath: string): Promise<string> {
    if (isSupabaseConfigured) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(getEdgeFunctionUrl('generate-signed-url'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ bucket, objectPath, expiresIn: 3600 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to get signed URL');
      return json.signedUrl as string;
    }
    // Demo mode synthetic downloadable blob URL
    const blob = new Blob(
      [`StarS LMS File Preview\nBucket: ${bucket}\nObject Path: ${objectPath}\nGenerated: ${new Date().toISOString()}\n`],
      { type: 'text/plain;charset=utf-8' },
    );
    return URL.createObjectURL(blob);
  },

  // -------------------------------------------------------------------------
  // Attendance (Requirements 8.1 – 8.6, 9.1 – 9.3, 10.1 – 10.2)
  // -------------------------------------------------------------------------
  async recordModuleViewAttendance(
    courseId: string,
    moduleId: string,
    studentId: string,
  ): Promise<AttendanceRecord> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('record_module_view_attendance', {
        p_course_id: courseId,
        p_module_id: moduleId,
      });
      if (error) throw new Error(error.message);
      return data as AttendanceRecord;
    }

    const db = loadDb();
    const enrollment = db.enrollments.find(
      (e) => e.course_id === courseId && e.student_id === studentId,
    );
    const result = applyModuleViewAttendance({
      existingRecords: db.attendance_records,
      courseId,
      moduleId,
      studentId,
      enrollmentStatus: enrollment?.status ?? null,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    db.attendance_records = result.records;
    saveDb(db);
    return result.record;
  },

  async listCourseAttendance(courseId: string): Promise<AttendanceRecord[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('course_id', courseId);
      return (data as AttendanceRecord[]) ?? [];
    }
    return loadDb().attendance_records.filter((r) => r.course_id === courseId);
  },

  async listStudentAttendance(studentId: string): Promise<AttendanceRecord[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('student_id', studentId);
      return (data as AttendanceRecord[]) ?? [];
    }
    return loadDb().attendance_records.filter((r) => r.student_id === studentId);
  },

  async correctAttendanceRecord(params: {
    courseId: string;
    moduleId: string;
    studentId: string;
    status: AttendanceStatus;
    professorId: string;
  }): Promise<AttendanceRecord> {
    if (isSupabaseConfigured) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('attendance_records')
        .upsert(
          {
            course_id: params.courseId,
            module_id: params.moduleId,
            student_id: params.studentId,
            status: params.status,
            manually_corrected: true,
            corrected_by: params.professorId,
            corrected_at: now,
          },
          { onConflict: 'module_id,student_id' },
        )
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logActivity({
        userId: params.professorId,
        actionType: 'update',
        resourceType: 'attendance_record',
        resourceId: (data as AttendanceRecord).id,
      });
      return data as AttendanceRecord;
    }

    const db = loadDb();
    const idx = db.attendance_records.findIndex(
      (r) => r.module_id === params.moduleId && r.student_id === params.studentId,
    );
    const res = applyManualAttendanceCorrection({
      record: idx >= 0 ? db.attendance_records[idx] : null,
      courseId: params.courseId,
      moduleId: params.moduleId,
      studentId: params.studentId,
      newStatus: params.status,
      professorId: params.professorId,
    });
    if (!res.ok) throw new Error(res.error);
    if (idx >= 0) {
      db.attendance_records[idx] = res.record;
    } else {
      db.attendance_records.push(res.record);
    }
    saveDb(db);
    await logActivity({
      userId: params.professorId,
      actionType: 'update',
      resourceType: 'attendance_record',
      resourceId: res.record.id,
      metadata: { status: params.status },
    });
    return res.record;
  },

  // -------------------------------------------------------------------------
  // Activities, Quizzes & Submissions (Requirements 6, 7, 17)
  // -------------------------------------------------------------------------
  async listActivities(courseId?: string): Promise<Activity[]> {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('activities')
        .select('*, questions(*, options:question_options(*))')
        .order('deadline', { ascending: true });
      if (courseId) query = query.eq('course_id', courseId);
      const { data } = await query;
      return ((data as Activity[]) ?? []).map((a) => ({
        ...a,
        max_score: a.max_score ?? 100,
        reference_material_ids: a.reference_material_ids ?? [],
      }));
    }
    const db = loadDb();
    const list = courseId
      ? db.activities.filter((a) => a.course_id === courseId)
      : db.activities;
    return [...list].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  },

  async getActivityById(activityId: string): Promise<Activity | null> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('activities')
        .select('*, questions(*, options:question_options(*))')
        .eq('id', activityId)
        .maybeSingle();
      return (data as Activity | null) ?? null;
    }
    return loadDb().activities.find((a) => a.id === activityId) ?? null;
  },

  async createActivity(
    professorId: string,
    payload: Omit<Activity, 'id' | 'created_at' | 'updated_at'> & { questions?: Question[] },
  ): Promise<Activity> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured) {
      const { questions, reference_material_ids, ...actCols } = payload;
      const { data, error } = await supabase
        .from('activities')
        .insert(actCols)
        .select()
        .single();
      if (error) throw new Error(error.message);
      const createdAct = data as Activity;
      if (reference_material_ids?.length) {
        await supabase.from('activity_materials').insert(
          reference_material_ids.map((mid) => ({ activity_id: createdAct.id, material_id: mid })),
        );
      }
      if (questions?.length) {
        for (const q of questions) {
          const { data: qRow } = await supabase
            .from('questions')
            .insert({
              activity_id: createdAct.id,
              question_text: q.question_text,
              display_order: q.display_order,
              correct_answer: q.correct_answer,
            })
            .select()
            .single();
          if (qRow && q.options.length) {
            await supabase.from('question_options').insert(
              q.options.map((opt, idx) => ({
                question_id: qRow.id,
                option_text: opt.option_text,
                is_correct: opt.is_correct,
                display_order: idx + 1,
              })),
            );
          }
        }
      }
      await logActivity({
        userId: professorId,
        actionType: 'create',
        resourceType: 'activity',
        resourceId: createdAct.id,
      });
      return createdAct;
    }

    const db = loadDb();
    const actId = uid('act');
    const created: Activity = {
      ...payload,
      id: actId,
      questions: payload.questions?.map((q, idx) => ({
        ...q,
        id: q.id || uid('q'),
        activity_id: actId,
        display_order: idx + 1,
        created_at: now,
      })),
      created_at: now,
      updated_at: now,
    };
    db.activities.unshift(created);
    fanOutNotificationsInDb(
      db,
      payload.course_id,
      'activity_created',
      `New Activity: ${created.title}`,
      `Due ${new Date(created.deadline).toLocaleString()}`,
      { course_id: payload.course_id, activity_id: created.id },
    );
    saveDb(db);
    await logActivity({
      userId: professorId,
      actionType: 'create',
      resourceType: 'activity',
      resourceId: created.id,
    });
    return created;
  },

  async listSubmissions(filter?: { activityId?: string; studentId?: string }): Promise<Submission[]> {
    if (isSupabaseConfigured) {
      let query = supabase.from('submissions').select('*, files:submission_files(*)');
      if (filter?.activityId) query = query.eq('activity_id', filter.activityId);
      if (filter?.studentId) query = query.eq('student_id', filter.studentId);
      const { data } = await query;
      return (data as Submission[]) ?? [];
    }
    const db = loadDb();
    return db.submissions.filter(
      (s) =>
        (!filter?.activityId || s.activity_id === filter.activityId) &&
        (!filter?.studentId || s.student_id === filter.studentId),
    );
  },

  async submitActivity(params: {
    activity: Activity;
    studentId: string;
    files: File[];
    textAnswer?: string;
  }): Promise<Submission> {
    const fileValidation = validateSubmissionFiles(params.files);
    if (!fileValidation.valid) {
      throw new Error(fileValidation.error);
    }

    const now = new Date();
    const existingList = await this.listSubmissions({
      activityId: params.activity.id,
      studentId: params.studentId,
    });
    const existing = existingList[0] ?? null;

    if (existing) {
      const check = canResubmit({
        hasExistingSubmission: true,
        allowResubmission: params.activity.allow_resubmission,
        resubmissionCount: existing.resubmission_count,
        maxResubmissions: params.activity.max_resubmissions,
        deadline: params.activity.deadline,
        now,
      });
      if (!check.allowed) {
        throw new Error(check.reason ?? 'Resubmission not allowed.');
      }
    }

    const status =
      classifySubmission({
        submittedAt: now,
        deadline: params.activity.deadline,
        now,
      }) === 'late'
        ? 'late'
        : 'submitted';

    const subId = existing?.id ?? uid('sub');
    const uploadedFiles: SubmissionFile[] = [];

    for (const file of params.files) {
      const filePath = `${params.activity.course_id}/${params.activity.id}/${params.studentId}/${subId}/${file.name}`;
      let dataUrl: string | null = null;
      if (isSupabaseConfigured) {
        const { error } = await supabase.storage.from('submissions').upload(filePath, file, { upsert: true });
        if (error) throw new Error(error.message);
      } else {
        dataUrl = await readFileAsDataUrl(file);
      }
      uploadedFiles.push({
        id: uid('sf'),
        submission_id: subId,
        file_path: filePath,
        original_filename: file.name,
        file_size_bytes: file.size,
        file_data_url: dataUrl,
        uploaded_at: now.toISOString(),
      });
    }

    if (isSupabaseConfigured) {
      const payload = {
        activity_id: params.activity.id,
        student_id: params.studentId,
        status,
        resubmission_count: existing ? existing.resubmission_count + 1 : 0,
        text_answer: params.textAnswer ?? null,
        submitted_at: now.toISOString(),
      };
      const { data, error } = existing
        ? await supabase.from('submissions').update(payload).eq('id', existing.id).select().single()
        : await supabase.from('submissions').insert(payload).select().single();
      if (error) throw new Error(error.message);
      if (uploadedFiles.length) {
        await supabase.from('submission_files').insert(
          uploadedFiles.map((f) => ({
            submission_id: (data as Submission).id,
            file_path: f.file_path,
            original_filename: f.original_filename,
            file_size_bytes: f.file_size_bytes,
          })),
        );
      }
      await logActivity({
        userId: params.studentId,
        actionType: existing ? 'update' : 'create',
        resourceType: 'submission',
        resourceId: (data as Submission).id,
      });
      return { ...(data as Submission), files: uploadedFiles };
    }

    const db = loadDb();
    const record: Submission = {
      id: subId,
      activity_id: params.activity.id,
      student_id: params.studentId,
      status,
      resubmission_count: existing ? existing.resubmission_count + 1 : 0,
      text_answer: params.textAnswer ?? null,
      quiz_answers: null,
      grade: existing?.grade ?? null,
      max_score: params.activity.max_score ?? 100,
      feedback: existing?.feedback ?? null,
      started_at: existing?.started_at ?? now.toISOString(),
      submitted_at: now.toISOString(),
      graded_at: existing?.graded_at ?? null,
      timed_out_at: null,
      files: uploadedFiles.length > 0 ? uploadedFiles : existing?.files ?? [],
    };
    const idx = db.submissions.findIndex((s) => s.id === subId);
    if (idx >= 0) db.submissions[idx] = record;
    else db.submissions.unshift(record);
    saveDb(db);
    await logActivity({
      userId: params.studentId,
      actionType: existing ? 'update' : 'create',
      resourceType: 'submission',
      resourceId: record.id,
    });
    return record;
  },

  async submitQuiz(params: {
    activity: Activity;
    studentId: string;
    answers: Record<string, string>;
    startedAt: string;
    timedOut: boolean;
  }): Promise<Submission> {
    const now = new Date();
    const questions = params.activity.questions ?? [];
    const pairs = questions.map((q) => ({
      questionId: q.id,
      studentAnswer: params.answers[q.id] ?? '',
      correctAnswer: q.correct_answer,
    }));
    const scored = scoreQuizSubmission(pairs);
    const isLate = now.getTime() > new Date(params.activity.deadline).getTime();

    const status: Submission['status'] = params.timedOut
      ? 'timed_out'
      : isLate
        ? 'late'
        : 'graded';

    const db = loadDb();
    const record: Submission = {
      id: uid('sub'),
      activity_id: params.activity.id,
      student_id: params.studentId,
      status,
      resubmission_count: 0,
      text_answer: null,
      quiz_answers: params.answers,
      grade: scored.percentage,
      max_score: 100,
      feedback: `Auto-graded: ${scored.correctCount} of ${scored.totalQuestions} correct (${scored.percentage}%).${params.timedOut ? ' Submitted automatically upon time limit expiry.' : ''}`,
      started_at: params.startedAt,
      submitted_at: now.toISOString(),
      graded_at: now.toISOString(),
      timed_out_at: params.timedOut ? now.toISOString() : null,
      files: [],
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('submissions')
        .insert({
          activity_id: record.activity_id,
          student_id: record.student_id,
          status: record.status,
          quiz_answers: record.quiz_answers,
          grade: record.grade,
          feedback: record.feedback,
          started_at: record.started_at,
          submitted_at: record.submitted_at,
          graded_at: record.graded_at,
          timed_out_at: record.timed_out_at,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logActivity({
        userId: params.studentId,
        actionType: 'create',
        resourceType: 'quiz_submission',
        resourceId: (data as Submission).id,
      });
      return { ...(data as Submission), files: [] };
    }

    // Replace any prior attempt for this student/quiz
    db.submissions = db.submissions.filter(
      (s) => !(s.activity_id === params.activity.id && s.student_id === params.studentId),
    );
    db.submissions.unshift(record);
    saveDb(db);
    await logActivity({
      userId: params.studentId,
      actionType: 'create',
      resourceType: 'quiz_submission',
      resourceId: record.id,
    });
    return record;
  },

  async gradeSubmission(params: {
    professorId: string;
    submissionId: string;
    grade: number;
    feedback: string;
  }): Promise<Submission> {
    const check = validateGrade(params.grade);
    if (!check.valid) throw new Error(check.error);

    const now = new Date().toISOString();
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('submissions')
        .update({
          grade: params.grade,
          feedback: params.feedback,
          status: 'graded',
          graded_at: now,
        })
        .eq('id', params.submissionId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logActivity({
        userId: params.professorId,
        actionType: 'update',
        resourceType: 'submission_grade',
        resourceId: params.submissionId,
      });
      return data as Submission;
    }

    const db = loadDb();
    const idx = db.submissions.findIndex((s) => s.id === params.submissionId);
    if (idx < 0) throw new Error('Submission not found.');
    const sub = db.submissions[idx];
    const act = db.activities.find((a) => a.id === sub.activity_id);
    db.submissions[idx] = {
      ...sub,
      grade: params.grade,
      feedback: params.feedback,
      status: 'graded',
      graded_at: now,
    };

    // Requirement 11.4: notify student when grade is released
    const notif: Notification = {
      id: uid('notif'),
      recipient_id: sub.student_id,
      type: 'grade_released',
      title: `Grade Released: ${act?.title ?? 'Activity'}`,
      body: `You scored ${params.grade} / ${sub.max_score || 100}.${params.feedback ? ` Feedback: ${params.feedback.slice(0, 100)}` : ''}`,
      metadata: { activity_id: sub.activity_id, submission_id: sub.id, grade: params.grade },
      is_read: false,
      created_at: now,
      read_at: null,
    };
    db.notifications = enforceNotificationCap([notif, ...db.notifications]);
    saveDb(db);
    lmsRealtimeBus.emit(`notifications:${sub.student_id}`, notif);
    await logActivity({
      userId: params.professorId,
      actionType: 'update',
      resourceType: 'submission_grade',
      resourceId: sub.id,
      metadata: { grade: params.grade },
    });
    return db.submissions[idx];
  },

  async logSubmissionDownload(professorId: string, submissionId: string, filePath: string): Promise<string> {
    await logActivity({
      userId: professorId,
      actionType: 'download',
      resourceType: 'submission',
      resourceId: submissionId,
      metadata: { file_path: filePath },
    });
    return this.getSignedDownloadUrl('submissions', filePath);
  },

  // -------------------------------------------------------------------------
  // Notifications & Announcements (Requirements 11.1 – 11.7)
  // -------------------------------------------------------------------------
  async listNotifications(userId: string): Promise<Notification[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      return (data as Notification[]) ?? [];
    }
    return loadDb()
      .notifications.filter((n) => n.recipient_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 100);
  },

  async markNotificationRead(userId: string, notificationId: string): Promise<number> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured) {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: now })
        .eq('id', notificationId)
        .eq('recipient_id', userId);
      const list = await this.listNotifications(userId);
      return list.filter((n) => !n.is_read).length;
    }

    const db = loadDb();
    const res = markNotificationReadState(db.notifications, notificationId, now);
    db.notifications = res.notifications;
    saveDb(db);
    return db.notifications.filter((n) => n.recipient_id === userId && !n.is_read).length;
  },

  async markAllNotificationsRead(userId: string): Promise<void> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured) {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: now })
        .eq('recipient_id', userId)
        .eq('is_read', false);
      return;
    }
    const db = loadDb();
    db.notifications = db.notifications.map((n) =>
      n.recipient_id === userId && !n.is_read ? { ...n, is_read: true, read_at: now } : n,
    );
    saveDb(db);
  },

  async listAnnouncements(courseId?: string): Promise<Announcement[]> {
    if (isSupabaseConfigured) {
      let query = supabase.from('announcements').select('*').order('created_at', { ascending: false });
      if (courseId) query = query.eq('course_id', courseId);
      const { data } = await query;
      return (data as Announcement[]) ?? [];
    }
    const db = loadDb();
    const list = courseId
      ? db.announcements.filter((a) => a.course_id === courseId)
      : db.announcements;
    return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async createAnnouncement(
    professorId: string,
    courseId: string,
    title: string,
    body: string,
  ): Promise<Announcement> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('announcements')
        .insert({ course_id: courseId, professor_id: professorId, title: title.trim(), body: body.trim() })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logActivity({
        userId: professorId,
        actionType: 'create',
        resourceType: 'announcement',
        resourceId: (data as Announcement).id,
      });
      return data as Announcement;
    }

    const db = loadDb();
    const ann: Announcement = {
      id: uid('ann'),
      course_id: courseId,
      professor_id: professorId,
      title: title.trim(),
      body: body.trim(),
      created_at: now,
    };
    db.announcements.unshift(ann);
    fanOutNotificationsInDb(
      db,
      courseId,
      'announcement_posted',
      `Announcement: ${ann.title}`,
      ann.body.slice(0, 180),
      { course_id: courseId, announcement_id: ann.id },
    );
    saveDb(db);
    await logActivity({
      userId: professorId,
      actionType: 'create',
      resourceType: 'announcement',
      resourceId: ann.id,
    });
    return ann;
  },

  // -------------------------------------------------------------------------
  // Discussion Forums (Requirements 16.1 – 16.6)
  // -------------------------------------------------------------------------
  async listForumThreads(courseId: string): Promise<ForumThread[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('forum_threads')
        .select('*, author:profiles(full_name, role)')
        .eq('course_id', courseId)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });
      return (data ?? []).map((t: Record<string, unknown>) => ({
        ...(t as unknown as ForumThread),
        author_name: (t.author as { full_name?: string } | null)?.full_name,
        author_role: (t.author as { role?: 'professor' | 'student' } | null)?.role,
      }));
    }
    const db = loadDb();
    return db.forum_threads
      .filter((t) => t.course_id === courseId)
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  },

  async listForumPosts(threadId: string): Promise<ForumPost[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('forum_posts')
        .select('*, author:profiles(full_name, role)')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });
      return (data ?? []).map((p: Record<string, unknown>) => ({
        ...(p as unknown as ForumPost),
        author_name: (p.author as { full_name?: string } | null)?.full_name,
        author_role: (p.author as { role?: 'professor' | 'student' } | null)?.role,
      }));
    }
    return loadDb()
      .forum_posts.filter((p) => p.thread_id === threadId && !p.is_deleted)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  },

  async createForumThread(params: {
    courseId: string;
    authorId: string;
    authorName: string;
    authorRole: 'professor' | 'student';
    title: string;
    content: string;
  }): Promise<ForumThread> {
    const now = new Date().toISOString();
    if (isSupabaseConfigured) {
      const { data: t, error } = await supabase
        .from('forum_threads')
        .insert({ course_id: params.courseId, author_id: params.authorId, title: params.title.trim() })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await supabase.from('forum_posts').insert({
        thread_id: t.id,
        author_id: params.authorId,
        content: params.content,
      });
      return t as ForumThread;
    }

    const db = loadDb();
    const thread: ForumThread = {
      id: uid('thread'),
      course_id: params.courseId,
      author_id: params.authorId,
      author_name: params.authorName,
      author_role: params.authorRole,
      title: params.title.trim(),
      is_locked: false,
      is_pinned: false,
      created_at: now,
      updated_at: now,
    };
    const post: ForumPost = {
      id: uid('post'),
      thread_id: thread.id,
      author_id: params.authorId,
      author_name: params.authorName,
      author_role: params.authorRole,
      content: params.content,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    };
    db.forum_threads.unshift(thread);
    db.forum_posts.push(post);
    saveDb(db);
    lmsRealtimeBus.emit(`forum:${params.courseId}`, { type: 'thread_created', thread });
    return thread;
  },

  async createForumPost(params: {
    courseId: string;
    threadId: string;
    authorId: string;
    authorName: string;
    authorRole: 'professor' | 'student';
    content: string;
  }): Promise<ForumPost> {
    if (params.content.trim().length === 0) {
      throw new Error('Post cannot be blank.');
    }
    if (params.content.length > 10_000) {
      throw new Error('Post cannot exceed 10,000 characters.');
    }

    const now = new Date().toISOString();
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('forum_posts')
        .insert({ thread_id: params.threadId, author_id: params.authorId, content: params.content })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as ForumPost;
    }

    const db = loadDb();
    const thread = db.forum_threads.find((t) => t.id === params.threadId);
    if (!thread) throw new Error('Thread not found.');
    if (thread.is_locked) throw new Error('This thread is locked and cannot accept new replies.');

    const post: ForumPost = {
      id: uid('post'),
      thread_id: params.threadId,
      author_id: params.authorId,
      author_name: params.authorName,
      author_role: params.authorRole,
      content: params.content,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    };
    db.forum_posts.push(post);
    thread.updated_at = now;
    saveDb(db);
    lmsRealtimeBus.emit(`forum:${params.courseId}`, { type: 'post_created', post });
    return post;
  },

  async moderateThread(
    courseId: string,
    threadId: string,
    action: { is_locked?: boolean; is_pinned?: boolean; delete?: boolean },
  ): Promise<void> {
    if (isSupabaseConfigured) {
      if (action.delete) {
        await supabase.from('forum_threads').delete().eq('id', threadId);
      } else {
        await supabase.from('forum_threads').update(action).eq('id', threadId);
      }
      return;
    }
    const db = loadDb();
    if (action.delete) {
      db.forum_threads = db.forum_threads.filter((t) => t.id !== threadId);
      db.forum_posts = db.forum_posts.filter((p) => p.thread_id !== threadId);
    } else {
      const idx = db.forum_threads.findIndex((t) => t.id === threadId);
      if (idx >= 0) {
        db.forum_threads[idx] = {
          ...db.forum_threads[idx],
          ...(action.is_locked !== undefined ? { is_locked: action.is_locked } : {}),
          ...(action.is_pinned !== undefined ? { is_pinned: action.is_pinned } : {}),
          updated_at: new Date().toISOString(),
        };
      }
    }
    saveDb(db);
    lmsRealtimeBus.emit(`forum:${courseId}`, { type: 'thread_moderated', threadId, action });
  },

  async deleteForumPost(courseId: string, postId: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.from('forum_posts').update({ is_deleted: true }).eq('id', postId);
      return;
    }
    const db = loadDb();
    const idx = db.forum_posts.findIndex((p) => p.id === postId);
    if (idx >= 0) {
      db.forum_posts[idx].is_deleted = true;
    }
    saveDb(db);
    lmsRealtimeBus.emit(`forum:${courseId}`, { type: 'post_deleted', postId });
  },

  // -------------------------------------------------------------------------
  // Direct Messaging & AI Updates Assistant
  // -------------------------------------------------------------------------
  async listDirectMessages(userId: string, peerId?: string): Promise<DirectMessage[]> {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('direct_messages')
        .select('*')
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order('created_at', { ascending: true });
      const { data } = await query;
      const all = (data as DirectMessage[]) ?? [];
      if (!peerId) return all;
      return all.filter(
        (m) =>
          (m.sender_id === userId && m.recipient_id === peerId) ||
          (m.sender_id === peerId && m.recipient_id === userId),
      );
    }

    const db = loadDb();
    const list = db.direct_messages ?? [];
    return list
      .filter((m) => {
        if (peerId) {
          return (
            (m.sender_id === userId && m.recipient_id === peerId) ||
            (m.sender_id === peerId && m.recipient_id === userId)
          );
        }
        return m.sender_id === userId || m.recipient_id === userId;
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  },

  async sendDirectMessage(
    senderId: string,
    recipientId: string,
    content: string,
  ): Promise<DirectMessage> {
    const trimmed = content.trim();
    if (!trimmed) throw new Error('Message cannot be empty.');
    if (trimmed.length > 5000) throw new Error('Message exceeds 5,000 characters.');

    const now = new Date().toISOString();
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('direct_messages')
        .insert({ sender_id: senderId, recipient_id: recipientId, content: trimmed })
        .select()
        .single();
      if (error) throw new Error(error.message);
      lmsRealtimeBus.emit(`dm:${recipientId}`, data);
      lmsRealtimeBus.emit(`dm:${senderId}`, data);
      return data as DirectMessage;
    }

    const db = loadDb();
    if (!db.direct_messages) db.direct_messages = [];
    const msg: DirectMessage = {
      id: uid('dm'),
      sender_id: senderId,
      recipient_id: recipientId,
      content: trimmed,
      is_read: false,
      created_at: now,
    };
    db.direct_messages.push(msg);

    const sender = db.profiles.find((p) => p.id === senderId);
    const notif: Notification = {
      id: uid('notif'),
      recipient_id: recipientId,
      type: 'direct_message',
      title: `New message from ${sender?.full_name ?? 'User'}`,
      body: trimmed.slice(0, 140),
      metadata: { sender_id: senderId },
      is_read: false,
      created_at: now,
      read_at: null,
    };
    db.notifications = enforceNotificationCap([notif, ...db.notifications]);
    saveDb(db);
    lmsRealtimeBus.emit(`dm:${recipientId}`, msg);
    lmsRealtimeBus.emit(`dm:${senderId}`, msg);
    lmsRealtimeBus.emit(`notifications:${recipientId}`, notif);
    return msg;
  },

  async askAiAssistant(
    userId: string,
    role: 'professor' | 'student',
    prompt: string,
  ): Promise<string> {
    const q = prompt.trim().toLowerCase();
    const [courses, notifs, allAnns, allActs, mySubs, myAtts] = await Promise.all([
      this.listCourses(userId, role),
      this.listNotifications(userId),
      this.listAnnouncements(),
      this.listActivities(),
      role === 'student' ? this.listSubmissions({ studentId: userId }) : this.listSubmissions(),
      role === 'student' ? this.listStudentAttendance(userId) : Promise.resolve([]),
    ]);

    const activeCourses = courses.filter((c) => !c.is_archived);
    const courseIds = new Set(activeCourses.map((c) => c.id));
    const myAnns = allAnns.filter((a) => courseIds.has(a.course_id));
    const myActs = allActs.filter((a) => courseIds.has(a.course_id));
    const unreadNotifs = notifs.filter((n) => !n.is_read);

    if (q.includes('update') || q.includes('new') || q.includes('announcement') || q.includes('news')) {
      const lines: string[] = [];
      lines.push(`You have ${unreadNotifs.length} unread notification(s) and ${myAnns.length} recent announcement(s).`);
      if (myAnns.length > 0) {
        lines.push('\nLatest Announcements:');
        for (const a of myAnns.slice(0, 3)) {
          const c = activeCourses.find((x) => x.id === a.course_id);
          lines.push(`• [${c?.subject_code ?? 'Course'}] ${a.title} — ${a.body.slice(0, 90)}${a.body.length > 90 ? '…' : ''}`);
        }
      }
      if (unreadNotifs.length > 0) {
        lines.push('\nRecent Unread Alerts:');
        for (const n of unreadNotifs.slice(0, 3)) {
          lines.push(`• ${n.title}`);
        }
      }
      return lines.join('\n');
    }

    if (q.includes('deadline') || q.includes('due') || q.includes('activity') || q.includes('quiz') || q.includes('assignment')) {
      const nowMs = Date.now();
      const upcoming = myActs.filter((a) => new Date(a.deadline).getTime() >= nowMs);
      if (upcoming.length === 0) {
        return 'You have no upcoming activity deadlines right now! Great job staying ahead.';
      }
      const lines = [`You have ${upcoming.length} upcoming activity/quiz deadline(s):`];
      for (const a of upcoming.slice(0, 4)) {
        const c = activeCourses.find((x) => x.id === a.course_id);
        const sub = mySubs.find((s) => s.activity_id === a.id && s.student_id === userId);
        const tag = sub ? ' (Submitted)' : ' (Not submitted yet)';
        lines.push(`• [${c?.subject_code ?? ''}] ${a.title} — due ${new Date(a.deadline).toLocaleString()}${role === 'student' ? tag : ''}`);
      }
      return lines.join('\n');
    }

    if (q.includes('attendance') || q.includes('module')) {
      if (role === 'student') {
        const lines = ['Here is your module attendance summary:'];
        for (const c of activeCourses) {
          const mods = await this.listModules(c.id);
          const viewed = myAtts.filter(
            (a) => a.course_id === c.id && (a.status === 'present' || a.status === 'excused'),
          ).length;
          const pct = mods.length === 0 ? 0 : Math.round((viewed / mods.length) * 100);
          lines.push(`• ${c.subject_code} (${c.name}): ${viewed}/${mods.length} modules viewed (${pct}%)`);
        }
        lines.push('\nTip: Opening any unviewed course module automatically records your attendance as Present!');
        return lines.join('\n');
      }
      return `You are teaching ${activeCourses.length} active course(s). Open the Attendance or Analytics & Reports tab to inspect module-by-module attendance and export CSV/Excel reports.`;
    }

    if (q.includes('grade') || q.includes('score')) {
      if (role === 'student') {
        const graded = mySubs.filter((s) => s.grade !== null);
        if (graded.length === 0) {
          return 'None of your submissions have released grades yet. Check back soon or open the Grades tab!';
        }
        const lines = [`You have ${graded.length} graded submission(s):`];
        for (const s of graded.slice(0, 5)) {
          const act = myActs.find((a) => a.id === s.activity_id);
          lines.push(`• ${act?.title ?? 'Activity'}: ${s.grade} / ${s.max_score || 100}`);
        }
        return lines.join('\n');
      }
      const ungraded = mySubs.filter((s) => s.grade === null).length;
      return `There are currently ${ungraded} submission(s) waiting for grading across your courses.`;
    }

    if (q.includes('schedule') || q.includes('week') || q.includes('class')) {
      const lines = [`Your weekly schedule covers ${activeCourses.length} active course(s):`];
      for (const c of activeCourses) {
        lines.push(`• ${c.subject_code} — ${c.name}: ${c.schedule}`);
      }
      lines.push('\nOpen Academic Calendar → Weekly Course Schedule tab to see your full visual timetable.');
      return lines.join('\n');
    }

    return [
      `Hi! I'm your StarS AI Study Assistant ✨`,
      `Currently tracking ${activeCourses.length} active course(s), ${myActs.length} activities, and ${unreadNotifs.length} unread update(s).`,
      `\nAsk me about:`,
      `• "What are the latest updates?"`,
      `• "What deadlines are coming up?"`,
      `• "How is my attendance?"`,
      `• "Show my grades" or "What is my weekly schedule?"`,
      `\nYou can also switch to the Messages tab above to chat directly with classmates or your professor!`,
    ].join('\n');
  },
};
