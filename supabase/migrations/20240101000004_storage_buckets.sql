-- =============================================================================
-- LMS Platform — Private Storage Buckets and RLS Policies
-- Requirements: 15.3, 5.3, 7.4
-- =============================================================================
-- All buckets are private (public = false). Every file access requires a
-- short-lived signed URL generated server-side by the generate-signed-url
-- Edge Function or the service-role client. Direct public URL access is
-- intentionally disabled to prevent URL enumeration.
--
-- Path conventions (enforced at application layer, documented here):
--   avatars     : {userId}/avatar.{ext}
--   materials   : {courseId}/{moduleId}/{materialId}/{filename}
--   submissions : {courseId}/{activityId}/{studentId}/{submissionId}/{filename}
--   recordings  : {courseId}/{meetingId}/recording.{ext}
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Buckets
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('materials', 'materials', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('submissions', 'submissions', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. avatars bucket policies
--
-- Path: {userId}/avatar.{ext}
--   - Any authenticated user can SELECT (read) avatars so profile pictures
--     are displayable across the platform.
--   - A user can only INSERT/UPDATE objects whose path begins with their own
--     user ID, preventing overwriting another user's avatar.
-- ---------------------------------------------------------------------------

-- 2a. Authenticated users can read any avatar (for profile display)
CREATE POLICY "avatars_select_authenticated"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

-- 2b. Users can upload their own avatar (path starts with their user ID)
CREATE POLICY "avatars_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2c. Users can update (replace) their own avatar
CREATE POLICY "avatars_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 3. materials bucket policies
--
-- Path: {courseId}/{moduleId}/{materialId}/{filename}
-- The first path segment is the courseId, which links back to the courses
-- table where professor_id identifies the owner.
--
--   - Professors can INSERT/UPDATE/DELETE materials only for courses they own.
--   - Enrolled students (active enrollment) can SELECT materials.
--   - Service role bypasses RLS for signed-URL generation (Supabase default).
-- ---------------------------------------------------------------------------

-- 3a. Enrolled students can read materials
CREATE POLICY "materials_select_enrolled_student"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'materials'
    AND EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.course_id = ((storage.foldername(name))[1])::uuid
        AND e.student_id = auth.uid()
        AND e.status = 'active'
    )
  );

-- 3b. Professors can read materials for their own courses
CREATE POLICY "materials_select_professor"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'materials'
    AND EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.id = ((storage.foldername(name))[1])::uuid
        AND c.professor_id = auth.uid()
    )
  );

-- 3c. Professors can upload materials to their own courses
CREATE POLICY "materials_insert_professor"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'materials'
    AND EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.id = ((storage.foldername(name))[1])::uuid
        AND c.professor_id = auth.uid()
    )
  );

-- 3d. Professors can update (replace) materials in their own courses
CREATE POLICY "materials_update_professor"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'materials'
    AND EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.id = ((storage.foldername(name))[1])::uuid
        AND c.professor_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'materials'
    AND EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.id = ((storage.foldername(name))[1])::uuid
        AND c.professor_id = auth.uid()
    )
  );

-- 3e. Professors can delete materials from their own courses
CREATE POLICY "materials_delete_professor"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'materials'
    AND EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.id = ((storage.foldername(name))[1])::uuid
        AND c.professor_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. submissions bucket policies
--
-- Path: {courseId}/{activityId}/{studentId}/{submissionId}/{filename}
-- Segment indices (1-based via storage.foldername):
--   [1] = courseId, [2] = activityId, [3] = studentId, [4] = submissionId
--
--   - Students can INSERT objects where path segment [3] matches their user ID.
--   - Students can SELECT their own submissions (segment [3] = auth.uid()).
--   - Professors can SELECT submissions for courses they own (segment [1]).
-- ---------------------------------------------------------------------------

-- 4a. Students can upload their own submissions
CREATE POLICY "submissions_insert_own_student"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[3] = auth.uid()::text
  );

-- 4b. Students can read their own submissions
CREATE POLICY "submissions_select_own_student"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[3] = auth.uid()::text
  );

-- 4c. Professors can read submissions for courses they own
CREATE POLICY "submissions_select_professor"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'submissions'
    AND EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.id = ((storage.foldername(name))[1])::uuid
        AND c.professor_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. recordings bucket policies
--
-- Path: {courseId}/{meetingId}/recording.{ext}
--   [1] = courseId, [2] = meetingId
--
--   - INSERT is restricted to the service role only (recordings are uploaded
--     from the meeting-webhook Edge Function using the service-role client,
--     which bypasses RLS by default). No authenticated-role INSERT policy is
--     created, so ordinary users cannot upload recordings.
--   - Enrolled students and the course's professor can SELECT recordings.
-- ---------------------------------------------------------------------------

-- 5a. Enrolled students can read recordings for their courses
CREATE POLICY "recordings_select_enrolled_student"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'recordings'
    AND EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.course_id = ((storage.foldername(name))[1])::uuid
        AND e.student_id = auth.uid()
        AND e.status = 'active'
    )
  );

-- 5b. Professors can read recordings for their own courses
CREATE POLICY "recordings_select_professor"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'recordings'
    AND EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.id = ((storage.foldername(name))[1])::uuid
        AND c.professor_id = auth.uid()
    )
  );
