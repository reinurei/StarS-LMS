# StarS LMS — Backend Setup & Continuation Guide

This guide walks you step by step through configuring your live **Supabase backend** (PostgreSQL database, Auth, Custom JWT Role Claims, Private Storage buckets, Edge Functions, Realtime Direct Messaging, and Scheduled Reminders) and provides a clear roadmap for deploying and expanding **StarS LMS**.

---

## Part 1: Step-by-Step Supabase Backend Configuration

### Step 1: Create a Free Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and click **New Project** (Free Tier).
2. Choose a strong database password and save it securely.
3. Once provisioned, open **Project Settings → API** and copy:
   - **Project URL** (`https://<your-project-ref>.supabase.co`)
   - **anon / public key**
   - **service_role key** *(keep secret — used only inside Supabase Edge Functions)*

---

### Step 2: Apply All 7 Database Migrations
Apply the migrations using either the **Supabase CLI** (recommended) or the **Supabase Dashboard SQL Editor**.

#### Option A — Using Supabase CLI (Recommended)
Run from the project root (`LMS/`):
```powershell
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --remote
```

#### Option B — Manually in Supabase Dashboard → SQL Editor
Run each file in `supabase/migrations/` in exact numerical order:
1. `supabase/migrations/20240101000001_initial_schema.sql` — Creates all 18 core tables, constraints, `UNIQUE (module_id, student_id)` on `attendance_records`, and the 100-notification cap trigger.
2. `supabase/migrations/20240101000002_rls_policies.sql` — Enables Row Level Security (RLS) on every table and creates Professor/Student policies.
3. `supabase/migrations/20240101000003_auth_hook.sql` — Creates `public.custom_access_token_hook(event jsonb)` with required `supabase_auth_admin` grants to inject `user_role` and `app_metadata.role` into JWT claims (while preserving PostgREST's top-level `role = 'authenticated'`).
4. `supabase/migrations/20240101000004_storage_buckets.sql` — Creates private Storage buckets (`avatars`, `materials`, `submissions`) and storage RLS policies.
5. `supabase/migrations/20240101000005_auth_lockout.sql` — Creates account lockout helper functions (`handle_failed_login`, `reset_login_attempts`).
6. `supabase/migrations/20240101000006_notifications_triggers.sql` — Creates notification fan-out triggers, `send_24h_deadline_reminders()`, and `record_module_view_attendance()` RPC.
7. `supabase/migrations/20240101000007_social_chat_and_profile_enhancements.sql` — Adds `courses.cover_image_url`, extended `profiles` fields (`activity_status`, `program_course`, `social_links`), peer profile read policy, and the `direct_messages` table with RLS policies.

---

### Step 3: Create & Enable the Custom Access Token Hook (RBAC)

If you ran `supabase db push` or `20240101000003_auth_hook.sql` in Step 2, the function is already created. If `public.custom_access_token_hook` does not appear in the Hooks dropdown yet, run this SQL in **SQL Editor** (make sure `public.profiles` from `000001_initial_schema.sql` exists first):

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims    jsonb;
  user_role text;
BEGIN
  claims := event -> 'claims';

  -- 1. Prefer server-authoritative role in app_metadata
  user_role := claims -> 'app_metadata' ->> 'role';

  -- 2. Fallback to public.profiles if app_metadata.role isn't set yet
  IF user_role IS NULL THEN
    SELECT p.role INTO user_role
    FROM public.profiles p
    WHERE p.id = (event ->> 'user_id')::uuid;
  END IF;

  -- 3. Default to 'student' if still null
  user_role := COALESCE(user_role, 'student');

  -- Inject into custom claim `user_role` (keep PostgREST's top-level `role = 'authenticated'` intact)
  claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role), true);

  IF claims -> 'app_metadata' IS NULL THEN
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb, true);
  END IF;
  claims := jsonb_set(claims, '{app_metadata, role}', to_jsonb(user_role), true);

  event := jsonb_set(event, '{claims}', claims, true);
  RETURN event;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
```

Then enable the hook in the dashboard:
1. In Supabase Dashboard, go to **Authentication → Hooks** (refresh the page if needed).
2. Under **Customize Access Token (JWT) Claims**, choose **Postgres Function** → `public.custom_access_token_hook`.
3. Click **Save**.

Whenever a user signs in, their LMS role (`professor` or `student`) is injected into `user_role` and `app_metadata.role` in the JWT for both frontend `RoleGuard` and database RLS enforcement.

---

### Step 4: Add Auto-Profile Trigger & Seed Initial Accounts
Run this trigger in **SQL Editor** so every newly created auth user automatically gets a `public.profiles` row (with default `active` status and empty links array):

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, activity_status, social_links)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_app_meta_data ->> 'role', NEW.raw_user_meta_data ->> 'role', 'student'),
    'active',
    '[]'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

Next, create your initial Professor and Student accounts under **Authentication → Users → Add user**, then assign their authoritative roles in **SQL Editor**:

```sql
-- Assign Professor role
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"professor"}'::jsonb
WHERE email = 'professor@university.edu';

UPDATE public.profiles
SET role = 'professor', program_course = 'Computer Science Department'
WHERE email = 'professor@university.edu';

