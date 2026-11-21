# Requirements Document

## Introduction

This document defines the requirements for a Web-Based Learning Management System (LMS) designed for colleges and universities. The platform centralizes course management, learning materials, academic activities, attendance monitoring, and academic reporting. Two primary roles — Professor and Student — each have dedicated dashboards, permissions, and workflows. The system is built on React.js with TypeScript, Tailwind CSS, Supabase (PostgreSQL + Auth + Realtime), and cloud file storage.

---

## Glossary

- **LMS**: The Web-Based Learning Management System described in this document.
- **Professor**: An authenticated user with the professor role who creates and manages courses.
- **Student**: An authenticated user with the student role who enrolls in and participates in courses.
- **Course**: A unit of academic instruction created by a Professor, identified by a subject code and enrollment code.
- **Enrollment_Code**: A unique alphanumeric code generated per Course that Students use to self-enroll.
- **Module**: A named grouping of learning materials within a Course (e.g., by topic or week).
- **Material**: A file or external link uploaded to a Module by a Professor.
- **Activity**: An academic task (assignment, quiz, exam, essay, group project) created by a Professor within a Course.
- **Submission**: A Student's response to an Activity, consisting of uploaded files and/or text answers.
- **Attendance_Record**: A database entry capturing a Student's attendance for a Module, recorded automatically once the Student views the Module.
- **Notification**: An in-app alert delivered to a user about an academic event.
- **Auth_Service**: Supabase Auth, responsible for identity verification and session management.
- **Storage_Service**: The secure cloud-based file storage service used for Materials and Submissions.
- **Realtime_Service**: Supabase Realtime or WebSockets used for live notifications.
- **Validator**: The system component responsible for validating user input (forms, file types, sizes).
- **Report**: A generated summary of attendance or academic performance, exportable to CSV or Excel.

---

## Requirements

### Requirement 1: User Authentication and Session Management

**User Story:** As a user (Professor or Student), I want to securely log in and log out of the LMS, so that my academic data is protected and only accessible to me.

#### Acceptance Criteria

1. WHEN a user submits valid credentials, THE Auth_Service SHALL authenticate the user and establish a session within 3 seconds.
2. WHEN a user submits invalid credentials, THE Auth_Service SHALL reject the login attempt and display an error message indicating that the credentials are incorrect without specifying whether the username or password is wrong, and IF the same account has 5 consecutive failed login attempts within 15 minutes, THEN THE Auth_Service SHALL lock that account for 15 minutes and display a message indicating the lockout duration.
3. WHEN a user requests a password reset for a registered email address, THE Auth_Service SHALL send a password reset email to that address within 60 seconds containing a single-use reset link that expires after 30 minutes.
4. IF a user requests a password reset for an email address that is not registered, THEN THE Auth_Service SHALL display a message stating that if the address is registered, a reset email will be sent, and SHALL NOT send any email.
5. WHEN a user logs out, THE Auth_Service SHALL invalidate the active session and redirect the user to the login page.
6. WHILE a session is active, THE LMS SHALL enforce role-based access control, granting Professor accounts access to course creation, grade entry, and roster viewing, and granting Student accounts access to course enrollment, assignment submission, and grade viewing only.
7. WHEN an unauthenticated user attempts to access a protected route, THE LMS SHALL redirect the user to the login page.
8. IF a session has been inactive for 30 consecutive minutes, THEN THE Auth_Service SHALL invalidate the session and require the user to re-authenticate before accessing any protected resource.

---

### Requirement 2: User Profile Management

**User Story:** As a user, I want to view and update my profile information, so that my account details remain accurate.

#### Acceptance Criteria

1. THE LMS SHALL display each user's full name, email address, role, and profile photo on the profile page.
2. WHEN a user submits a profile update with valid data, THE LMS SHALL persist the changes to the database and reflect the updated values on the profile page within 3 seconds.
3. WHEN a user uploads a profile photo, THE Validator SHALL accept only image files (JPEG, PNG, GIF, WebP) with a maximum size of 5 MB and reject files exceeding these constraints with an error message indicating the allowed formats and size limit.
4. IF a user submits a profile update with invalid data, THEN THE Validator SHALL display field-level error messages without discarding the user's input.
5. THE LMS SHALL enforce a maximum length of 100 characters for full name and reject email addresses that do not conform to a valid email format (local-part@domain) with a field-level error message.
6. IF a user's profile has no photo uploaded, THEN THE LMS SHALL display a default placeholder image on the profile page.

