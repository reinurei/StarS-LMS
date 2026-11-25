import { z } from 'zod';
import type { ActivityType, AttendanceStatus } from './types';

// ---------------------------------------------------------------------------
// Auth schemas (Requirements 1.1 – 1.4)
// ---------------------------------------------------------------------------
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const signUpSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Full name must be 100 characters or fewer'),
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
    role: z.enum(['student', 'professor']),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password cannot exceed 72 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    facultyPasscode: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type SignUpFormValues = z.infer<typeof signUpSchema>;

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
});
export type PasswordResetRequestValues = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type PasswordResetConfirmValues = z.infer<typeof passwordResetConfirmSchema>;

// ---------------------------------------------------------------------------
// Profile schemas & avatar validation (Requirements 2.1 – 2.6)
// ---------------------------------------------------------------------------
export const ALLOWED_AVATAR_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, 'Full name is required')
    .max(100, 'Full name must be 100 characters or fewer'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address (local-part@domain)'),
});
export type ProfileFormValues = z.infer<typeof profileSchema>;

export interface FileLike {
  name?: string;
  type: string;
  size: number;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateAvatarFile(file: FileLike): FileValidationResult {
  if (!(ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid image format. Allowed formats: JPEG, PNG, GIF, WebP (max 5 MB).',
    };
  }
  if (file.size <= 0 || file.size > MAX_AVATAR_SIZE_BYTES) {
    return {
      valid: false,
      error: 'Profile photo exceeds the 5 MB maximum size limit (allowed: JPEG, PNG, GIF, WebP).',
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Course schema (Requirements 3.1, 3.8)
// ---------------------------------------------------------------------------
export const courseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Course name is required')
    .max(150, 'Course name must be 150 characters or fewer'),
  subject_code: z
    .string()
    .trim()
    .min(3, 'Subject code must be 3–10 alphanumeric characters')
    .max(10, 'Subject code must be 3–10 alphanumeric characters')
    .regex(/^[A-Za-z0-9]+$/, 'Subject code must contain only letters and numbers'),
  description: z
    .string()
    .trim()
    .min(1, 'Description is required')
    .max(1000, 'Description must be 1000 characters or fewer'),
  schedule: z.string().trim().min(1, 'Schedule is required'),
  semester: z.string().trim().min(1, 'Semester is required'),
  academic_year: z.string().trim().min(1, 'Academic year is required'),
  max_enrollment: z
    .union([z.number().int().positive('Capacity must be a positive number'), z.null()])
    .optional(),
});
export type CourseFormValues = z.infer<typeof courseSchema>;

// ---------------------------------------------------------------------------
// Material & Submission File Upload Validators (Requirements 5.1, 5.2, 7.4, 7.5; Property 11)
// ---------------------------------------------------------------------------
export const ALLOWED_MATERIAL_MIME_TYPES: ReadonlySet<string> = new Set([
  // PPT, PPTX
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // PDF
  'application/pdf',
  // DOC, DOCX
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // XLS, XLSX
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // JPEG, PNG, GIF, WebP
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // MP4, MOV
  'video/mp4',
  'video/quicktime',
  // MP3, WAV, AAC, OGG, FLAC
  'audio/mpeg',
  'audio/wav',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
]);

export const MAX_MATERIAL_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

export const ALLOWED_SUBMISSION_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'application/zip',
  'application/x-zip-compressed',
]);

export const MAX_SUBMISSION_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_SUBMISSION_FILES = 10;

