import { Link } from 'react-router-dom';
import type { Course } from '../../lib/types';

export const COURSE_CARD_GRADIENTS = [
  'from-[#818CF8] via-[#7C5CFC] to-[#A78BFA]',
  'from-[#60A5FA] via-[#38BDF8] to-[#818CF8]',
  'from-[#F472B6] via-[#FB923C] to-[#FBBF24]',
  'from-[#34D399] via-[#10B981] to-[#38BDF8]',
];

export interface StudentCourseCardProps {
  course: Course;
  attendancePct: number;
  viewedModules: number;
  totalModules: number;
  colorIndex?: number;
}

/**
 * Unified Student Course Card used identically on both the Student Dashboard
 * and the Student Courses tab. Displays the professor's selected cover image
 * (when set) or a vibrant gradient fallback, schedule, and module attendance bar.
 */
export function StudentCourseCard({
  course,
  attendancePct,
  viewedModules,
  totalModules,
  colorIndex = 0,
}: StudentCourseCardProps) {
  const gradient = COURSE_CARD_GRADIENTS[colorIndex % COURSE_CARD_GRADIENTS.length];

  return (
    <Link
      to={`/courses/${course.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div
        className={`relative flex h-32 flex-col justify-between bg-gradient-to-br p-4 text-white overflow-hidden ${gradient}`}
      >
        {course.cover_image_url && (
          <>
            <img
              src={course.cover_image_url}
              alt={`${course.name} cover`}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1E1B4B]/80 via-[#1E1B4B]/35 to-black/20" />
          </>
        )}

        <div className="relative z-10 flex items-center justify-between gap-2">
          <span className="w-fit rounded-lg bg-white/25 px-2.5 py-0.5 text-xs font-bold backdrop-blur-xs">
            {course.subject_code}
          </span>
          <span className="rounded-md bg-black/20 px-2 py-0.5 text-[10px] font-medium backdrop-blur-xs">
            {course.semester}
          </span>
        </div>

        <h3 className="relative z-10 text-base font-bold leading-snug drop-shadow-xs line-clamp-2">
          {course.name}
        </h3>
      </div>

      <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
        <p className="text-xs text-[#6B7280]">{course.schedule}</p>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-[#6B7280]">Module Attendance</span>
            <span className="font-semibold text-[#7C5CFC]">
              {viewedModules}/{totalModules} ({attendancePct}%)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#EDE9FE]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#6366F1]"
              style={{ width: `${Math.min(100, attendancePct)}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
