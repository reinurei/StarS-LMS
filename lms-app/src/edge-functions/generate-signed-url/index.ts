// Supabase Edge Function: POST /generate-signed-url
// Requirements: 5.3, 6.7, 15.3
// Authenticates caller, verifies course/bucket authorization, returns { signedUrl, expiresAt }
// Rejects unauthenticated/unauthorized callers with HTTP 403.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_BUCKETS = new Set(['avatars', 'materials', 'submissions']);

interface SignedUrlRequest {
  bucket?: string;
  objectPath: string;
  expiresIn?: number;
  mode?: 'download' | 'upload';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required', code: 'UNAUTHORIZED' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session', code: 'FORBIDDEN' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = (await req.json()) as SignedUrlRequest;
    const bucket = body.bucket ?? 'materials';
    const objectPath = body.objectPath?.trim();
    const expiresIn = Math.min(Math.max(Number(body.expiresIn ?? 3600), 60), 86400);
    const mode = body.mode ?? 'download';

    if (!ALLOWED_BUCKETS.has(bucket) || !objectPath) {
      return new Response(
        JSON.stringify({ error: 'Invalid bucket or objectPath', code: 'BAD_REQUEST' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const segments = objectPath.split('/');
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Authorization checks per bucket path layout
    let authorized = false;
    if (bucket === 'avatars') {
      authorized = mode === 'download' || segments[0] === user.id;
    } else if (bucket === 'materials') {
      const courseId = segments[0];
      const { data: course } = await adminClient
        .from('courses')
        .select('professor_id')
        .eq('id', courseId)
        .single();

      if (course?.professor_id === user.id) {
        authorized = true;
      } else if (mode === 'download') {
        const { data: enrollment } = await adminClient
          .from('enrollments')
          .select('id')
          .eq('course_id', courseId)
          .eq('student_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        authorized = !!enrollment;
      }
    } else if (bucket === 'submissions') {
      const courseId = segments[0];
      const studentId = segments[2];
      if (studentId === user.id) {
        authorized = true;
      } else if (mode === 'download') {
        const { data: course } = await adminClient
          .from('courses')
          .select('professor_id')
          .eq('id', courseId)
          .single();
        authorized = course?.professor_id === user.id;
      }
    }

    if (!authorized) {
      return new Response(
        JSON.stringify({ error: 'Access denied to requested object', code: 'FORBIDDEN' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (mode === 'upload') {
      const { data, error } = await adminClient.storage
        .from(bucket)
        .createSignedUploadUrl(objectPath);

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: error?.message ?? 'Failed to create upload URL', code: 'STORAGE_ERROR' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      return new Response(
        JSON.stringify({ signedUrl: data.signedUrl, token: data.token, path: data.path, expiresAt }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data, error } = await adminClient.storage
      .from(bucket)
      .createSignedUrl(objectPath, expiresIn);

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: error?.message ?? 'Failed to create signed URL', code: 'STORAGE_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return new Response(
      JSON.stringify({ signedUrl: data.signedUrl, expiresAt }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message, code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
