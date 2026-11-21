-- Migration: Row Level Security Policies
-- Requirements: 15.1, 15.2
-- Enables RLS on every table in the public schema and creates all representative
-- access policies for professors, students, and service-role-only tables.

-- ============================================================
-- HELPER: a reusable subquery that checks active enrollment
-- ============================================================
-- Used inline in many policies to avoid repeating the JOIN pattern.
-- Postgres does not support CREATE FUNCTION inside a transaction block that
-- also contains DDL on those tables, so we define it here once.

CREATE OR REPLACE FUNCTION public.is_enrolled(p_course_id uuid, p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM enrollments
    WHERE course_id  = p_course_id
      AND student_id = p_student_id
      AND status     = 'active'
  );
$$;

-- ============================================================
-- ENABLE RLS
-- ============================================================

ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_access_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_materials     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_threads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- profiles
-- ============================================================

CREATE POLICY "user_reads_own_profile"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "user_updates_own_profile"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid());

-- ============================================================
-- courses
-- ============================================================

-- Professors can fully manage their own courses (SELECT/INSERT/UPDATE/DELETE).
CREATE POLICY "professor_owns_course"
  ON public.courses
  USING (professor_id = auth.uid());

-- Students can SELECT courses they are actively enrolled in.
CREATE POLICY "student_enrolled_course"
  ON public.courses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.enrollments
      WHERE enrollments.course_id  = courses.id
        AND enrollments.student_id = auth.uid()
        AND enrollments.status     = 'active'
    )
  );

-- ============================================================
-- enrollments
-- ============================================================

-- Professors can SELECT enrollments for courses they own.
CREATE POLICY "professor_reads_course_enrollments"
  ON public.enrollments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.courses
      WHERE courses.id           = enrollments.course_id
        AND courses.professor_id = auth.uid()
    )
  );

-- Students can SELECT their own enrollment records.
CREATE POLICY "student_reads_own_enrollment"
  ON public.enrollments
  FOR SELECT
  USING (student_id = auth.uid());

-- Students can INSERT an enrollment (self-enrollment via enrollment code).
CREATE POLICY "student_inserts_own_enrollment"
  ON public.enrollments
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- ============================================================
-- modules
-- ============================================================

-- Professors can fully manage modules in their own courses.
CREATE POLICY "professor_manages_modules"
  ON public.modules
  USING (
    EXISTS (
      SELECT 1
      FROM public.courses
      WHERE courses.id           = modules.course_id
        AND courses.professor_id = auth.uid()
    )
  );

-- Students can SELECT modules in courses they are actively enrolled in.
CREATE POLICY "student_reads_enrolled_modules"
  ON public.modules
  FOR SELECT
  USING (public.is_enrolled(modules.course_id, auth.uid()));

-- ============================================================
-- materials
-- ============================================================

-- Professors can fully manage materials in their own courses.
CREATE POLICY "professor_manages_materials"
  ON public.materials
  USING (
    EXISTS (
      SELECT 1
      FROM public.modules  m
      JOIN public.courses  c ON c.id = m.course_id
      WHERE m.id           = materials.module_id
        AND c.professor_id = auth.uid()
    )
  );

-- Students can SELECT materials in courses they are actively enrolled in.
CREATE POLICY "student_reads_enrolled_materials"
  ON public.materials
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.modules m
      WHERE m.id = materials.module_id
        AND public.is_enrolled(m.course_id, auth.uid())
    )
  );

-- ============================================================
-- material_access_logs
-- ============================================================

-- Students can INSERT their own access log entries.
CREATE POLICY "student_inserts_own_access_log"
  ON public.material_access_logs
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- Professors can SELECT access logs for materials in their own courses.
CREATE POLICY "professor_reads_access_logs"
  ON public.material_access_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.materials mat
      JOIN public.modules   m   ON m.id  = mat.module_id
      JOIN public.courses   c   ON c.id  = m.course_id
      WHERE mat.id          = material_access_logs.material_id
        AND c.professor_id  = auth.uid()
    )
  );

-- ============================================================
-- activities
-- ============================================================

-- Professors can fully manage activities in their own courses.
CREATE POLICY "professor_manages_activities"
  ON public.activities
  USING (
    EXISTS (
      SELECT 1
      FROM public.courses
      WHERE courses.id           = activities.course_id
        AND courses.professor_id = auth.uid()
    )
  );

-- Students can SELECT activities in courses they are actively enrolled in.
CREATE POLICY "student_reads_enrolled_activities"
  ON public.activities
  FOR SELECT
  USING (public.is_enrolled(activities.course_id, auth.uid()));

