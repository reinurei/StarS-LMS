-- Migration: Custom Access Token Hook
-- Injects `user_role` from app_metadata (or public.profiles) into JWT claims
-- WITHOUT overwriting PostgREST's top-level `role` ("authenticated") claim.

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

  -- Inject into custom top-level claim `user_role` (NEVER overwrite `role` which PostgREST needs as 'authenticated')
  claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role), true);

  -- Ensure app_metadata.role is always present for frontend useAuth()
  IF claims -> 'app_metadata' IS NULL THEN
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb, true);
  END IF;
  claims := jsonb_set(claims, '{app_metadata, role}', to_jsonb(user_role), true);

  event := jsonb_set(event, '{claims}', claims, true);
  RETURN event;
END;
$$;

-- Required permissions for Supabase Auth to discover and invoke the hook
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

GRANT EXECUTE
  ON FUNCTION public.custom_access_token_hook(jsonb)
  TO supabase_auth_admin;

GRANT SELECT
  ON TABLE public.profiles
  TO supabase_auth_admin;

REVOKE EXECUTE
  ON FUNCTION public.custom_access_token_hook(jsonb)
  FROM authenticated, anon, public;