export function validateMaterialUpload(file: FileLike): FileValidationResult {
  if (!ALLOWED_MATERIAL_MIME_TYPES.has(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type (${file.type || 'unknown'}). Allowed: PPT, PPTX, PDF, DOC, DOCX, XLS, XLSX, JPEG, PNG, GIF, WebP, MP4, MOV, MP3, WAV, AAC, OGG, FLAC.`,
    };
  }
  if (file.size < 0 || file.size > MAX_MATERIAL_SIZE_BYTES) {
    return {
      valid: false,
      error: 'File size exceeds the 500 MB maximum per file.',
    };
  }
  return { valid: true };
}

export function validateSubmissionFiles(files: FileLike[]): FileValidationResult {
  if (files.length > MAX_SUBMISSION_FILES) {
    return {
      valid: false,
      error: `Too many files (${files.length}). Maximum is ${MAX_SUBMISSION_FILES} files per submission.`,
    };
  }

  let totalBytes = 0;
  for (const file of files) {
    if (!ALLOWED_SUBMISSION_MIME_TYPES.has(file.type)) {
      return {
        valid: false,
        error: `Unsupported file type (${file.type || file.name || 'unknown'}). Allowed: PDF, DOC, DOCX, JPEG, PNG, ZIP.`,
      };
    }
    if (file.size < 0) {
      return { valid: false, error: 'Invalid file size.' };
    }
    totalBytes += file.size;
  }

  if (totalBytes > MAX_SUBMISSION_TOTAL_BYTES) {
    return {
      valid: false,
      error: 'Total submission size exceeds the 100 MB limit.',
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// External URL Validator (Requirements 5.5, 5.6; Property 12)
// ---------------------------------------------------------------------------
// RFC 3986 safe character check (no spaces or control chars) + http:// or https:// prefix
const RFC3986_INVALID_CHARS = /[\s<>"{}|\\^`]/;

export function validateExternalUrl(url: string): FileValidationResult {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required and must start with http:// or https://.' };
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { valid: false, error: 'URL must begin with http:// or https://.' };
  }
  if (RFC3986_INVALID_CHARS.test(url)) {
    return { valid: false, error: 'URL contains invalid RFC 3986 characters.' };
  }
  try {
    const parsed = new URL(url);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
      return { valid: false, error: 'URL must have a valid hostname.' };
    }
    // Hostname must not contain invalid characters or start/end with dot/hyphen
    if (!/^[a-zA-Z0-9.-]+$|^\[[0-9a-fA-F:]+\]$/.test(parsed.hostname)) {
      return { valid: false, error: 'URL hostname is not valid RFC 3986 syntax.' };
    }
    if (parsed.hostname.startsWith('.') || parsed.hostname.endsWith('.')) {
      return { valid: false, error: 'URL hostname is malformed.' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'URL does not conform to valid RFC 3986 syntax.' };
  }
}

// ---------------------------------------------------------------------------
// Activity & Quiz Schemas (Requirements 6.1 – 6.5, 6.9, 17.1; Property 10)
// ---------------------------------------------------------------------------
export const ACTIVITY_TYPES: readonly ActivityType[] = [
  'assignment',
  'quiz',
  'exam',
  'essay',
  'short_answer',
  'multiple_choice',
  'file_submission',
  'group_project',
] as const;

export function createActivitySchema(now: Date = new Date()) {
  return z.object({
    title: z
      .string()
      .trim()
      .min(1, 'Activity title is required')
      .max(200, 'Title must be 200 characters or fewer'),
    activity_type: z.enum([
      'assignment',
      'quiz',
      'exam',
      'essay',
      'short_answer',
      'multiple_choice',
      'file_submission',
      'group_project',
    ]),
    instructions: z
      .string()
      .trim()
      .min(1, 'Instructions are required')
      .max(5000, 'Instructions must be 5000 characters or fewer'),
    deadline: z
      .string()
      .min(1, 'Deadline is required')
      .refine((val) => {
        const d = new Date(val);
        return !Number.isNaN(d.getTime()) && d.getTime() > now.getTime();
      }, 'Deadline must be in the future'),
    allow_resubmission: z.boolean().default(false),
    max_resubmissions: z.number().int().min(0).max(10).default(0),
    time_limit_minutes: z
      .union([z.number().int().min(1, 'Min 1 minute').max(300, 'Max 300 minutes'), z.null()])
      .optional(),
    randomize_questions: z.boolean().default(false),
    max_score: z.number().min(1).max(1000).default(100),
  });
}

export const activitySchema = createActivitySchema();

export const gradeSchema = z.object({
  grade: z
    .number({ message: 'Grade must be a number' })
    .refine((n) => Number.isFinite(n), 'Grade must be a finite number')
    .min(0, 'Grade must be at least 0')
    .max(100, 'Grade must be at most 100'),
  feedback: z.string().max(5000, 'Feedback is too long').optional().default(''),
});

export function validateGrade(value: unknown): { valid: boolean; error?: string } {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return { valid: false, error: 'Grade must be a numeric value between 0 and 100.' };
  }
  if (value < 0 || value > 100) {
    return { valid: false, error: 'Grade must be between 0 and 100 inclusive.' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Attendance Correction Validator (Requirement 8.4; Property 9)
// ---------------------------------------------------------------------------
export const VALID_ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  'present',
  'absent',
  'excused',
] as const;

export const attendanceCorrectionSchema = z.enum(['present', 'absent', 'excused']);

export function validateAttendanceStatus(status: unknown): status is AttendanceStatus {
  return (
    typeof status === 'string' &&
    (VALID_ATTENDANCE_STATUSES as readonly string[]).includes(status)
  );
}

// ---------------------------------------------------------------------------
// Forum Post Validator (Requirements 16.3, 16.6)
// ---------------------------------------------------------------------------
export const MAX_FORUM_POST_LENGTH = 10_000;

export const forumPostSchema = z.object({
  content: z
    .string()
    .refine((val) => val.trim().length > 0, 'Post cannot be blank.')
    .refine(
      (val) => val.length <= MAX_FORUM_POST_LENGTH,
      `Post cannot exceed ${MAX_FORUM_POST_LENGTH.toLocaleString()} characters.`,
    ),
});

export const forumThreadSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Thread title is required')
    .max(200, 'Thread title must be 200 characters or fewer'),
  content: z
    .string()
    .refine((val) => val.trim().length > 0, 'Initial post cannot be blank.')
    .refine(
      (val) => val.length <= MAX_FORUM_POST_LENGTH,
      `Post cannot exceed ${MAX_FORUM_POST_LENGTH.toLocaleString()} characters.`,
    ),
});
