# StarS LMS — University Learning Management System

A full-stack web-based Learning Management System for colleges and universities built with **React + TypeScript**, **Tailwind CSS**, **Supabase (PostgreSQL, Auth, Realtime, Storage, Edge Functions)**, **TanStack Query**, and **Zustand**.

---

## Key Features

- **Role-Based Portals (Professor & Student)**: Separate dashboards, navigation, route guards (`AuthGuard` / `RoleGuard`), and PostgreSQL Row Level Security (RLS).
- **Course Management & Enrollment**:
  - Create, edit (including custom **course overview pictures**), archive, and delete courses.
  - Organize courses by **1st Semester / 2nd Semester / Summer Term** with quick semester switching and auto-generated unique 8-character enrollment codes.
  - Student self-enrollment by code plus Professor email invitations (7-day expiry).
- **Learning Materials & Automated Module-View Attendance**:
  - Upload files (18 supported MIME types up to 500 MB) or RFC 3986 external links grouped by Module, with student access logs.
  - **Automatic attendance tracking**: Opening a course module automatically marks enrolled students as `Present` (idempotent upsert), with Professor manual adjustment (`Present`, `Absent`, `Excused`) and per-module summaries.
- **Activities, Submissions & Auto-Graded Online Quizzes**:
  - Supports all 8 academic activity types, file/text submissions (up to 10 files, 100 MB total), resubmission limits, late flagging, and grading (`0–100`) with feedback.
  - Timed quizzes with question randomization, countdown auto-submit, and case-insensitive/trimmed auto-grading.
- **Academic Calendar & Weekly Course Schedule**:
  - Month/Week calendar for deadlines & class sessions with inline detail panel, plus a dedicated **Weekly Course Schedule** (Mon–Sat timetable).
- **AI Study Assistant & Real-Time Messaging**:
  - Floating **AI & Chat Hub** where students can ask AI about latest announcements, deadlines, attendance, grades, and schedules, or message classmates and professors directly.
  - Real-time course discussion forums with Professor moderation (pin, lock, delete) and in-app notification center (up to 100 notifications).
- **Extended Profiles & Data Privacy (RA 10173)**:
  - Editable **Activity Status** (`Active`, `Idle`, `Do not disturb`, `Offline`), **Course/Program**, **External Links**, avatar upload, cross-profile viewing with 1-click **Chat**, and personal data export / account deletion controls.
- **Analytics & Reports**:
  - Course attendance rates, module participation, submission timeliness, gradebook matrix, and **CSV / Excel (`.xlsx`)** export.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons |
| State & Data | TanStack Query, Zustand, Zod |
| Backend | Supabase (PostgreSQL + RLS, Auth + Custom JWT Hook, Storage, Realtime, Edge Functions) |
| Testing | Vitest, React Testing Library, `fast-check` (14 property-based tests + unit tests) |

---

## Quick Start (Local)

```bash
cd lms-app
npm install
npm run dev
```

Open the local URL shown by Vite (typically `http://localhost:5173`).

### Trying the App Immediately (Demo Mode)
If `lms-app/.env` is not configured, the app runs automatically in zero-config **Demo Mode** with realistic pre-seeded university data:
- Click **Professor Demo** or **Student Demo** on the Login page, **or**
- Sign in manually:
  - Professor: `professor@university.edu` / `password123`
  - Student: `student@university.edu` / `password123`

### Connecting Live Supabase
Copy `lms-app/.env.example` to `lms-app/.env` and add your Supabase project URL and anon key. See [`SETUP_AND_ROADMAP.md`](./SETUP_AND_ROADMAP.md) for the complete database migration, Auth Hook, Edge Function, and Vercel deployment steps.

---

## Running Tests & Production Build

```bash
cd lms-app
npm test       # Runs 21 unit & property-based tests (100+ iterations each)
npm run build  # TypeScript check + Vite production build
```