---

### Requirement 3: Course Management (Professor)

**User Story:** As a Professor, I want to create, edit, archive, and delete courses, so that I can organize my teaching workload by semester and academic year.

#### Acceptance Criteria

1. WHEN a Professor submits a new course form, THE LMS SHALL validate that the course name is between 1 and 150 characters, the subject code is between 3 and 10 alphanumeric characters, the description is between 1 and 1000 characters, and the schedule is present; and upon passing validation, create the Course record and generate a unique 8-character alphanumeric Enrollment_Code that is unique across all Courses in the system.
2. WHEN a Professor navigates to the Course management page, THE LMS SHALL display all Courses owned by the authenticated Professor, organized by semester and academic year.
3. WHEN a Professor submits edits to a Course's details, THE LMS SHALL persist the updated fields and reflect the changes in the Professor's dashboard within 2 seconds.
4. WHEN a Professor archives a Course, THE LMS SHALL mark the Course as archived and remove it from the active course list while preserving all associated records.
5. WHEN a Professor confirms deletion of a Course by clicking a dedicated confirm button in a confirmation dialog, THE LMS SHALL permanently remove the Course and all associated records from the database.
6. WHEN a Professor loads the Course management page, THE LMS SHALL display the Enrollment_Code for each Course so the Professor can share it with Students.
7. WHEN a Professor views a Course's enrolled students list, THE LMS SHALL display each Student's full name, email, and enrollment date.
8. IF a Professor submits the new course form with any required field missing or any field failing its validation constraint, THEN THE LMS SHALL reject the submission and display an error message identifying each invalid field without creating a Course record.
9. IF saving edits to a Course fails, THEN THE LMS SHALL display an error message indicating the save was unsuccessful and preserve the Professor's unsaved changes in the form.

---

### Requirement 4: Student Enrollment

**User Story:** As a Student, I want to enroll in a course using an enrollment code or a professor's invitation, so that I can access the course's materials and activities.

#### Acceptance Criteria

1. WHEN a Student submits an Enrollment_Code that is active, not expired, and the Course has not reached its maximum enrollment capacity, THE LMS SHALL create an enrollment record linking the Student to the corresponding Course and grant the Student access to Course content.
2. IF a Student submits an Enrollment_Code that does not match any existing Course, THEN THE LMS SHALL reject the enrollment and display an error message indicating the code was not recognized.
3. IF a Student submits an Enrollment_Code that is expired or belongs to a Course that has reached its maximum enrollment capacity, THEN THE LMS SHALL reject the enrollment and display an error message indicating the specific reason for rejection.
4. WHEN a Professor sends an enrollment invitation to a Student's registered email address, THE LMS SHALL create a pending enrollment record and send a notification email to the Student within 60 seconds; IF the email cannot be delivered, THEN THE LMS SHALL notify the Professor that delivery failed within 60 seconds of the delivery failure.
5. WHEN a Student accepts a pending enrollment invitation that was issued within the last 7 days, THE LMS SHALL activate the enrollment and grant the Student access to Course content.
6. IF a Student attempts to accept a pending enrollment invitation that was issued more than 7 days ago, THEN THE LMS SHALL reject the acceptance and display an error message indicating the invitation has expired.
7. IF a Student submits an Enrollment_Code or accepts an invitation for a Course in which they already have an active enrollment, THEN THE LMS SHALL reject the request and display an error message indicating the Student is already enrolled in that Course.

---

### Requirement 5: Learning Materials Management (Professor)

**User Story:** As a Professor, I want to upload and organize learning materials into modules, so that Students can access course content in a structured way.

#### Acceptance Criteria