-- ============================================================
-- activity_materials
-- ============================================================

-- Professors can fully manage activity_materials links in their own courses.
CREATE POLICY "professor_manages_activity_materials"
  ON public.activity_materials
  USING (
    EXISTS (
      SELECT 1
      FROM public.activities a
      JOIN public.courses    c ON c.id = a.course_id
      WHERE a.id             = activity_materials.activity_id
        AND c.professor_id   = auth.uid()
    )
  );

-- Students can SELECT activity_materials links for enrolled courses.
CREATE POLICY "student_reads_enrolled_activity_materials"
  ON public.activity_materials
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.activities a
      WHERE a.id = activity_materials.activity_id
        AND public.is_enrolled(a.course_id, auth.uid())
    )
  );

-- ============================================================
-- questions
-- ============================================================

-- Professors can fully manage questions for activities in their own courses.
CREATE POLICY "professor_manages_questions"
  ON public.questions
  USING (
    EXISTS (
      SELECT 1
      FROM public.activities a
      JOIN public.courses    c ON c.id = a.course_id
      WHERE a.id             = questions.activity_id
        AND c.professor_id   = auth.uid()
    )
  );

-- Students can SELECT questions for activities in enrolled courses.
CREATE POLICY "student_reads_enrolled_questions"
  ON public.questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.activities a
      WHERE a.id = questions.activity_id
        AND public.is_enrolled(a.course_id, auth.uid())
    )
  );

-- ============================================================
-- question_options
-- ============================================================

-- Professors can fully manage question options for their own courses.
CREATE POLICY "professor_manages_question_options"
  ON public.question_options
  USING (
    EXISTS (
      SELECT 1
      FROM public.questions  q
      JOIN public.activities a ON a.id = q.activity_id
      JOIN public.courses    c ON c.id = a.course_id
      WHERE q.id             = question_options.question_id
        AND c.professor_id   = auth.uid()
    )
  );

-- Students can SELECT question options for enrolled courses.
CREATE POLICY "student_reads_enrolled_question_options"
  ON public.question_options
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.questions  q
      JOIN public.activities a ON a.id = q.activity_id
      WHERE q.id = question_options.question_id
        AND public.is_enrolled(a.course_id, auth.uid())
    )
  );

-- ============================================================
-- submissions
-- ============================================================

-- Students can SELECT / INSERT / UPDATE their own submissions.
CREATE POLICY "student_owns_submission"
  ON public.submissions
  USING (student_id = auth.uid());

-- Professors can SELECT and UPDATE (grade) submissions for activities in their own courses.
CREATE POLICY "professor_reads_course_submissions"
  ON public.submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.activities a
      JOIN public.courses    c ON c.id = a.course_id
      WHERE a.id             = submissions.activity_id
        AND c.professor_id   = auth.uid()
    )
  );

CREATE POLICY "professor_grades_course_submissions"
  ON public.submissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.activities a
      JOIN public.courses    c ON c.id = a.course_id
      WHERE a.id             = submissions.activity_id
        AND c.professor_id   = auth.uid()
    )
  );

-- ============================================================
-- submission_files
-- ============================================================

-- Students can SELECT / INSERT / UPDATE files for their own submissions.
CREATE POLICY "student_owns_submission_files"
  ON public.submission_files
  USING (
    EXISTS (
      SELECT 1
      FROM public.submissions s
      WHERE s.id         = submission_files.submission_id
        AND s.student_id = auth.uid()
    )
  );

-- Professors can SELECT submission files for activities in their own courses.
CREATE POLICY "professor_reads_course_submission_files"
  ON public.submission_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.submissions s
      JOIN public.activities  a ON a.id = s.activity_id
      JOIN public.courses     c ON c.id = a.course_id
      WHERE s.id             = submission_files.submission_id
        AND c.professor_id   = auth.uid()
    )
  );

-- ============================================================
-- attendance_records (Module-view automated attendance)
-- ============================================================

-- Professors can SELECT, INSERT, and UPDATE attendance records for their own courses.
CREATE POLICY "professor_manages_attendance"
  ON public.attendance_records
  USING (
    EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.id           = attendance_records.course_id
        AND c.professor_id = auth.uid()
    )
  );

-- Enrolled students can SELECT their own attendance records.
CREATE POLICY "student_reads_own_attendance"
  ON public.attendance_records
  FOR SELECT
  USING (student_id = auth.uid());

