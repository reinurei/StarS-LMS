# Implementation Plan: LMS Platform

## Overview

Implement a web-based Learning Management System for colleges and universities using React + TypeScript, Tailwind CSS, Supabase (PostgreSQL + Auth + Realtime + Storage), Jitsi Meet React SDK, and TanStack Query + Zustand for state management. The plan follows the component tree in the design document, wiring each vertical slice end-to-end before moving to the next.

## Tasks

- [~] 1. Project scaffolding and core infrastructure
  - Initialise a Vite + React + TypeScript project with Tailwind CSS configured
  - Create the directory structure from the design (`src/lib`, `src/hooks`, `src/pages`, `src/components`, `src/edge-functions`)
  - Add `supabaseClient.ts` (singleton `@supabase/supabase-js` client, reads env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`)
  - Add `queryClient.ts` (TanStack Query `QueryClient` with retry policy: 3 retries, exponential backoff)
  - Install and configure Zustand for ephemeral UI state
  - Set up Vitest with `@testing-library/react` and `fast-check` for property-based tests
  - Create Zod schema barrel file `src/lib/validators.ts` (empty, to be populated per slice)
  - _Requirements: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18_

- [x] 2. Database schema and RLS policies
  - [x] 2.1 Write SQL migration file for all tables from the ERD (`profiles`, `courses`, `enrollments`, `modules`, `materials`, `material_access_logs`, `activities`, `activity_materials`, `questions`, `question_options`, `submissions`, `submission_files`, `meetings`, `attendance_records`, `attendance_join_events`, `notifications`, `announcements`, `forum_threads`, `forum_posts`, `activity_logs`)
    - Include all CHECK constraints listed in the design (role, status enums, activity_type, etc.)
    - Add `enrollment_code` UNIQUE constraint on `courses`
    - Add notification cap trigger (delete oldest when count exceeds 100 per user)
    - _Requirements: 3.1, 4.1, 6.1, 7.1, 8.1, 10.1, 11.7_
  - [x] 2.2 Write RLS policy migration covering all representative policies from the design
    - `professor_owns_course`, `student_enrolled_course`, `student_owns_submission`, `user_owns_notification`
    - Policies for `modules`, `materials`, `activities`, `meetings`, `attendance_records`, `forum_threads`, `forum_posts`, `announcements`
    - _Requirements: 15.1, 15.2_
  - [x] 2.3 Configure Supabase Auth Custom Access Token Hook to inject `role` from `app_metadata` into the JWT
    - _Requirements: 1.6, 15.1, 15.2_
  - [x] 2.4 Create private Storage buckets: `avatars`, `materials`, `submissions`, `recordings` with the path patterns from the design
    - _Requirements: 15.3, 5.3, 7.4_

- [ ] 3. Authentication and session management
  - [x] 3.1 Implement `useAuth` hook (`src/hooks/useAuth.ts`) — wraps `supabase.auth.getSession()`, subscribes to `onAuthStateChange`, exposes `user`, `role`, `isLoading`
    - _Requirements: 1.1, 1.6_
  - [x] 3.2 Build Login page (`src/pages/auth/`) with email + password form, Zod validation, and Supabase `signInWithPassword`
    - Map Supabase error codes to user-readable messages; never reveal whether email or password is wrong
    - Implement client-side lockout display (read `locked_until` from `app_metadata`)
    - _Requirements: 1.1, 1.2_
  - [x] 3.3 Implement failed-login counter via a Supabase Auth hook (Edge Function or DB hook) that increments `failed_attempts` and sets `locked_until` after 5 failures within 15 minutes
    - _Requirements: 1.2_
  - [x] 3.4 Build Password Reset pages (request + confirm) using `supabase.auth.resetPasswordForEmail` and `updateUser`
    - Always return the same response body regardless of whether the email exists (Requirement 1.4)
    - _Requirements: 1.3, 1.4_
  - [ ] 3.5 Implement `AuthGuard` and `RoleGuard` components (`src/components/guards/`) to protect routes
    - Redirect unauthenticated users to login (Requirement 1.7)
    - _Requirements: 1.6, 1.7_
  - [-] 3.6 Add session-inactivity timeout: 30-minute idle timer that calls `supabase.auth.signOut()` and redirects to login
    - _Requirements: 1.8_
  - [ ]* 3.7 Write unit tests for lockout state display logic and idle-timeout timer
    - _Requirements: 1.2, 1.8_

- [ ] 4. User profile management
  - [~] 4.1 Build Profile page (`src/pages/profile/`) — displays full name, email, role, avatar; edit form with Zod validation (max 100 chars for name, valid email format, max 5 MB JPEG/PNG/GIF/WebP avatar)
    - Show default placeholder when no avatar is uploaded (Requirement 2.6)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [~] 4.2 Wire avatar upload to `avatars` Supabase Storage bucket; display uploaded image via signed URL
    - _Requirements: 2.3, 15.3_
  - [ ]* 4.3 Write unit tests for profile Zod validators (name length, email format, avatar MIME/size)
    - _Requirements: 2.3, 2.5_

- [ ] 5. App shell, routing, and navigation
  - [-] 5.1 Build `AppShell` with `Sidebar` (≥1024 px) and `MobileDrawer` (<1024 px) navigation, responsive layout adapting from 320 px to 1920 px
    - _Requirements: 14.1, 14.2, 14.3_
  - [-] 5.2 Configure React Router with protected routes for all pages, applying `AuthGuard` and `RoleGuard`
    - _Requirements: 1.6, 1.7_
  - [-] 5.3 Add `Navbar` with `NotificationBadge` showing real-time unread count
    - _Requirements: 11.7_
  - [-] 5.4 Build shared UI component library (`src/components/ui/`): `Button`, `Input`, `Modal`, `Badge`, `Table` with consistent Tailwind variants (default, hover, disabled, error states)
    - _Requirements: 14.5_

- [ ] 6. Course management (Professor)
  - [~] 6.1 Add enrollment code generator utility (`src/lib/enrollmentCode.ts`) — generates an 8-character alphanumeric code and retries on collision against the `courses` table
    - _Requirements: 3.1_
  - [ ]* 6.2 Write property test for enrollment code uniqueness (Property 1)
    - **Property 1: Enrollment code uniqueness**
    - **Validates: Requirements 3.1**
  - [~] 6.3 Build Course creation form with Zod validation (name 1–150 chars, subject code 3–10 alphanumeric, description 1–1000 chars, schedule required); on submit, insert course and store generated enrollment code
    - _Requirements: 3.1, 3.8_
  - [~] 6.4 Build `CourseList` page — lists the authenticated Professor's courses grouped by semester/academic year, showing enrollment code per course
    - _Requirements: 3.2, 3.6_
  - [~] 6.5 Build course edit form; display field-level errors without discarding unsaved input on failure (Requirement 3.9)
    - _Requirements: 3.3, 3.9_
  - [~] 6.6 Implement course archive and delete actions (delete requires confirmation dialog)
    - _Requirements: 3.4, 3.5_
  - [~] 6.7 Build enrolled-student roster view within `CourseDetail` — shows full name, email, enrollment date
    - _Requirements: 3.7_
  - [ ]* 6.8 Write unit tests for course Zod validators (name, subject code, description, schedule)
    - _Requirements: 3.1, 3.8_

- [ ] 7. Student enrollment
  - [~] 7.1 Build enrollment-by-code form; call enrollment Edge Function that validates code, capacity, expiry, and duplicate enrollment, returning typed errors (`INVALID_CODE`, `EXPIRED`, `CAPACITY_REACHED`, `ALREADY_ENROLLED`)
    - _Requirements: 4.1, 4.2, 4.3, 4.7_
  - [~] 7.2 Implement Professor-side invitation UI — input student email, trigger Edge Function that creates a pending enrollment record and sends a notification email within 60 seconds
    - Display delivery-failure notice to Professor if email send fails (Requirement 4.4)
    - _Requirements: 4.4_
  - [~] 7.3 Build Student invitation-acceptance flow — verify invitation age ≤ 7 days; reject expired invitations with an error message
    - _Requirements: 4.5, 4.6_

- [ ] 8. Learning materials management
  - [~] 8.1 Add file-upload validator to `src/lib/validators.ts` — accepts the 18 allowed MIME types at ≤500 MB; also add submission-file validator (PDF, DOC, DOCX, JPEG, PNG, ZIP; ≤100 MB total; ≤10 files)
    - _Requirements: 5.1, 5.2, 7.4, 7.5_
  - [ ]* 8.2 Write property test for file upload constraint validation (Property 11)
    - **Property 11: File upload constraint validation**
    - **Validates: Requirements 5.1, 5.2, 7.4, 7.5**
  - [~] 8.3 Add URL validator to `src/lib/validators.ts` — accepts strings beginning with `http://` or `https://` that parse as valid RFC 3986 URIs
    - _Requirements: 5.5, 5.6_
  - [ ]* 8.4 Write property test for URL validation (Property 12)
    - **Property 12: URL validation**
    - **Validates: Requirements 5.5, 5.6**
  - [~] 8.5 Build `MaterialUpload` component — handles file selection with client-side validation, calls `POST /generate-signed-url` Edge Function to get upload URL, stores file in `materials` bucket, creates Material record linked to module and course
    - _Requirements: 5.3, 5.4_
  - [~] 8.6 Build `ModuleView` page — organises materials by module, shows title, description, file type, upload date; supports external URL materials
    - _Requirements: 5.7_
  - [~] 8.7 Implement material metadata edit (title, description, module) and file replacement; file replacement must delete the previous file and update the material record
    - On Storage delete failure during deletion: restore material record and display error (Requirement 5.11)
    - _Requirements: 5.8, 5.9, 5.10, 5.11_
  - [~] 8.8 Record material access events (`material_access_logs`) when a Student opens or downloads a material; display per-material access log to the Professor
    - _Requirements: 5.12, 5.13_
  - [~] 8.9 Write `generate-signed-url` Edge Function (`src/edge-functions/generate-signed-url/`) — authenticates caller, checks RLS, calls `createSignedUrl()`, returns `{ signedUrl, expiresAt }`
    - Reject unauthenticated requests with 403 (Requirement 15.3)
    - _Requirements: 15.3_

- [ ] 9. Activities and assessments (Professor)
  - [~] 9.1 Build Activity creation form with Zod validation (title 1–200 chars, activity type enum, instructions 1–5000 chars, deadline in the future, optional reference materials attachment)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [~] 9.2 Build question builder for Multiple Choice and Quiz activity types — up to 100 questions, up to 6 options per question, exactly 1 correct answer per question
    - _Requirements: 6.5_
  - [~] 9.3 Build `ActivityList` page (Professor view) — groups submissions by Submitted, Late, Pending, Missing status
    - _Requirements: 6.6_
  - [~] 9.4 Implement Professor submission download (via signed URL) with download event logging (Professor ID, submission ID, timestamp)
    - _Requirements: 6.7, 6.8_
  - [~] 9.5 Build grade entry form — numeric grade [0, 100] with feedback field; on save, persist grade + feedback and mark submission as Graded; display grade summary on Activity view
    - _Requirements: 6.9, 6.10_
  - [ ]* 9.6 Write property test for grade range invariant (Property 10)
    - **Property 10: Grade range invariant**
    - **Validates: Requirements 6.9**
  - [ ]* 9.7 Write unit tests for activity Zod validators (title, activity type, instructions, deadline in future)
    - _Requirements: 6.2, 6.3_

- [ ] 10. Activity submissions (Student)
  - [~] 10.1 Build `ActivityList` page (Student view) — categorises activities as Upcoming, Submitted, Graded, Late, Missing; shows instructions, deadline, reference materials, and submission status
    - _Requirements: 7.1, 7.2_
  - [~] 10.2 Implement submission status classifier (`src/lib/classifySubmission.ts`) — returns `late` iff `submitted_at > deadline`, `submitted` iff `submitted_at <= deadline`, `missing` iff no submission and `now > deadline`, `upcoming` iff no submission and `now <= deadline`
    - _Requirements: 6.6, 7.1, 7.3, 7.8_
  - [ ]* 10.3 Write property test for submission status classification (Property 2)
    - **Property 2: Submission status classification**
    - **Validates: Requirements 6.6, 7.1, 7.3, 7.8**
  - [~] 10.4 Build `SubmissionForm` component — file picker with client-side validator (PDF, DOC, DOCX, JPEG, PNG, ZIP; ≤100 MB total; ≤10 files), text answer field, submit button; handles resubmission up to `max_resubmissions`
    - Accept late submissions and mark status as Late (Requirement 7.8)
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.8_
  - [~] 10.5 Implement resubmission guard — read `resubmission_count` before accepting; reject once count reaches `max_resubmissions`
    - _Requirements: 7.6_
  - [ ]* 10.6 Write property test for resubmission count invariant (Property 3)
    - **Property 3: Resubmission count invariant**
    - **Validates: Requirements 7.6**
  - [~] 10.7 Display released grade and feedback on Student's submission view (Requirement 7.7)
    - _Requirements: 7.7_

- [~] 11. Checkpoint — core CRUD and submission flows
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Online quiz system with auto-grading
  - [~] 12.1 Build `QuizPlayer` component — displays questions one-by-one or all at once, enforces time limit with a countdown timer, auto-submits on expiry, records start time
    - Save all entered answers on session expiry and set `timed_out_at` (Requirement 17.5)
    - _Requirements: 17.1, 17.2, 17.5, 17.6_
  - [~] 12.2 Implement quiz auto-grade function (`src/lib/scoreQuizSubmission.ts`) — compares student answer to correct answer after `trim()` + `toLowerCase()`, counts matches
    - _Requirements: 17.3_
  - [ ]* 12.3 Write property test for quiz auto-grade correctness (Property 7)
    - **Property 7: Quiz auto-grade correctness**
    - **Validates: Requirements 17.3**
  - [~] 12.4 Implement question randomisation — shuffle question order per student session when `randomize_questions = true`
    - _Requirements: 17.4_
  - [ ]* 12.5 Write unit tests for `scoreQuizSubmission` edge cases (all correct, all wrong, whitespace/case variants)
    - _Requirements: 17.3_

- [ ] 13. Meeting scheduling and hosting (Professor)
  - [~] 13.1 Build Meeting creation form (title 1–200 chars, date, start time, duration 15–480 minutes); on submit, generate a deterministic Jitsi room name (`lms-meeting-{meetingId}`), save Meeting record and store join link
    - Roll back if Jitsi room cannot be verified (Requirement 8.2)
    - _Requirements: 8.1, 8.2_
  - [~] 13.2 Build `MeetingList` page — shows all meetings within the next 30 days on Professor's dashboard (title, date, start time, course name, join link)
    - _Requirements: 8.11_
  - [~] 13.3 Build `JitsiRoom` component (`src/components/meetings/JitsiRoom.tsx`) using `@jitsi/react-sdk` `JitsiMeeting`
    - Implement `onParticipantJoined`, `onParticipantLeft`, `onMeetingEnded` callbacks
    - Expose moderator controls (mute, remove participant) when `isModerator = true`
    - _Requirements: 8.4, 8.6, 8.7_
  - [~] 13.4 Implement meeting start action — update meeting status to "In Progress" via Supabase; wire `onMeetingEnded` to update status to "Completed"
    - _Requirements: 8.4, 8.9_
  - [~] 13.5 Implement recording consent flow — show consent modal before enabling recording; set `consent_acknowledged = true` and start recording only after Professor confirms
    - _Requirements: 8.8, 15.6, 15.7_
  - [~] 13.6 Write `meeting-webhook` Edge Function (`src/edge-functions/meeting-webhook/`) — receives `PARTICIPANT_JOINED`, `PARTICIPANT_LEFT`, `MEETING_ENDED` events from Jitsi; idempotent via `(meeting_id, participant_id, event_type, timestamp)` deduplication
    - _Requirements: 10.1, 10.2, 10.3_
  - [~] 13.7 Wire meeting recording URL save and make it accessible to enrolled students within 15 minutes of meeting completion
    - _Requirements: 8.10_

- [ ] 14. Student meeting access and attendance
  - [~] 14.1 Build Student meeting list on Student dashboard — meetings within 30 days with join link; block join attempts outside the `[start - 15 min, end]` window
    - _Requirements: 8.11, 9.1, 9.2_
  - [ ]* 14.2 Write property test for meeting join window enforcement (Property 13)
    - **Property 13: Meeting join window enforcement**
    - **Validates: Requirements 9.1, 9.2**
  - [~] 14.3 Implement enrollment check before redirecting Student to Jitsi room; display error if not enrolled or API unavailable
    - _Requirements: 9.3, 9.4_
  - [~] 14.4 Display meeting recording link on Meeting detail page once available (within 24 hours of end)
    - _Requirements: 9.5_
  - [~] 14.5 Build Student attendance page — per-course attendance records showing meeting date, status, and duration attended in minutes
    - _Requirements: 9.6_

- [ ] 15. Automated attendance monitoring
  - [~] 15.1 Implement `computeAttendedDuration(intervals)` function (`src/lib/attendance.ts`) — sums `(left_at - joined_at)` in minutes for each `attendance_join_events` record
    - _Requirements: 10.2_
  - [ ]* 15.2 Write property test for attendance duration accumulation (Property 4)
    - **Property 4: Attendance duration accumulation**
    - **Validates: Requirements 10.2**
  - [~] 15.3 Implement `deriveAttendanceStatus(attendedDuration, meetingDuration, threshold, firstJoinOffset, lastLeaveOffset)` function — returns Present/Late/Left Early/Absent per the four-rule definition in Requirement 10.4
    - _Requirements: 10.4_
  - [ ]* 15.4 Write property test for attendance status assignment correctness (Property 5)
    - **Property 5: Attendance status assignment correctness**
    - **Validates: Requirements 10.4**
  - [~] 15.5 Implement attendance threshold validator — accepts integers in [1, 100]; wire to Professor course settings form
    - _Requirements: 10.6_
  - [ ]* 15.6 Write property test for attendance threshold validation (Property 9)
    - **Property 9: Attendance threshold validation**
    - **Validates: Requirements 10.6**
  - [~] 15.7 Wire `meeting-webhook` Edge Function (task 13.6) to create/update `attendance_records` and `attendance_join_events` rows on each participant event; run post-meeting attendance evaluation (task 15.3) when `MEETING_ENDED` fires, generating the attendance report within 5 minutes
    - _Requirements: 10.1, 10.2, 10.3, 10.5_
  - [~] 15.8 Build manual attendance correction UI for Professors — saves corrected status, correction timestamp, and Professor user ID
    - _Requirements: 10.7_
  - [~] 15.9 Build attendance history page (Professor) — full Attendance_Records for all enrolled students, sorted by meeting date descending
    - _Requirements: 10.8_
  - [~] 15.10 Implement `computeAttendancePercentage(records)` function — `(present + late) / totalMeetings * 100`, rounded to two decimal places
    - _Requirements: 12.1_
  - [ ]* 15.11 Write property test for attendance percentage calculation (Property 14)
    - **Property 14: Attendance percentage calculation**
    - **Validates: Requirements 12.1**

- [ ] 16. Notifications and announcements
  - [~] 16.1 Implement server-side notification creation logic (Supabase DB trigger or Edge Function) — inserts one notification row per active enrollment when a material is uploaded, an activity is created, a grade is released, or a meeting is created/updated
    - Enforce the 100-notification cap per user (delete oldest on insert)
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.7_
  - [ ]* 16.2 Write property test for notification delivery completeness (Property 6)
    - **Property 6: Notification delivery completeness**
    - **Validates: Requirements 11.1, 11.2, 11.4, 11.5, 8.3**
  - [~] 16.3 Implement `useNotifications` hook (`src/hooks/useNotifications.ts`) — subscribes to the user's Supabase Realtime Broadcast channel, maintains an in-memory notification list and unread count
    - _Requirements: 11.7_
  - [~] 16.4 Build `NotificationCenter` component — displays notifications in reverse chronological order (max 100), marks individual notifications as read, shows unread count badge
    - _Requirements: 11.7, 11.8_
  - [~] 16.5 Implement mark-as-read mutation — sets `is_read = true`, updates `read_at`, decrements unread count in Zustand store
    - _Requirements: 11.8_
  - [ ]* 16.6 Write property test for notification read-state transition (Property 8)
    - **Property 8: Notification read-state transition**
    - **Validates: Requirements 11.8**
  - [~] 16.7 Implement deadline-reminder scheduler (Supabase scheduled function or pg_cron) — fires 24 hours before each activity deadline for students who have not yet submitted; fires 15 minutes before each meeting start for all enrolled students
    - _Requirements: 11.3, 11.6_
  - [~] 16.8 Write `send-notification-email` Edge Function (`src/edge-functions/send-notification-email/`) — sends email via Resend/SMTP for invitation and grade-released events
    - _Requirements: 4.4, 11.4_
  - [~] 16.9 Build Announcement creation form (Professor) — inserts announcement record and triggers notifications to all enrolled students; display announcements on Course page
    - _Requirements: 11.9_

- [~] 17. Checkpoint — notifications and meeting flows
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Academic calendar
  - [~] 18.1 Build `AcademicCalendar` page — month/week view showing all activity deadlines, meeting dates, and recurring course session dates for the user's enrolled/managed courses
    - _Requirements: 18.1_
  - [~] 18.2 Implement calendar event detail panel — clicking an event shows title, course, date/time, description without navigating away
    - _Requirements: 18.2_
  - [~] 18.3 Add calendar filter by course or event type (Activity, Meeting, Course Session); show empty-state message when no events match
    - _Requirements: 18.3, 18.4_

- [ ] 19. Discussion forums
  - [~] 19.1 Build `ForumList` and `ThreadView` pages — per-course forum where enrolled students and the course's professor can create threads and post replies; display posts within 2 seconds of submission
    - Enforce max post length of 10,000 characters; reject empty posts (after whitespace trim)
    - _Requirements: 16.1, 16.2, 16.3, 16.6_
  - [~] 19.2 Implement Professor forum moderation — lock thread (prevents new replies, keeps posts visible), pin thread, delete thread or post; reflect changes within 2 seconds via Supabase Realtime
    - _Requirements: 16.4, 16.5_
  - [~] 19.3 Implement real-time forum post delivery via `useRealtimeChannel` hook (`src/hooks/useRealtimeChannel.ts`) subscribing to the course's Realtime Broadcast channel
    - _Requirements: 16.2_

- [ ] 20. Analytics dashboard and reports (Professor)
  - [~] 20.1 Build `AnalyticsDashboard` page — displays per-course: total enrolled students, per-student attendance percentage (via `computeAttendancePercentage`), overall class attendance rate, per-activity submission statistics (total submissions, % on-time)
    - Display Present/Late/Left Early/Absent counts per meeting in the attendance summary
    - _Requirements: 12.1, 12.5_
  - [~] 20.2 Build grade summary table per course — shows each student's numerical grade for every graded activity alongside the activity's maximum possible grade
    - _Requirements: 12.2_
  - [~] 20.3 Implement dashboard filter controls (course, student, date range, semester) — update displayed data within 3 seconds; show no-data message when filters return no results
    - _Requirements: 12.3, 12.6_
  - [~] 20.4 Write `export-report` Edge Function (`src/edge-functions/export-report/`) — accepts `{ courseId, format, filters }`, queries attendance + grade data, streams CSV or XLSX response (Streams API for progressive download); handles up to 10,000 rows within 10 seconds; file includes one row per student with columns for name, ID, activity grades, and attendance percentage
    - _Requirements: 12.4_

- [ ] 21. Student progress and grades view
  - [~] 21.1 Build student grade view — shows score earned and maximum possible score for every graded activity in enrolled courses; shows "Pending Grade" for ungraded submissions
    - _Requirements: 13.1, 13.2_
  - [~] 21.2 Build student attendance records view per course — shows each meeting's date and attendance status (Present, Absent, Late, Excused)
    - _Requirements: 13.3_
  - [~] 21.3 Build progress summary per course — counts of Activities completed (submitted on/before due date), pending (not submitted, due date not passed), and missing (not submitted, due date passed)
    - _Requirements: 13.4_

- [ ] 22. Activity logging and security hardening
  - [~] 22.1 Implement activity logger utility (`src/lib/activityLogger.ts`) — inserts into `activity_logs` for create, update, delete, and download operations, capturing user ID, action type, resource type, resource ID, and timestamp
    - _Requirements: 15.4_
  - [~] 22.2 Wire activity logger to all create/update/delete mutations in courses, materials, activities, meetings, submissions, and to download actions in materials and submissions
    - _Requirements: 15.4_
  - [~] 22.3 Add data privacy controls to Profile settings page — "Request my data" and "Delete my account" actions (Requirement 15.5)
    - _Requirements: 15.5_
  - [~] 22.4 Verify HTTPS enforcement — ensure all Supabase client calls and Edge Function fetches use HTTPS; add Content-Security-Policy header in Vite config
    - _Requirements: 15.8_

- [~] 23. Final checkpoint — integration and end-to-end coverage
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations each; they map 1:1 to the numbered Correctness Properties in `design.md`
- Unit tests use Vitest + `@testing-library/react`
- Checkpoints at tasks 11, 17, and 23 ensure incremental validation across the three major delivery phases

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 1, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "5.1", "5.2", "5.3", "5.4"] },
    { "id": 2, "tasks": ["3.7", "4.1", "4.2", "6.1", "8.1", "8.3"] },
    { "id": 3, "tasks": ["4.3", "6.2", "6.3", "6.4", "7.1", "7.2", "7.3", "8.2", "8.4", "8.5", "8.6", "8.9", "10.2"] },
    { "id": 4, "tasks": ["6.5", "6.6", "6.7", "6.8", "8.7", "8.8", "9.1", "9.2", "10.1", "10.3", "10.4", "10.5"] },
    { "id": 5, "tasks": ["9.3", "9.4", "9.5", "9.6", "9.7", "10.6", "10.7", "12.1", "12.2", "13.1", "13.2", "13.6", "15.1", "15.3", "15.5", "15.10"] },
    { "id": 6, "tasks": ["12.3", "12.4", "12.5", "13.3", "13.4", "13.5", "13.7", "14.1", "15.2", "15.4", "15.6", "15.11"] },
    { "id": 7, "tasks": ["14.2", "14.3", "14.4", "14.5", "15.7", "15.8", "15.9", "16.1", "16.3", "16.8"] },
    { "id": 8, "tasks": ["16.2", "16.4", "16.5", "16.7", "16.9", "19.3"] },
    { "id": 9, "tasks": ["16.6", "18.1", "19.1", "19.2", "20.1", "20.2", "21.1", "21.2", "21.3", "22.1"] },
    { "id": 10, "tasks": ["18.2", "18.3", "20.3", "20.4", "22.2", "22.3", "22.4"] }
  ]
}
```
