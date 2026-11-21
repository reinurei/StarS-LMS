// Supabase Edge Function: POST /export-report
// Requirements: 8.6, 12.4
// Streams CSV or XLSX (SpreadsheetML/Excel-compatible) using Streams API for up to 10,000 rows.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportReportRequest {
  courseId: string;
  format: 'csv' | 'xlsx';
  filters?: {
    studentId?: string;
    moduleId?: string;
    dateRange?: [string, string];
    semester?: string;
  };
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
    } = await userClient.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Invalid session', code: 'FORBIDDEN' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { courseId, format = 'csv', filters = {} } = (await req.json()) as ExportReportRequest;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify professor owns course
    const { data: course } = await adminClient
      .from('courses')
      .select('id, name, subject_code, professor_id')
      .eq('id', courseId)
      .single();

    if (!course || course.professor_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Course not found or access denied', code: 'FORBIDDEN' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch enrolled students, modules, attendance records, activities, submissions
    let enrollQuery = adminClient
      .from('enrollments')
      .select('student_id, profiles(id, full_name, email)')
      .eq('course_id', courseId)
      .eq('status', 'active')
      .limit(10000);

    if (filters.studentId) {
      enrollQuery = enrollQuery.eq('student_id', filters.studentId);
    }

    const [{ data: enrollments }, { data: modules }, { data: attendance }, { data: activities }, { data: submissions }] =
      await Promise.all([
        enrollQuery,
        adminClient.from('modules').select('id, name').eq('course_id', courseId).order('display_order'),
        adminClient.from('attendance_records').select('*').eq('course_id', courseId),
        adminClient.from('activities').select('id, title').eq('course_id', courseId).order('created_at'),
        adminClient
          .from('submissions')
          .select('activity_id, student_id, grade, status')
          .in(
            'activity_id',
            (await adminClient.from('activities').select('id').eq('course_id', courseId)).data?.map((a) => a.id) ?? [],
          ),
      ]);

    const totalModules = (modules ?? []).length;
    const activityList = activities ?? [];
    const headerRow = [
      'Student Name',
      'Student ID',
      'Email',
      ...activityList.map((a) => a.title),
      'Attendance %',
    ];

    const rows = (enrollments ?? []).map((enr) => {
      const profile = Array.isArray(enr.profiles) ? enr.profiles[0] : enr.profiles;
      const studentId = enr.student_id as string;
      const studentAtt = (attendance ?? []).filter(
        (r) =>
          r.student_id === studentId &&
          (!filters.moduleId || r.module_id === filters.moduleId) &&
          (r.status === 'present' || r.status === 'excused'),
      );
      const attPct =
        totalModules === 0 ? 0 : Math.round((studentAtt.length / totalModules) * 10000) / 100;

      const grades = activityList.map((act) => {
        const sub = (submissions ?? []).find(
          (s) => s.activity_id === act.id && s.student_id === studentId,
        );
        if (!sub) return 'Missing';
        if (sub.grade === null || sub.grade === undefined) return 'Pending';
        return String(sub.grade);
      });

      return [profile?.full_name ?? 'Unknown', studentId, profile?.email ?? '', ...grades, `${attPct}%`];
    });

    const filename = `${course.subject_code}-report.${format === 'xlsx' ? 'xls' : 'csv'}`;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        if (format === 'xlsx') {
          controller.enqueue(
            encoder.encode(
              '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table>',
            ),
          );
          const emitRow = (cells: string[]) => {
            const xml =
              '<Row>' +
              cells
                .map(
                  (c) =>
                    `<Cell><Data ss:Type="String">${String(c).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Data></Cell>`,
                )
                .join('') +
              '</Row>';
            controller.enqueue(encoder.encode(xml));
          };
          emitRow(headerRow);
          for (const r of rows) emitRow(r);
          controller.enqueue(encoder.encode('</Table></Worksheet></Workbook>'));
        } else {
          controller.enqueue(encoder.encode(headerRow.map(escapeCsvCell).join(',') + '\n'));
          for (const r of rows) {
            controller.enqueue(encoder.encode(r.map(escapeCsvCell).join(',') + '\n'));
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': format === 'xlsx' ? 'application/vnd.ms-excel' : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message, code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