-- Enrolled students can INSERT/UPDATE their own module view attendance record.
CREATE POLICY "student_records_own_module_attendance"
  ON public.attendance_records
  FOR INSERT
  WITH CHECK (
    student_id = auth.uid()
    AND public.is_enrolled(attendance_records.course_id, auth.uid())
  );

CREATE POLICY "student_updates_own_module_last_viewed"
  ON public.attendance_records
  FOR UPDATE
  USING (
    student_id = auth.uid()
    AND public.is_enrolled(attendance_records.course_id, auth.uid())
  );

-- ============================================================
-- notifications
-- ============================================================

-- Users can SELECT and UPDATE (mark read) their own notifications.
CREATE POLICY "user_owns_notification"
  ON public.notifications
  USING (recipient_id = auth.uid());

-- ============================================================
-- announcements
-- ============================================================

-- Professors can fully manage announcements in their own courses.
CREATE POLICY "professor_manages_announcements"
  ON public.announcements
  USING (
    EXISTS (
      SELECT 1
      FROM public.courses
      WHERE courses.id           = announcements.course_id
        AND courses.professor_id = auth.uid()
    )
  );

-- Students can SELECT announcements for courses they are actively enrolled in.
CREATE POLICY "student_reads_enrolled_announcements"
  ON public.announcements
  FOR SELECT
  USING (public.is_enrolled(announcements.course_id, auth.uid()));

-- ============================================================
-- forum_threads
-- ============================================================

-- Enrolled students can SELECT and INSERT threads in their enrolled courses.
CREATE POLICY "student_reads_enrolled_forum_threads"
  ON public.forum_threads
  FOR SELECT
  USING (public.is_enrolled(forum_threads.course_id, auth.uid()));

CREATE POLICY "student_inserts_forum_thread"
  ON public.forum_threads
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_enrolled(forum_threads.course_id, auth.uid())
  );

-- Professors can SELECT, INSERT, and UPDATE (lock / pin / delete) threads
-- in their own courses.
CREATE POLICY "professor_manages_forum_threads"
  ON public.forum_threads
  USING (
    EXISTS (
      SELECT 1
      FROM public.courses
      WHERE courses.id           = forum_threads.course_id
        AND courses.professor_id = auth.uid()
    )
  );

-- ============================================================
-- forum_posts
-- ============================================================

-- Enrolled students and the course professor can SELECT posts.
CREATE POLICY "enrolled_user_reads_forum_posts"
  ON public.forum_posts
  FOR SELECT
  USING (
    -- enrolled student
    EXISTS (
      SELECT 1
      FROM public.forum_threads ft
      WHERE ft.id = forum_posts.thread_id
        AND public.is_enrolled(ft.course_id, auth.uid())
    )
    OR
    -- course professor
    EXISTS (
      SELECT 1
      FROM public.forum_threads ft
      JOIN public.courses        c ON c.id = ft.course_id
      WHERE ft.id          = forum_posts.thread_id
        AND c.professor_id = auth.uid()
    )
  );

-- Enrolled students and the course professor can INSERT posts.
CREATE POLICY "enrolled_user_inserts_forum_post"
  ON public.forum_posts
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND (
      -- enrolled student
      EXISTS (
        SELECT 1
        FROM public.forum_threads ft
        WHERE ft.id = forum_posts.thread_id
          AND public.is_enrolled(ft.course_id, auth.uid())
      )
      OR
      -- course professor
      EXISTS (
        SELECT 1
        FROM public.forum_threads ft
        JOIN public.courses        c ON c.id = ft.course_id
        WHERE ft.id          = forum_posts.thread_id
          AND c.professor_id = auth.uid()
      )
    )
  );

-- Professors can UPDATE (edit / moderate) any post in their own courses.
CREATE POLICY "professor_updates_forum_posts"
  ON public.forum_posts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.forum_threads ft
      JOIN public.courses        c ON c.id = ft.course_id
      WHERE ft.id          = forum_posts.thread_id
        AND c.professor_id = auth.uid()
    )
  );

-- Authors can UPDATE their own posts.
CREATE POLICY "author_updates_own_post"
  ON public.forum_posts
  FOR UPDATE
  USING (author_id = auth.uid());

-- ============================================================
-- activity_logs
-- ============================================================

-- Authenticated users can INSERT activity log entries for their own actions.
CREATE POLICY "authenticated_inserts_own_activity_log"
  ON public.activity_logs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- SELECT is restricted to the service role only (no authenticated user policy).
-- Service role bypasses RLS by default in Supabase.
