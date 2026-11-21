-- =============================================================================
-- LMS Platform — Auth Lockout Helper
-- Requirements: 1.2
--
-- This migration provides:
--   1. handle_failed_login(user_id uuid)  — increments failed_attempts in
--      app_metadata and sets locked_until after 5 failures within 15 minutes.
--   2. reset_login_attempts(user_id uuid) — clears the lockout on success.
--
-- Both functions use the Supabase admin HTTP API (net extension) so that they
-- can update auth.users.app_metadata from a plain PostgreSQL function without
-- requiring direct writes to the auth schema (which is owned by supabase).
--
-- NOTE: In the primary architecture (design.md), the failed-login logic lives
-- in the supabase/functions/auth-hook Edge Function.  These SQL functions exist
-- as an alternative / fallback that can be called from a Postgres trigger or
-- an Edge Function that prefers a DB-centric approach.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Ensure required extensions are present
-- ---------------------------------------------------------------------------
-- Native gen_random_uuid() is available in Postgres 13+ without uuid-ossp.

-- pg_net is required for HTTP calls from SQL functions.
-- It is pre-installed on Supabase Cloud; on local dev run:
--   supabase db execute "create extension if not exists pg_net;"
CREATE EXTENSION IF NOT EXISTS "pg_net" SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- handle_failed_login
-- ---------------------------------------------------------------------------
-- Reads the current app_metadata for `user_id`, increments failed_attempts,
-- and writes locked_until = now + 15 minutes when >= 5 failures occur within
-- a 15-minute window.
--
-- Parameters:
--   user_id  uuid  – the auth.users.id of the user who failed to log in
--
-- Returns:
--   BOOLEAN  – TRUE if the account is now locked, FALSE otherwise
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_failed_login(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_app_metadata       jsonb;
  v_failed_attempts    int;
  v_start_ts           timestamptz;
  v_locked_until       timestamptz;
  v_now                timestamptz := now();
  v_window_minutes     constant int := 15;
  v_max_attempts       constant int := 5;
  v_lockout_minutes    constant int := 15;
  v_account_locked     boolean := false;
  v_supabase_url       text;
  v_service_role_key   text;
  v_patch_body         jsonb;
BEGIN
  -- -------------------------------------------------------------------------
  -- Read current app_metadata from auth.users
  -- The auth schema is readable by SECURITY DEFINER functions owned by postgres
  -- -------------------------------------------------------------------------
  SELECT raw_app_meta_data
  INTO   v_app_metadata
  FROM   auth.users
  WHERE  id = user_id;

  IF NOT FOUND THEN
    -- Unknown user — nothing to do
    RETURN false;
  END IF;

  v_app_metadata    := COALESCE(v_app_metadata, '{}'::jsonb);
  v_failed_attempts := COALESCE((v_app_metadata ->> 'failed_attempts')::int, 0);
  v_start_ts        := (v_app_metadata ->> 'failed_attempts_start')::timestamptz;
  v_locked_until    := (v_app_metadata ->> 'locked_until')::timestamptz;

  -- -------------------------------------------------------------------------
  -- Short-circuit: account is already locked
  -- -------------------------------------------------------------------------
  IF v_locked_until IS NOT NULL AND v_locked_until > v_now THEN
    RETURN true;
  END IF;

  -- -------------------------------------------------------------------------
  -- Determine whether this failure falls inside the existing window
  -- -------------------------------------------------------------------------
  IF v_start_ts IS NULL OR
     EXTRACT(EPOCH FROM (v_now - v_start_ts)) / 60 > v_window_minutes THEN
    -- Window has expired or never started — reset the counter
    v_failed_attempts := 1;
    v_start_ts        := v_now;
    v_locked_until    := NULL;
  ELSE
    v_failed_attempts := v_failed_attempts + 1;
  END IF;

  -- -------------------------------------------------------------------------
  -- Lock the account if the threshold is crossed
  -- -------------------------------------------------------------------------
  IF v_failed_attempts >= v_max_attempts THEN
    v_locked_until   := v_now + (v_lockout_minutes || ' minutes')::interval;
    v_account_locked := true;
  END IF;

  -- -------------------------------------------------------------------------
  -- Build the updated app_metadata patch
  -- -------------------------------------------------------------------------
  v_patch_body := jsonb_build_object(
    'app_metadata', jsonb_build_object(
      'role',                   v_app_metadata ->> 'role',
      'failed_attempts',        v_failed_attempts,
      'failed_attempts_start',  to_char(v_start_ts AT TIME ZONE 'UTC',
                                        'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'locked_until',           CASE
                                  WHEN v_locked_until IS NOT NULL
                                  THEN to_char(v_locked_until AT TIME ZONE 'UTC',
                                               'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                  ELSE NULL
                                END
    )
  );

  -- -------------------------------------------------------------------------
  -- Read Supabase connection details from vault / GUC
  -- Expects app settings stored in Postgres GUC:
  --   ALTER DATABASE postgres SET app.supabase_url = '...';
  --   ALTER DATABASE postgres SET app.supabase_service_role_key = '...';
  -- These are set automatically in Supabase Cloud via the dashboard secrets.
  -- -------------------------------------------------------------------------
  BEGIN
    v_supabase_url     := current_setting('app.supabase_url');
    v_service_role_key := current_setting('app.supabase_service_role_key');
  EXCEPTION WHEN undefined_object THEN
    -- GUC not set — fall back to direct auth.users update (requires
    -- SECURITY DEFINER ownership by a superuser or service_role)
    UPDATE auth.users
    SET    raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
             'failed_attempts',       v_failed_attempts,
             'failed_attempts_start', to_char(v_start_ts AT TIME ZONE 'UTC',
                                              'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'locked_until',          CASE
                                        WHEN v_locked_until IS NOT NULL
                                        THEN to_char(v_locked_until AT TIME ZONE 'UTC',
                                                     'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                        ELSE NULL
                                      END
           )
    WHERE  id = user_id;

    RETURN v_account_locked;
  END;

  -- -------------------------------------------------------------------------
  -- Call Supabase Admin API via pg_net (async HTTP)
  -- PUT /auth/v1/admin/users/{user_id}
  -- -------------------------------------------------------------------------
  PERFORM extensions.http_post(
    url     := v_supabase_url || '/auth/v1/admin/users/' || user_id::text,
    body    := v_patch_body::text,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        v_service_role_key,
      'Authorization', 'Bearer ' || v_service_role_key
    )
  );

  RETURN v_account_locked;
END;
$$;

-- ---------------------------------------------------------------------------
-- reset_login_attempts
-- ---------------------------------------------------------------------------
-- Called after a successful login to clear the failed-attempts counter and
-- any active lockout on the user's account.
--
-- Parameters:
--   user_id  uuid  – the auth.users.id of the user who logged in successfully
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_login_attempts(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_app_metadata     jsonb;
  v_supabase_url     text;
  v_service_role_key text;
  v_patch_body       jsonb;
BEGIN
  -- Read current metadata
  SELECT raw_app_meta_data
  INTO   v_app_metadata
  FROM   auth.users
  WHERE  id = user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_app_metadata := COALESCE(v_app_metadata, '{}'::jsonb);

  -- Nothing to reset
  IF (v_app_metadata ->> 'failed_attempts')::int IS NULL OR
     (v_app_metadata ->> 'failed_attempts')::int = 0 THEN
    RETURN;
  END IF;

  v_patch_body := jsonb_build_object(
    'app_metadata', jsonb_build_object(
      'role',                  v_app_metadata ->> 'role',
      'failed_attempts',       0,
      'failed_attempts_start', NULL,
      'locked_until',          NULL
    )
  );

  BEGIN
    v_supabase_url     := current_setting('app.supabase_url');
    v_service_role_key := current_setting('app.supabase_service_role_key');
  EXCEPTION WHEN undefined_object THEN
    -- Direct update fallback
    UPDATE auth.users
    SET    raw_app_meta_data = raw_app_meta_data
                               || '{"failed_attempts":0,"failed_attempts_start":null,"locked_until":null}'::jsonb
    WHERE  id = user_id;

    RETURN;
  END;

  PERFORM extensions.http_post(
    url     := v_supabase_url || '/auth/v1/admin/users/' || user_id::text,
    body    := v_patch_body::text,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        v_service_role_key,
      'Authorization', 'Bearer ' || v_service_role_key
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
-- Grant to supabase_auth_admin so the hook can invoke these functions.
GRANT EXECUTE ON FUNCTION public.handle_failed_login(uuid)  TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.reset_login_attempts(uuid) TO supabase_auth_admin;

-- Revoke from public and authenticated roles (called only server-side)
REVOKE EXECUTE ON FUNCTION public.handle_failed_login(uuid)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_failed_login(uuid)  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_login_attempts(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_login_attempts(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION public.handle_failed_login(uuid) IS
  'Increments failed_attempts in app_metadata on each failed login. '
  'Locks the account for 15 minutes after 5 failures within a 15-minute '
  'window by setting locked_until. Returns TRUE when the account is locked.';

COMMENT ON FUNCTION public.reset_login_attempts(uuid) IS
  'Clears failed_attempts, failed_attempts_start, and locked_until from '
  'app_metadata after a successful login.';
