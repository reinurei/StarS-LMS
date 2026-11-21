-- =============================================================================
-- LMS Platform — Server-Side Notification Fan-Out Triggers & Deadline Reminders
-- Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.7
-- =============================================================================

-- Helper: fan out a notification to all actively enrolled students in a course
CREATE OR REPLACE FUNCTION public.notify_enrolled_students(
    p_course_id uuid,
    p_type      text,
    p_title     text,
    p_body      text,
    p_metadata  jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.notifications (recipient_id, type, title, body, metadata)
    SELECT e.student_id, p_type, p_title, p_body, p_metadata
    FROM   public.enrollments e
    WHERE  e.course_id = p_course_id
      AND  e.status    = 'active';
END;
$$;

-- 1. Trigger on new material upload (Req 11.1)
CREATE OR REPLACE FUNCTION public.fn_notify_material_uploaded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.notify_enrolled_students(
        NEW.course_id,
        'material_uploaded',
        'New Material: ' || NEW.title,
        COALESCE(NEW.description, 'A new learning material has been uploaded to your course.'),
        jsonb_build_object('course_id', NEW.course_id, 'module_id', NEW.module_id, 'material_id', NEW.id)
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_material_uploaded
AFTER INSERT ON public.materials
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_material_uploaded();

-- 2. Trigger on new module published (Req 11.1)
CREATE OR REPLACE FUNCTION public.fn_notify_module_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.notify_enrolled_students(
        NEW.course_id,
        'module_published',
        'New Module Published: ' || NEW.name,
        'A new course module is now available to view.',
        jsonb_build_object('course_id', NEW.course_id, 'module_id', NEW.id)
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_module_published
AFTER INSERT ON public.modules
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_module_published();

-- 3. Trigger on new activity created (Req 11.2)
CREATE OR REPLACE FUNCTION public.fn_notify_activity_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.notify_enrolled_students(
        NEW.course_id,
        'activity_created',
        'New Activity: ' || NEW.title,
        'A new ' || replace(NEW.activity_type, '_', ' ') || ' has been posted.',
        jsonb_build_object('course_id', NEW.course_id, 'activity_id', NEW.id, 'deadline', NEW.deadline)
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_activity_created
AFTER INSERT ON public.activities
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_activity_created();

-- 4. Trigger on grade released (Req 11.4)
CREATE OR REPLACE FUNCTION public.fn_notify_grade_released()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_activity_title text;
    v_course_id      uuid;
BEGIN
    IF NEW.status = 'graded' AND (OLD.status IS DISTINCT FROM 'graded' OR OLD.grade IS DISTINCT FROM NEW.grade) THEN
        SELECT title, course_id INTO v_activity_title, v_course_id
        FROM public.activities
        WHERE id = NEW.activity_id;

        INSERT INTO public.notifications (recipient_id, type, title, body, metadata)
        VALUES (
            NEW.student_id,
            'grade_released',
            'Grade Released: ' || COALESCE(v_activity_title, 'Activity'),
            'Your submission was graded: ' || COALESCE(NEW.grade::text, '0') || ' / ' || COALESCE(NEW.max_score::text, '100'),
            jsonb_build_object('course_id', v_course_id, 'activity_id', NEW.activity_id, 'submission_id', NEW.id, 'grade', NEW.grade)
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_grade_released
AFTER UPDATE ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_grade_released();

-- 5. Trigger on announcement posted (Req 11.7)
CREATE OR REPLACE FUNCTION public.fn_notify_announcement_posted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.notify_enrolled_students(
        NEW.course_id,
        'announcement_posted',
        'Announcement: ' || NEW.title,
        left(NEW.body, 200),
        jsonb_build_object('course_id', NEW.course_id, 'announcement_id', NEW.id)
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_announcement_posted
AFTER INSERT ON public.announcements
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_announcement_posted();

-- 6. Scheduled 24-hour deadline reminder function (Req 11.3)
-- Designed to run hourly via pg_cron:
--   SELECT cron.schedule('lms-deadline-reminders', '0 * * * *', 'SELECT public.send_24h_deadline_reminders();');
CREATE OR REPLACE FUNCTION public.send_24h_deadline_reminders()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inserted int := 0;
BEGIN
    WITH upcoming AS (
        SELECT a.id AS activity_id, a.course_id, a.title, a.deadline, e.student_id
        FROM   public.activities a
        JOIN   public.enrollments e
          ON   e.course_id = a.course_id
         AND   e.status = 'active'
        WHERE  a.deadline > now() + interval '23 hours'
          AND  a.deadline <= now() + interval '24 hours'
          AND  NOT EXISTS (
                   SELECT 1 FROM public.submissions s
                   WHERE s.activity_id = a.id AND s.student_id = e.student_id
               )
          AND  NOT EXISTS (
                   SELECT 1 FROM public.notifications n
                   WHERE n.recipient_id = e.student_id
                     AND n.type = 'deadline_reminder'
                     AND (n.metadata ->> 'activity_id')::uuid = a.id
               )
    ),
    ins AS (
        INSERT INTO public.notifications (recipient_id, type, title, body, metadata)
        SELECT student_id,
               'deadline_reminder',
               'Deadline Reminder: ' || title,
               'Due in 24 hours (' || to_char(deadline AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI UTC') || ').',
               jsonb_build_object('course_id', course_id, 'activity_id', activity_id, 'deadline', deadline)
        FROM upcoming
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_inserted FROM ins;

    RETURN v_inserted;
END;
$$;

-- 7. Automatic module-view attendance upsert RPC (Req 8.1, 8.2, 9.1, 9.2)
CREATE OR REPLACE FUNCTION public.record_module_view_attendance(
    p_course_id uuid,
    p_module_id uuid
)
RETURNS public.attendance_records
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student_id uuid := auth.uid();
    v_record     public.attendance_records;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_enrolled(p_course_id, v_student_id) THEN
        RAISE EXCEPTION 'Student is not enrolled in this course' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.attendance_records (
        course_id, module_id, student_id, first_viewed_at, last_viewed_at, status, manually_corrected
    )
    VALUES (
        p_course_id, p_module_id, v_student_id, now(), now(), 'present', false
    )
    ON CONFLICT (module_id, student_id)
    DO UPDATE SET
        last_viewed_at  = EXCLUDED.last_viewed_at,
        first_viewed_at = COALESCE(public.attendance_records.first_viewed_at, EXCLUDED.first_viewed_at),
        status          = CASE
                            WHEN public.attendance_records.manually_corrected THEN public.attendance_records.status
                            ELSE 'present'
                          END
    RETURNING * INTO v_record;

    RETURN v_record;
END;
$$;