1. WHEN a Professor uploads a file, THE Validator SHALL accept files of the following types: PPT, PPTX, PDF, DOC, DOCX, XLS, XLSX, JPEG, PNG, GIF, WebP, MP4, MOV, MP3, WAV, AAC, OGG, and FLAC, with a maximum file size of 500 MB per file.
2. IF a Professor uploads a file whose type is not in the accepted list or whose size exceeds 500 MB, THEN THE Validator SHALL reject the upload and return an error message indicating the reason for rejection without storing any data.
3. WHEN a Professor uploads a valid file, THE Storage_Service SHALL store the file and return a storage reference.
4. WHEN THE Storage_Service returns a storage reference for an uploaded file, THE LMS SHALL create a Material record linked to the specified Module and Course.
5. WHEN a Professor adds an external link as a Material, THE Validator SHALL verify that the URL begins with "http://" or "https://" and conforms to RFC 3986 syntax before saving the record.
6. IF a Professor submits an external link URL that fails validation, THEN THE LMS SHALL reject the submission and return an error message indicating the URL is invalid without creating a Material record.
7. THE LMS SHALL display Materials within each Course organized by Module, showing the title, description, file type, and upload date.
8. WHEN a Professor edits a Material's metadata (title, description, module), THE LMS SHALL persist the changes within 2 seconds and display the updated values to the Professor.
9. WHEN a Professor replaces a Material's file, THE Storage_Service SHALL store the new file, THE LMS SHALL update the Material record to reference the new file, and THE Storage_Service SHALL delete the previous file.
10. WHEN a Professor confirms deletion of a Material, THE LMS SHALL remove the Material record and request THE Storage_Service to delete the associated file.
11. IF THE Storage_Service fails to delete the associated file during a Material deletion, THEN THE LMS SHALL restore the Material record and return an error message indicating the deletion was unsuccessful.
12. WHEN a Student opens or downloads a Material, THE LMS SHALL record the access event in the database, associating the Student, Material, and timestamp.
13. THE LMS SHALL display a per-Material access log to the Professor showing which Students have viewed the material and when.

---

### Requirement 6: Activities and Assessments (Professor)

**User Story:** As a Professor, I want to create and manage academic activities with deadlines and grading, so that I can assess student learning effectively.

#### Acceptance Criteria

1. WHEN a Professor creates an Activity, THE LMS SHALL accept the following activity types: Assignment, Quiz, Exam, Essay, Short Answer, Multiple Choice, File Submission, and Group Project.
2. WHEN a Professor creates an Activity, THE LMS SHALL require a title of 1–200 characters, an activity type, instructions of 1–5000 characters, and a submission deadline before saving.
3. WHEN a Professor sets a submission deadline, THE LMS SHALL reject any deadline whose date and time is earlier than the current date and time, and SHALL display an error indicating the deadline must be in the future.
4. WHEN a Professor creates or edits an Activity, THE LMS SHALL allow the Professor to attach reference Materials to that Activity.
5. WHEN a Professor creates a Multiple Choice or Quiz activity, THE LMS SHALL allow the Professor to define up to 100 questions, up to 6 answer options per question, and exactly 1 correct answer per question.
6. WHEN a Professor views the activity management page, THE LMS SHALL display each Activity's submissions categorized as Submitted (received on or before the deadline), Late (received after the deadline), Pending (deadline not yet passed and no submission received), or Missing (deadline has passed and no submission was received).
7. WHEN a Professor downloads a Submission, THE Storage_Service SHALL provide the file to the LMS.
8. WHEN a Professor downloads a Submission, THE LMS SHALL log the download event including the Professor's identity, the Submission identifier, and the timestamp.
9. WHEN a Professor saves a grade for a Submission, THE LMS SHALL require a numeric grade between 0 and 100 inclusive, persist the grade and any provided feedback, and mark the Submission as Graded.
10. WHEN a Professor views an Activity, THE LMS SHALL display a grade summary showing the count of Submitted, Graded, Late, and Missing submissions for that Activity.

---

### Requirement 7: Activity Submissions (Student)

**User Story:** As a Student, I want to view assigned activities and submit my work, so that I can fulfill my academic requirements and receive feedback.

#### Acceptance Criteria

