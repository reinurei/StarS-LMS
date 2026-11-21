-- =============================================================================
-- LMS Platform — Initial Schema Migration
-- Requirements: 3.1, 4.1, 6.1, 7.1, 8.1, 10.1, 11.7
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extension
-- ---------------------------------------------------------------------------
-- Native PostgreSQL gen_random_uuid() is used across all tables (no extension schema issues on Supabase Cloud).

-- ---------------------------------------------------------------------------
-- profiles
-- Mirrors auth.users; created by trigger on signup.
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     text NOT NULL,
    email         text NOT NULL,
    role          text NOT NULL CHECK (role IN ('professor', 'student')),
    avatar_url    text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
CREATE TABLE courses (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    professor_id     uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
    name             text NOT NULL,
    subject_code     text NOT NULL,
    description      text,
    schedule         text,
    semester         text,
    academic_year    text,
    enrollment_code        text NOT NULL UNIQUE,
    enrollment_expires_at  timestamptz,
    max_enrollment         int,
    is_archived            bool NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- enrollments
-- ---------------------------------------------------------------------------
CREATE TABLE enrollments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id   uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    student_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
    status      text NOT NULL CHECK (status IN ('active', 'pending', 'expired')),
    enrolled_at timestamptz,
    invited_at  timestamptz,
    expires_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- modules
-- ---------------------------------------------------------------------------
CREATE TABLE modules (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id     uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    name          text NOT NULL,
    display_order int NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- materials
-- ---------------------------------------------------------------------------
CREATE TABLE materials (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id        uuid REFERENCES modules (id) ON DELETE SET NULL,
    course_id        uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    title            text NOT NULL,
    description      text,
    material_type    text,
    file_path        text,
    external_url     text,
    mime_type        text,
    file_size_bytes  bigint,
    uploaded_at      timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- material_access_logs
-- ---------------------------------------------------------------------------
CREATE TABLE material_access_logs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id  uuid NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
    student_id   uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
    accessed_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------
CREATE TABLE activities (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id             uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    title                 text NOT NULL,
    activity_type         text NOT NULL CHECK (activity_type IN (
                              'assignment', 'quiz', 'exam', 'essay',
                              'short_answer', 'multiple_choice',
                              'file_submission', 'group_project'
                          )),
    instructions          text,
    deadline              timestamptz,
    allow_resubmission    bool NOT NULL DEFAULT false,
    max_resubmissions     int NOT NULL DEFAULT 0,
    time_limit_minutes    int,
    randomize_questions   bool NOT NULL DEFAULT false,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- activity_materials  (join table)
-- ---------------------------------------------------------------------------
CREATE TABLE activity_materials (
    activity_id  uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    material_id  uuid NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
    PRIMARY KEY (activity_id, material_id)
);

-- ---------------------------------------------------------------------------
-- questions
-- ---------------------------------------------------------------------------
CREATE TABLE questions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id    uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    question_text  text NOT NULL,
    display_order  int NOT NULL DEFAULT 0,
    correct_answer text,
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- question_options
-- ---------------------------------------------------------------------------
CREATE TABLE question_options (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id   uuid NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
    option_text   text NOT NULL,
    is_correct    bool NOT NULL DEFAULT false,
    display_order int NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- submissions
-- ---------------------------------------------------------------------------
CREATE TABLE submissions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id        uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    student_id         uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
    status             text NOT NULL CHECK (status IN (
                           'submitted', 'late', 'graded', 'missing', 'timed_out'
                       )),
    resubmission_count int NOT NULL DEFAULT 0,
    text_answer        text,
    quiz_answers       jsonb,
    grade              numeric CHECK (grade IS NULL OR (grade >= 0 AND grade <= 100)),
    max_score          numeric NOT NULL DEFAULT 100,
    feedback           text,
    started_at         timestamptz,
    submitted_at       timestamptz,
    graded_at          timestamptz,
    timed_out_at       timestamptz
);

-- ---------------------------------------------------------------------------
-- submission_files
-- ---------------------------------------------------------------------------
CREATE TABLE submission_files (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id     uuid NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
    file_path         text NOT NULL,
    original_filename text NOT NULL,
    file_size_bytes   bigint,
    uploaded_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- attendance_records
-- Automatically recorded when an enrolled student views a course module.
-- Keyed uniquely by (module_id, student_id).
-- ---------------------------------------------------------------------------
CREATE TABLE attendance_records (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id           uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    module_id           uuid NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
    student_id          uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
    first_viewed_at     timestamptz,
    last_viewed_at      timestamptz,
    status              text NOT NULL DEFAULT 'present' CHECK (status IN (
                            'present', 'absent', 'excused'
                        )),
    manually_corrected  bool NOT NULL DEFAULT false,
    corrected_by        uuid REFERENCES profiles (id) ON DELETE SET NULL,
    corrected_at        timestamptz,
    UNIQUE (module_id, student_id)
);

-- ---------------------------------------------------------------------------
-- notifications
-- Requirement 11.7: capped at 100 per user; oldest deleted on overflow.
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
    type          text NOT NULL,
    title         text NOT NULL,
    body          text NOT NULL,
    metadata      jsonb,
    is_read       bool NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    read_at       timestamptz
);

-- Trigger function: enforce 100-notification cap per user (delete oldest first)
CREATE OR REPLACE FUNCTION fn_cap_notifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM notifications
    WHERE id IN (
        SELECT id
        FROM   notifications
        WHERE  recipient_id = NEW.recipient_id
        ORDER  BY created_at ASC
        LIMIT  GREATEST(
                   (SELECT COUNT(*) FROM notifications WHERE recipient_id = NEW.recipient_id) - 99,
                   0
               )
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cap_notifications
BEFORE INSERT ON notifications
FOR EACH ROW
EXECUTE FUNCTION fn_cap_notifications();

-- ---------------------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------------------
CREATE TABLE announcements (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id     uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    professor_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
    title         text NOT NULL,
    body          text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- forum_threads
-- ---------------------------------------------------------------------------
CREATE TABLE forum_threads (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id  uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    author_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
    title      text NOT NULL,
    is_locked  bool NOT NULL DEFAULT false,
    is_pinned  bool NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- forum_posts
-- ---------------------------------------------------------------------------
CREATE TABLE forum_posts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id  uuid NOT NULL REFERENCES forum_threads (id) ON DELETE CASCADE,
    author_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
    content    text NOT NULL,
    is_deleted bool NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- activity_logs
-- ---------------------------------------------------------------------------
CREATE TABLE activity_logs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
    action_type   text NOT NULL,
    resource_type text NOT NULL,
    resource_id   uuid,
    metadata      jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);