-- Assign Student role
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"student"}'::jsonb
WHERE email = 'student@university.edu';

UPDATE public.profiles
SET role = 'student', program_course = 'BS Computer Science'
WHERE email = 'student@university.edu';
```

---

### Step 5: Deploy Supabase Edge Functions
Copy the Edge Functions from `lms-app/src/edge-functions/` into `supabase/functions/` and deploy them:

```powershell
Copy-Item -Recurse -Force lms-app\src\edge-functions\* supabase\functions\
supabase functions deploy generate-signed-url
supabase functions deploy export-report
supabase functions deploy enroll-by-code
supabase functions deploy invite-student
supabase functions deploy auth-hook
```

Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions.

---

### Step 6: Enable Realtime & Schedule 24-Hour Deadline Reminders
1. **Realtime Replication**: Go to **Database → Replication** and enable Realtime for:
   - `notifications`
   - `direct_messages`
   - `forum_threads`
   - `forum_posts`
2. **Auth Redirect URLs**: Go to **Authentication → URL Configuration** and add:
   - Site URL: `http://localhost:5173` *(update to your Vercel URL when deployed)*
   - Redirect URL: `http://localhost:5173/auth/reset-password/confirm`
3. **24-Hour Deadline Reminder Scheduler**: Go to **Database → Extensions**, enable **`pg_cron`**, then run in **SQL Editor**:

```sql
SELECT cron.schedule(
  'stars-lms-24h-deadline-reminders',
  '0 * * * *',
  $$SELECT public.send_24h_deadline_reminders();$$
);
```

---

### Step 7: Connect the Frontend (`lms-app/.env`)
1. Copy `lms-app/.env.example` to `lms-app/.env`:
   ```env
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
   ```
2. Start (or restart) the dev server:
   ```powershell
   cd lms-app
   npm run dev
   ```
   Once valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values are present, StarS LMS automatically switches from local **Demo Mode** to your live **Supabase backend**.

---

## Part 2: Post-Setup Smoke Test Checklist

After connecting `.env`, verify these flows end-to-end:
- [ ] **Auth & Roles**: Log in as Professor and as Student; confirm Professor sees **Analytics & Reports** and **Create Course**, while Student sees **Enroll with Code**.
- [ ] **Course Cover & Semester**: In Professor → Courses, move a course between `1st Semester` and `2nd Semester`; open **Edit Course** and upload a course overview picture.
- [ ] **Enrollment & Module Attendance**: Enroll the Student using the 8-character course code → open a Module → confirm `Present` attendance is automatically recorded.
- [ ] **Weekly Schedule**: As Student, open **Calendar → Weekly Course Schedule** tab and verify enrolled courses appear on their scheduled weekdays.
- [ ] **Profiles & Direct Chat**: As Student, edit **Activity Status** (`Active`, `Idle`, `Do not disturb`, `Offline`), **Course/Program**, and **Links** → switch to Professor, open that Student's profile from the course roster, verify all changes are visible, and click **Chat** to send a direct message.
- [ ] **AI Assistant**: Open the floating **AI & Chat** hub → ask *"What are the latest updates?"* or *"Upcoming deadlines & quizzes"*.
- [ ] **Quizzes & Reports**: Create a timed quiz, take it as Student to verify auto-grading, and export a CSV/Excel report from **Analytics & Reports**.

---

## Part 3: Guidelines & Roadmap to Continue This Project

1. **Deploy Frontend to Vercel (Free Hobby Tier)**
   - Push the repository to GitHub.
   - Import the repo in [Vercel](https://vercel.com):
     - **Root Directory**: `lms-app`
     - **Build Command**: `npm run build`
     - **Output Directory**: `dist`
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel Project Settings → Environment Variables.
   - Update Supabase **Authentication → URL Configuration** with your live `https://<your-app>.vercel.app` domain.

2. **Optional: Upgrade AI Chatbot to a Live LLM**
   - Currently, `lmsService.askAiAssistant` answers directly from live course, announcement, deadline, attendance, and grade data at zero API cost.
   - To add generative Q&A (e.g. Gemini API), add a `supabase/functions/ai-tutor/index.ts` Edge Function storing your API key in Supabase Secrets (`supabase secrets set GEMINI_API_KEY=...`) and pass the student's course summary as context.

3. **Performance & Bundle Splitting**
   - Convert page imports in `lms-app/src/App.tsx` to `React.lazy()` + `<Suspense>`.
   - Dynamically import `xlsx` inside `lms-app/src/lib/reportExport.ts` on button click to shrink initial load size.

4. **Testing & Quality Gates**
   - Run `npm --prefix lms-app test` (21 unit + `fast-check` property tests) and `npm --prefix lms-app run build` before every commit.
   - Add Playwright E2E tests for critical Professor + Student journeys once deployed to a staging Supabase project.

5. **Ideas for Future Features**
   - Student self-registration / Admin user management panel.
   - Rubric-based grading and bulk CSV grade import.
   - Drag-and-drop module ordering and draft/published toggle.
   - Typing indicators and unread badge counter on the **Messages** tab in `ChatWidget.tsx`.
