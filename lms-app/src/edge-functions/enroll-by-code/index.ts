// Supabase Edge Function: POST /enroll-by-code
// Requirements: 4.1, 4.2, 4.3, 4.7
// Validates enrollment code, expiry, max capacity, and duplicate enrollment.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    } = await userClient.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Invalid session', code: 'UNAUTHORIZED' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { enrollmentCode } = (await req.json()) as { enrollmentCode?: string };
    const code = (enrollmentCode ?? '').trim().toUpperCase();

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: course } = await admin
      .from('courses')
      .select('id, name, is_archived, max_enrollment, enrollment_expires_at')
      .eq('enrollment_code', code)
      .maybeSingle();

    if (!course) {
      return new Response(
        JSON.stringify({ error: 'Enrollment code was not recognized.', code: 'INVALID_CODE' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (
      course.is_archived ||
      (course.enrollment_expires_at && new Date(course.enrollment_expires_at) < new Date())
    ) {
      return new Response(
        JSON.stringify({ error: 'This enrollment code has expired.', code: 'EXPIRED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: existing } = await admin
      .from('enrollments')
      .select('id, status')
      .eq('course_id', course.id)
      .eq('student_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'You are already enrolled in this course.', code: 'ALREADY_ENROLLED' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (course.max_enrollment) {
      const { count } = await admin
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', course.id)
        .eq('status', 'active');

      if ((count ?? 0) >= course.max_enrollment) {
        return new Response(
          JSON.stringify({ error: 'This course has reached maximum enrollment capacity.', code: 'CAPACITY_REACHED' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const { data: enrollment, error: insertError } = await admin
      .from('enrollments')
      .insert({
        course_id: course.id,
        student_id: user.id,
        status: 'active',
        enrolled_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message, code: 'INSERT_FAILED' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ enrollment, course }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message, code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
