import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookPlus } from 'lucide-react';
import { Button, Input, Textarea } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { lmsService } from '../../lib/dataService';
import { toast } from '../../lib/toast';
import { courseSchema } from '../../lib/validators';

export default function CourseCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState('');
  const [semester, setSemester] = useState('1st Semester');
  const [academicYear, setAcademicYear] = useState('2026-2027');
  const [maxEnrollment, setMaxEnrollment] = useState('45');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrors({});

    const parsedMax = maxEnrollment.trim() === '' ? null : Number(maxEnrollment);
    const parsed = courseSchema.safeParse({
      name,
      subject_code: subjectCode,
      description,
      schedule,
      semester,
      academic_year: academicYear,
      max_enrollment: Number.isNaN(parsedMax) ? -1 : parsedMax,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      const created = await lmsService.createCourse(user.id, {
        name: parsed.data.name,
        subject_code: parsed.data.subject_code,
        description: parsed.data.description,
        schedule: parsed.data.schedule,
        semester: parsed.data.semester,
        academic_year: parsed.data.academic_year,
        max_enrollment: parsed.data.max_enrollment ?? null,
      });
      toast.success(
        `Course created! Enrollment code: ${created.enrollment_code}`,
      );
      navigate(`/courses/${created.id}`);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create course.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to="/courses"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B7280] hover:text-[#7C5CFC]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Courses
      </Link>

      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 sm:p-8 shadow-xs">
        <div className="flex items-center gap-3 pb-5 border-b border-[#E5E7EB]">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EDE9FE] text-[#7C5CFC]">
            <BookPlus className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#1E1B4B]">Create New Course</h1>
            <p className="text-xs text-[#6B7280]">
              A unique 8-character enrollment code will be generated automatically.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Input
                label="Course Name"
                placeholder="e.g. Introduction to Artificial Intelligence"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errors.name}
                helperText={`${name.length}/150 characters`}
              />
            </div>
            <Input
              label="Subject Code"
              placeholder="e.g. CS410"
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value.toUpperCase())}
              error={errors.subject_code}
              helperText="3–10 alphanumeric"
            />
          </div>

          <Textarea
            label="Course Description"
            rows={4}
            placeholder="Describe course objectives, prerequisites, and key topics..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={errors.description}
            helperText={`${description.length}/1000 characters`}
          />

          <Input
            label="Class Schedule"
            placeholder="e.g. Tue & Thu, 10:00 AM - 11:30 AM"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            error={errors.schedule}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#1E1B4B]">Semester</label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="block w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1E1B4B] focus:border-[#7C5CFC] focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/25"
              >
                <option value="1st Semester">1st Semester</option>
                <option value="2nd Semester">2nd Semester</option>
                <option value="Summer Term">Summer Term</option>
              </select>
            </div>
            <Input
              label="Academic Year"
              placeholder="2026-2027"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              error={errors.academic_year}
            />
            <Input
              label="Max Enrollment"
              type="number"
              min={1}
              placeholder="45"
              value={maxEnrollment}
              onChange={(e) => setMaxEnrollment(e.target.value)}
              error={errors.max_enrollment}
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-[#E5E7EB]">
            <Link to="/courses">
              <Button variant="ghost">Cancel</Button>
            </Link>
            <Button type="submit" isLoading={submitting}>
              Create Course
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
