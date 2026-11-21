-- =============================================================================
-- LMS Platform — Course Cover Images, Extended Profiles, and Direct Messaging
-- =============================================================================

-- 1. Course cover picture URL
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS cover_image_url text;

-- 2. Extended student/professor profile fields (activity status, course/program, external links)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activity_status text NOT NULL DEFAULT 'active'
    CHECK (activity_status IN ('active', 'idle', 'dnd', 'offline')),
  ADD COLUMN IF NOT EXISTS program_course text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Allow authenticated users in shared courses to read classmate/professor profiles
CREATE POLICY "authenticated_reads_course_peers_profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Direct messages between students and professors
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  content      text NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 5000),
  is_read      bool NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants_read_direct_messages"
  ON public.direct_messages
  FOR SELECT
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "sender_inserts_direct_messages"
  ON public.direct_messages
  FOR INSERT
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "recipient_marks_direct_messages_read"
  ON public.direct_messages
  FOR UPDATE
  USING (recipient_id = auth.uid());