1. THE LMS SHALL display all Activities assigned to a Student's enrolled Courses, categorized by submission status, where: Upcoming means the deadline has not passed and no Submission exists; Submitted means a Submission exists and the deadline has not passed; Graded means a grade has been released for the Submission; Late means a Submission was recorded after the deadline; and Missing means the deadline has passed and no Submission exists.
2. WHEN a Student opens an Activity, THE LMS SHALL display the instructions, deadline, any attached reference Materials, and the Submission status, where status is one of: Upcoming, Submitted, Graded, Late, or Missing.
3. WHEN a Student submits an Activity before the deadline, THE LMS SHALL record the Submission with a timestamp and display a submission confirmation.
4. WHEN a Student submits files, THE Validator SHALL accept PDF, DOC, DOCX, JPEG, PNG, and ZIP files up to a maximum total size of 100 MB per Submission and a maximum of 10 files per Submission.
5. IF a Student submits files with a type not in the accepted list or with a total size exceeding 100 MB, THEN THE Validator SHALL reject the Submission and display an error indicating which constraint was violated, leaving any prior Submission unchanged.
6. WHILE a deadline has not passed and the Professor has permitted resubmission, THE LMS SHALL allow a Student to update an existing Submission up to a maximum of 10 resubmissions.
7. WHEN a Professor releases grades, THE LMS SHALL display the grade and feedback on the Student's Submission view.
8. IF a Student attempts to submit after the deadline, THEN THE LMS SHALL accept the Submission, record it with a timestamp, mark the Submission status as Late, and display a confirmation indicating the Submission was received after the deadline.

---

### Requirement 8: Automated Attendance Monitoring via Module Viewing

**User Story:** As a Professor, I want the LMS to automatically record student attendance once a student views a module, so that I can monitor participation without manual record-keeping or online video calls.

#### Acceptance Criteria

1. WHEN an enrolled Student views a Module for the first time, THE LMS SHALL automatically create an Attendance_Record capturing the Student, Course, Module, view timestamp, and an attendance status of "Present".
2. IF a Student views a Module that they have already viewed previously, THEN THE LMS SHALL NOT create a duplicate Attendance_Record and SHALL update the `last_viewed_at` timestamp on the existing Attendance_Record.
3. FOR any enrolled Student who has not yet viewed a published Module in a Course, THE LMS SHALL consider the Student's attendance status for that Module as "Absent".
4. WHEN a Professor manually corrects an Attendance_Record (e.g., setting status to "Present", "Absent", or "Excused"), THE LMS SHALL save the corrected status along with the correction timestamp and the Professor's user ID.
5. WHEN a Professor navigates to the attendance history page for a Course, THE LMS SHALL display a complete list of Attendance_Records for all enrolled Students across all Modules in that Course, sorted by Module display order or view date descending.
6. WHEN a Professor requests an attendance report export, THE LMS SHALL generate and make available for download a CSV or Excel file containing the attendance history filtered by the Professor's selected Course, Student, Module, date range, or semester within 30 seconds of the request.

---

### Requirement 9: Student Attendance View

**User Story:** As a Student, I want to view my module attendance records for each course, so that I can track which modules I have viewed and verify my attendance status.

#### Acceptance Criteria

1. WHEN a Student opens a Module in an enrolled Course, THE LMS SHALL record the Student's attendance as "Present" immediately upon viewing the Module.
2. IF a Student attempts to view a Module for a Course in which the Student is not enrolled, THEN THE LMS SHALL deny access and display an error message indicating the Student lacks enrollment in that Course.
3. WHEN a Student views their attendance page for a Course, THE LMS SHALL display the Student's attendance records for that Course showing each Module's name, attendance status ("Present", "Absent", or "Excused"), and the timestamp when the Module was first viewed.

---

### Requirement 10: Attendance Analytics and Reporting

**User Story:** As a Professor, I want to track module view completion as class attendance, so that I have accurate participation metrics per module and per student.

#### Acceptance Criteria

1. THE LMS SHALL calculate each Student's attendance percentage in a Course as the number of Modules where the Student's status is "Present" or "Excused" divided by the total number of Modules in that Course, multiplied by 100.
2. WHEN a Professor views a Module's attendance summary, THE LMS SHALL display the count and list of enrolled Students marked as "Present", "Absent", or "Excused" for that Module.

---

### Requirement 11: Notifications and Announcements

**User Story:** As a user, I want to receive timely in-app notifications about academic events, so that I stay informed about deadlines, grades, and course updates.

