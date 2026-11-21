// Supabase Edge Function: POST /invite-student
// Requirements: 4.4, 4.5, 4.6
// Creates a pending enrollment record with a 7-day expiry and triggers an invitation notification/email.

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

    const { courseId, studentEmail } = (await req.json()) as {
      courseId: string;
      studentEmail: string;
    };

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: course } = await admin
      .from('courses')
      .select('id, name, professor_id')
      .eq('id', courseId)
      .single();

    if (!course || course.professor_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Course not found or unauthorized', code: 'FORBIDDEN' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: student } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .ilike('email', studentEmail.trim())
      .eq('role', 'student')
      .maybeSingle();

    if (!student) {
      return new Response(
        JSON.stringify({
          error: 'Invitation delivery failed: no registered student account found for that email.',
          code: 'DELIVERY_FAILED',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data: enrollment, error: insertError } = await admin
      .from('enrollments')
      .insert({
        course_id: courseId,
        student_id: student.id,
        status: 'pending',
        invited_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message, code: 'INSERT_FAILED' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await admin.from('notifications').insert({
      recipient_id: student.id,
      type: 'course_invitation',
      title: `Course Invitation: ${course.name}`,
      body: `You have been invited to join ${course.name}. Accept within 7 days.`,
      metadata: { course_id: courseId, enrollment_id: enrollment.id },
    });

    return new Response(JSON.stringify({ enrollment, delivered: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message, code: 'DELIVERY_FAILED' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
