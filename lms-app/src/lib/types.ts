export type UserRole = 'professor' | 'student';

export type EnrollmentStatus = 'active' | 'pending' | 'expired';

export type ActivityType =
  | 'assignment'
  | 'quiz'
  | 'exam'
  | 'essay'
  | 'short_answer'
  | 'multiple_choice'
  | 'file_submission'
  | 'group_project';

export type SubmissionStatus =
  | 'upcoming'
  | 'submitted'
  | 'late'
  | 'graded'
  | 'missing'
  | 'timed_out'
  | 'pending';

export type AttendanceStatus = 'present' | 'absent' | 'excused';

export type UserActivityStatus = 'active' | 'idle' | 'dnd' | 'offline';

export interface SocialLink {
  label: string;
  url: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  activity_status?: UserActivityStatus;
  program_course?: string | null;
  social_links?: SocialLink[];
  created_at: string;
  updated_at: string;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

export interface Course {
  id: string;
  professor_id: string;
  name: string;
  subject_code: string;
  description: string;
  schedule: string;
  semester: string;
  academic_year: string;
  enrollment_code: string;
  enrollment_expires_at: string | null;
  max_enrollment: number | null;
  cover_image_url?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  course_id: string;
  student_id: string;
  status: EnrollmentStatus;
  enrolled_at: string | null;
  invited_at: string | null;
  expires_at: string | null;
  student?: Profile;
  course?: Course;
}

export interface Module {
  id: string;
  course_id: string;
  name: string;
  description?: string;
  display_order: number;
  created_at: string;
}

export interface Material {
  id: string;
  module_id: string | null;
  course_id: string;
  title: string;
  description: string | null;
  material_type: 'file' | 'external_url';
  file_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  file_data_url?: string | null;
  uploaded_at: string;
  updated_at: string;
}

export interface MaterialAccessLog {
  id: string;
  material_id: string;
  student_id: string;
  student_name?: string;
  student_email?: string;
  accessed_at: string;
}

export interface QuestionOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  display_order: number;
}

export interface Question {
  id: string;
  activity_id: string;
  question_text: string;
  question_type?: 'multiple_choice' | 'short_answer';
  display_order: number;
  correct_answer: string;
  options: QuestionOption[];
  created_at: string;
}

export interface Activity {
  id: string;
  course_id: string;
  title: string;
  activity_type: ActivityType;
  instructions: string;
  deadline: string;
  allow_resubmission: boolean;
  max_resubmissions: number;
  time_limit_minutes: number | null;
  randomize_questions: boolean;
  max_score: number;
  reference_material_ids: string[];
  questions?: Question[];
  created_at: string;
  updated_at: string;
}

export interface SubmissionFile {
  id: string;
  submission_id: string;
  file_path: string;
  original_filename: string;
  file_size_bytes: number;
  file_data_url?: string | null;
  uploaded_at: string;
}

export interface Submission {
  id: string;
  activity_id: string;
  student_id: string;
  status: 'submitted' | 'late' | 'graded' | 'missing' | 'timed_out';
  resubmission_count: number;
  text_answer: string | null;
  quiz_answers: Record<string, string> | null;
  grade: number | null;
  max_score: number;
  feedback: string | null;
  started_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  timed_out_at: string | null;
  files: SubmissionFile[];
}

export interface AttendanceRecord {
  id: string;
  course_id: string;
  module_id: string;
  student_id: string;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  status: AttendanceStatus;
  manually_corrected: boolean;
  corrected_by: string | null;
  corrected_at: string | null;
}

export interface Notification {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface Announcement {
  id: string;
  course_id: string;
  professor_id: string;
  title: string;
  body: string;
  created_at: string;
}

export interface ForumThread {
  id: string;
  course_id: string;
  author_id: string;
  author_name?: string;
  author_role?: UserRole;
  title: string;
  is_locked: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ForumPost {
  id: string;
  thread_id: string;
  author_id: string;
  author_name?: string;
  author_role?: UserRole;
  content: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action_type: 'create' | 'update' | 'delete' | 'download';
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