#### Acceptance Criteria

1. WHEN a Professor uploads a new Material or publishes a Module to a Course, THE LMS SHALL deliver a Notification to all Students enrolled in that Course.
2. WHEN a Professor creates a new Activity in a Course, THE LMS SHALL deliver a Notification to all Students enrolled in that Course.
3. WHEN an Activity deadline is exactly 24 hours away, THE LMS SHALL deliver a reminder Notification to all Students enrolled in that Course who have not yet submitted.
4. WHEN a Professor releases a grade for a Submission, THE LMS SHALL deliver a Notification to the submitting Student.
5. THE LMS SHALL provide an in-app Notification center accessible from the main navigation that displays all Notifications in reverse chronological order, with a maximum of 100 Notifications shown, each marked as read or unread, and showing the total unread count.
6. WHEN a user reads a Notification, THE LMS SHALL mark the Notification as read and update the unread count in the Notification center.
7. WHEN a Professor posts an Announcement for a Course, THE LMS SHALL deliver a Notification to all Students enrolled in that Course and display the Announcement on the Course page.

---

### Requirement 12: Academic Reports and Analytics (Professor)

**User Story:** As a Professor, I want to view an analytics dashboard and download reports, so that I can monitor student performance and attendance across my courses.

#### Acceptance Criteria

1. THE LMS SHALL display an analytics dashboard for each Course showing: total enrolled Students, per-Student attendance percentage calculated as (Modules viewed/attended divided by total Modules in the Course) multiplied by 100, overall class attendance rate calculated as the average of all per-Student attendance percentages, and Activity submission statistics showing total submissions received and percentage of on-time submissions per Activity.
2. THE LMS SHALL display a grade summary per Course showing each Student's numerical grade for every graded Activity, alongside the Activity's maximum possible grade.
3. WHEN a Professor filters the analytics dashboard by course, student, date range, or semester, THE LMS SHALL update the displayed data to match the selected filters within 3 seconds.
4. WHEN a Professor requests a downloadable Report, THE LMS SHALL allow the Professor to select CSV or Excel format, then generate and deliver a file containing the filtered data within 10 seconds for datasets up to 10,000 records, where the file includes one row per Student and columns for Student name, Student ID, each Activity grade, and attendance percentage.
5. THE LMS SHALL display the number of Students marked as Present, Absent, or Excused for each Module in the attendance summary.
6. IF a Professor applies filters that return no matching records, THEN THE LMS SHALL display a message indicating no data matches the selected filters and preserve the current filter selections.

---

### Requirement 13: Student Progress and Grades

**User Story:** As a Student, I want to view my grades, attendance records, and academic progress in one place, so that I can monitor my standing in each course.

#### Acceptance Criteria

1. THE LMS SHALL display each Student's grade for every graded Submission within the Student's enrolled Courses, showing the score earned and the maximum possible score for that Activity.
2. IF a Submission exists but has not yet been graded, THEN THE LMS SHALL display the Submission's status as "Pending Grade" in place of a score.
3. THE LMS SHALL display each Student's attendance record per Course, showing each Module's name, view date, and the Student's attendance status, where attendance status is one of: Present, Absent, or Excused.
4. THE LMS SHALL display a progress summary per Course showing the count of Activities completed (submitted on or before the due date), pending (not submitted and due date has not passed), and missing (not submitted and due date has passed).

---

### Requirement 14: Responsive User Interface

**User Story:** As a user, I want to access the LMS from any device, so that I can manage my academic work whether I am on a desktop, tablet, or mobile phone.

#### Acceptance Criteria

1. THE LMS SHALL render all pages with a responsive layout that adapts to viewport widths from 320 px (mobile) to 1920 px (desktop) without horizontal overflow or broken layouts.
2. IF the viewport width is 1024 px or greater, THEN THE LMS SHALL display a persistent sidebar navigation.
3. IF the viewport width is less than 1024 px, THEN THE LMS SHALL display a collapsible drawer navigation that is hidden by default and expands on user activation.
4. WHEN a user opens the main navigation, THE LMS SHALL display a calendar view showing Activity deadlines and class schedules.
5. THE LMS SHALL apply the same visual style for each component type (buttons, forms, tables, cards, and status indicators) across all pages, such that each component type has a single appearance per state (default, hover, disabled, error).

---

### Requirement 15: Security and Data Privacy

**User Story:** As a system administrator, I want the LMS to enforce data security and privacy controls, so that student and academic records are protected in accordance with applicable regulations.

#### Acceptance Criteria

1. THE LMS SHALL enforce role-based authorization so that a Professor can only access and modify Courses, Modules, Materials, and Activities that belong to their own account.
2. THE LMS SHALL enforce role-based authorization so that a Student can only access Courses in which the Student is enrolled and can only view or download the Student's own Submissions and grades.
3. THE Storage_Service SHALL require authenticated and authorized requests for all file downloads, rejecting unauthenticated or unauthorized access with a 403 response.
4. THE LMS SHALL maintain an activity log recording user ID, action type, affected resource, and timestamp for create, update, delete, and download operations.
5. THE LMS SHALL store all personally identifiable information in compliance with the Philippine Data Privacy Act of 2012, and SHALL provide each user the ability to request access to or deletion of their own personal data from within their account settings.
6. THE LMS SHALL transmit all data between client and server over HTTPS.

---

### Requirement 16: Discussion Forums

**User Story:** As a user, I want to participate in course discussion forums, so that I can ask questions and interact with professors and classmates.

#### Acceptance Criteria

1. THE LMS SHALL provide a discussion forum per Course where enrolled Students and the Course's Professor can create threads and post replies.
2. WHEN a user posts a message in a forum thread, THE LMS SHALL persist the post and display it to all forum participants within 2 seconds.
3. THE LMS SHALL enforce a maximum post length of 10,000 characters, rejecting any submission that exceeds this limit with an error message indicating the character limit.
4. WHEN a Professor locks a thread, THE LMS SHALL prevent any further replies to that thread while keeping the existing posts visible and readable to all forum participants.
5. WHEN a Professor pins or deletes a thread or post within their Course's forum, THE LMS SHALL apply the action immediately and reflect the change to all forum participants within 2 seconds.
6. IF a user submits a post whose content, after stripping leading and trailing whitespace, is empty, THEN THE LMS SHALL reject the submission and display an error message indicating that the post cannot be blank.

---

### Requirement 17: Online Quiz System with Auto-Grading

**User Story:** As a Professor, I want to create timed quizzes with auto-graded objective questions, so that I can efficiently assess students on factual content.

#### Acceptance Criteria

1. WHEN a Professor creates a Quiz Activity, THE LMS SHALL allow the Professor to define a time limit between 1 and 300 minutes, a question pool of 1 to 200 questions, and whether questions are randomized per Student.
2. WHEN a Student starts a Quiz, THE LMS SHALL record the start time and enforce the time limit by automatically submitting the Quiz when the time limit expires.
3. WHEN a Quiz Submission is completed, THE LMS SHALL automatically calculate and record the score for Multiple Choice questions and for Short Answer questions by comparing the Student's answer to the defined correct answer using case-insensitive, whitespace-trimmed matching.
4. WHEN a Professor has enabled randomization, THE LMS SHALL present questions in a randomized order unique to each Student's Quiz session.
5. IF a Student's Quiz session expires before manual submission, THEN THE LMS SHALL save all answers the Student entered up to the expiration time and submit the Submission with a Timed-Out status.
6. IF a Student submits a Quiz after the Quiz's scheduled closing time but before the session expiration, THEN THE LMS SHALL record the Submission with a Late status.

---

### Requirement 18: Academic Calendar

**User Story:** As a user, I want a centralized academic calendar, so that I can see all upcoming deadlines and class schedules in one view.

#### Acceptance Criteria

1. THE LMS SHALL display a calendar view showing all Activity deadlines and recurring Course session dates for a user's enrolled or managed Courses.
2. WHEN a user selects a calendar event, THE LMS SHALL display the event details (title, course, date/time, description) in a detail panel without navigating away from the calendar.
3. WHEN a user applies a filter by course or event type (Activity, Course Session), THE LMS SHALL update the calendar view to show only events matching the selected filter criteria.
4. IF no events match the applied filter criteria, THEN THE LMS SHALL display a message indicating no events are available for the selected filter.
