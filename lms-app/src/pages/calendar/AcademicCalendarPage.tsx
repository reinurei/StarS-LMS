import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  X,
} from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { lmsService } from '../../lib/dataService';
import type { Activity, Course } from '../../lib/types';

type EventType = 'activity' | 'course_session';
type CalendarPageTab = 'calendar' | 'weekly_schedule';

interface CalendarEvent {
  id: string;
  title: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  type: EventType;
  date: Date;
  timeLabel: string;
  description: string;
}

interface ParsedScheduleSlot {
  course: Course;
  dayIndex: number; // 1=Mon ... 6=Sat, 0=Sun
  startMinutes: number; // minutes from midnight
  endMinutes: number;
  timeLabel: string;
  colorIndex: number;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_COLUMNS = [
  { dayIndex: 1, label: 'Monday', short: 'Mon' },
  { dayIndex: 2, label: 'Tuesday', short: 'Tue' },
  { dayIndex: 3, label: 'Wednesday', short: 'Wed' },
  { dayIndex: 4, label: 'Thursday', short: 'Thu' },
  { dayIndex: 5, label: 'Friday', short: 'Fri' },
  { dayIndex: 6, label: 'Saturday', short: 'Sat' },
];

const DAY_TOKENS: Array<{ token: RegExp; dayIndex: number }> = [
  { token: /\bsun/i, dayIndex: 0 },
  { token: /\bmon/i, dayIndex: 1 },
  { token: /\btue/i, dayIndex: 2 },
  { token: /\bwed/i, dayIndex: 3 },
  { token: /\bthu/i, dayIndex: 4 },
  { token: /\bfri/i, dayIndex: 5 },
  { token: /\bsat/i, dayIndex: 6 },
];

const SLOT_COLORS = [
  'border-l-4 border-[#7C5CFC] bg-[#EDE9FE] text-[#1E1B4B]',
  'border-l-4 border-blue-500 bg-blue-50 text-blue-950',
  'border-l-4 border-emerald-500 bg-emerald-50 text-emerald-950',
  'border-l-4 border-amber-500 bg-amber-50 text-amber-950',
  'border-l-4 border-pink-500 bg-pink-50 text-pink-950',
];

function parseTimeToMinutes(timeStr: string): number | null {
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const meridiem = m[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + mins;
}

function parseWeeklyCourseSlots(courses: Course[]): ParsedScheduleSlot[] {
  const slots: ParsedScheduleSlot[] = [];

  courses.forEach((course, idx) => {
    const matchedDays = DAY_TOKENS.filter((d) => d.token.test(course.schedule)).map(
      (d) => d.dayIndex,
    );
    const days = matchedDays.length > 0 ? matchedDays : [1];

    const rangeMatch = course.schedule.match(
      /(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
    );
    const singleMatch = course.schedule.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);

    let startMinutes = 9 * 60;
    let endMinutes = 10 * 60 + 30;
    let timeLabel = course.schedule;

    if (rangeMatch) {
      const s = parseTimeToMinutes(rangeMatch[1]);
      const e = parseTimeToMinutes(rangeMatch[2]);
      if (s !== null) startMinutes = s;
      if (e !== null && e > startMinutes) endMinutes = e;
      else endMinutes = startMinutes + 90;
      timeLabel = `${rangeMatch[1].trim()} – ${rangeMatch[2].trim()}`;
    } else if (singleMatch) {
      const s = parseTimeToMinutes(singleMatch[1]);
      if (s !== null) {
        startMinutes = s;
        endMinutes = s + 90;
      }
      timeLabel = singleMatch[1].trim();
    }

    for (const dayIndex of days) {
      slots.push({
        course,
        dayIndex,
        startMinutes,
        endMinutes,
        timeLabel,
        colorIndex: idx,
      });
    }
  });

  return slots.sort((a, b) => a.startMinutes - b.startMinutes);
}

function generateCourseSessionsForMonth(course: Course, year: number, month: number): CalendarEvent[] {
  const matchedDays = DAY_TOKENS.filter((d) => d.token.test(course.schedule)).map((d) => d.dayIndex);
  const days = matchedDays.length > 0 ? matchedDays : [1];
  const timeMatch = course.schedule.match(
    /(\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i,
  );
  const timeLabel = timeMatch ? timeMatch[1] : course.schedule;

  const events: CalendarEvent[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const dt = new Date(year, month, day, 9, 0, 0);
    if (days.includes(dt.getDay())) {
      events.push({
        id: `session-${course.id}-${year}-${month}-${day}`,
        title: `${course.subject_code} Class Session`,
        courseId: course.id,
        courseCode: course.subject_code,
        courseName: course.name,
        type: 'course_session',
        date: dt,
        timeLabel,
        description: `Recurring course session (${course.schedule}). ${course.description}`,
      });
    }
  }
  return events;
}

export default function AcademicCalendarPage() {
  const { user, role } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [pageTab, setPageTab] = useState<CalendarPageTab>('calendar');
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [courseFilter, setCourseFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | EventType>('all');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    if (!user || !role) return;
    async function load() {
      const myCourses = await lmsService.listCourses(user!.id, role!);
      const active = myCourses.filter((c) => !c.is_archived);
      const ids = new Set(active.map((c) => c.id));
      const allActs = await lmsService.listActivities();
      setCourses(active);
      setActivities(allActs.filter((a) => ids.has(a.course_id)));
    }
    load();
  }, [user, role]);

  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth();

  const weeklySlots = useMemo(() => {
    const filtered =
      courseFilter === 'all' ? courses : courses.filter((c) => c.id === courseFilter);
    return parseWeeklyCourseSlots(filtered);
  }, [courses, courseFilter]);

  const allEvents = useMemo<CalendarEvent[]>(() => {
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const activityEvents: CalendarEvent[] = activities.map((act) => {
      const c = courseMap.get(act.course_id);
      const dt = new Date(act.deadline);
      return {
        id: `act-${act.id}`,
        title: act.title,
        courseId: act.course_id,
        courseCode: c?.subject_code ?? '',
        courseName: c?.name ?? 'Course',
        type: 'activity',
        date: dt,
        timeLabel: dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        description: act.instructions,
      };
    });

    const sessionEvents = courses.flatMap((c) => generateCourseSessionsForMonth(c, year, month));

    return [...activityEvents, ...sessionEvents].filter((ev) => {
      if (courseFilter !== 'all' && ev.courseId !== courseFilter) return false;
      if (typeFilter !== 'all' && ev.type !== typeFilter) return false;
      return true;
    });
  }, [courses, activities, year, month, courseFilter, typeFilter]);

  const calendarDays = useMemo(() => {
    if (viewMode === 'week') {
      const start = new Date(cursorDate);
      start.setDate(start.getDate() - start.getDay());
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return { date: d, inMonth: true };
      });
    }

    const firstDayOfMonth = new Date(year, month, 1);
    const startOffset = firstDayOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: Date; inMonth: boolean }> = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month, -i), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const nextDay = cells.length - startOffset - daysInMonth + 1;
      cells.push({ date: new Date(year, month + 1, nextDay), inMonth: false });
    }
    return cells;
  }, [viewMode, cursorDate, year, month]);

  const visibleEventsCount = useMemo(() => {
    const visibleKeys = new Set(calendarDays.map((c) => c.date.toDateString()));
    return allEvents.filter((ev) => visibleKeys.has(ev.date.toDateString())).length;
  }, [calendarDays, allEvents]);

  const shiftPeriod = (dir: -1 | 1) => {
    const next = new Date(cursorDate);
    if (viewMode === 'month') next.setMonth(next.getMonth() + dir);
    else next.setDate(next.getDate() + dir * 7);
    setCursorDate(next);
  };

  const todayDayIndex = new Date().getDay();

  return (
    <div className="space-y-6">
      {/* Header & Top-Level Tabs */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1E1B4B]">Academic Calendar</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Track activity deadlines and view your full weekly course class schedule.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            aria-label="Filter calendar by course"
            className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-medium text-[#1E1B4B]"
          >
            <option value="all">All Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.subject_code} — {c.name}
              </option>
            ))}
          </select>

          {pageTab === 'calendar' && (
            <>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | EventType)}
                aria-label="Filter calendar by event type"
                className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-medium text-[#1E1B4B]"
              >
                <option value="all">All Event Types</option>
                <option value="activity">Activity Deadlines</option>
                <option value="course_session">Course Sessions</option>
              </select>

              <div className="inline-flex rounded-xl border border-[#E5E7EB] bg-white p-1">
                {(['month', 'week'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setViewMode(m)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition cursor-pointer ${
                      viewMode === m ? 'bg-[#7C5CFC] text-white' : 'text-[#6B7280]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mode Switch Tabs: Academic Calendar vs Weekly Course Schedule */}
      <div className="flex flex-wrap gap-2 border-b border-[#E5E7EB] pb-2">
        <button
          type="button"
          onClick={() => setPageTab('calendar')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition cursor-pointer ${
            pageTab === 'calendar'
              ? 'bg-[#7C5CFC] text-white shadow-xs'
              : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#EDE9FE]/50 hover:text-[#7C5CFC]'
          }`}
        >
          <CalendarIcon className="h-4 w-4" />
          Calendar & Deadlines
        </button>

        <button
          type="button"
          onClick={() => setPageTab('weekly_schedule')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition cursor-pointer ${
            pageTab === 'weekly_schedule'
              ? 'bg-[#7C5CFC] text-white shadow-xs'
              : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#EDE9FE]/50 hover:text-[#7C5CFC]'
          }`}
        >
          <CalendarClock className="h-4 w-4" />
          Weekly Course Schedule ({courses.length})
        </button>
      </div>

      {/* TAB 2: WEEKLY COURSE SCHEDULE TIMETABLE */}
      {pageTab === 'weekly_schedule' && (
        <div className="space-y-4">
          {courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D8D4F2] bg-white p-12 text-center">
              <CalendarClock className="mx-auto h-9 w-9 text-[#7C5CFC]" />
              <p className="mt-2 text-sm font-semibold text-[#1E1B4B]">No scheduled courses yet</p>
              <p className="mt-1 text-xs text-[#6B7280]">
                Enroll in courses to view your weekly class timetable here.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              {WEEKDAY_COLUMNS.map((col) => {
                const daySlots = weeklySlots.filter((s) => s.dayIndex === col.dayIndex);
                const isToday = col.dayIndex === todayDayIndex;

                return (
                  <div
                    key={col.dayIndex}
                    className={`flex flex-col rounded-2xl border bg-white p-3.5 shadow-xs ${
                      isToday ? 'border-[#7C5CFC] ring-2 ring-[#7C5CFC]/20' : 'border-[#E5E7EB]'
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between border-b border-[#E5E7EB] pb-2">
                      <span
                        className={`text-sm font-bold ${
                          isToday ? 'text-[#7C5CFC]' : 'text-[#1E1B4B]'
                        }`}
                      >
                        {col.label}
                      </span>
                      {isToday && <Badge variant="primary">Today</Badge>}
                    </div>

                    {daySlots.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-xl bg-[#F5F3FF]/50 py-8 text-center text-xs text-[#9CA3AF]">
                        No classes
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {daySlots.map((slot) => (
                          <Link
                            key={`${slot.course.id}-${slot.dayIndex}`}
                            to={`/courses/${slot.course.id}`}
                            className={`block rounded-xl p-3 transition hover:brightness-95 ${
                              SLOT_COLORS[slot.colorIndex % SLOT_COLORS.length]
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                                {slot.course.subject_code}
                              </span>
                              <ExternalLink className="h-3 w-3 opacity-60" />
                            </div>
                            <p className="mt-1 text-xs font-bold leading-snug">
                              {slot.course.name}
                            </p>
                            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium opacity-80">
                              <Clock className="h-3 w-3 shrink-0" />
                              {slot.timeLabel}
                            </p>
                            <p className="mt-1 text-[10px] opacity-70">{slot.course.semester}</p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 1: ACADEMIC CALENDAR + INLINE DETAIL PANEL */}
      {pageTab === 'calendar' && (
        <div className="grid gap-6 lg:grid-cols-4">
          <div
            className={`rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs ${
              selectedEvent ? 'lg:col-span-3' : 'lg:col-span-4'
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1E1B4B]">
                {cursorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setCursorDate(new Date())}>
                  Today
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => shiftPeriod(-1)}
                  aria-label="Previous period"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => shiftPeriod(1)}
                  aria-label="Next period"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {visibleEventsCount === 0 && (
              <div
                role="status"
                className="mb-4 flex items-center gap-2 rounded-xl border border-[#EDE9FE] bg-[#F5F3FF] px-4 py-3 text-xs font-medium text-[#7C5CFC]"
              >
                <CalendarIcon className="h-4 w-4" />
                No events are available for the selected filter in this period.
              </div>
            )}

            <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[#6B7280]">
              {DAY_NAMES.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map(({ date, inMonth }) => {
                const dayEvents = allEvents.filter(
                  (ev) => ev.date.toDateString() === date.toDateString(),
                );
                const isToday = date.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={date.toISOString()}
                    className={`min-h-[88px] rounded-xl border p-1.5 transition ${
                      inMonth
                        ? 'border-[#E5E7EB] bg-white'
                        : 'border-transparent bg-gray-50/60 opacity-50'
                    } ${isToday ? 'ring-2 ring-[#7C5CFC]/50' : ''}`}
                  >
                    <div
                      className={`mb-1 text-right text-xs font-semibold ${
                        isToday ? 'text-[#7C5CFC]' : 'text-[#6B7280]'
                      }`}
                    >
                      {date.getDate()}
                    </div>

                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => setSelectedEvent(ev)}
                          className={`block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium transition cursor-pointer ${
                            ev.type === 'activity'
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'bg-[#EDE9FE] text-[#7C5CFC] hover:bg-[#DDD6FE]'
                          }`}
                        >
                          {ev.title}
                        </button>
                      ))}
                      {dayEvents.length > 3 && (
                        <p className="pl-1 text-[10px] text-[#6B7280]">
                          +{dayEvents.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedEvent && (
            <aside className="h-fit space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <Badge variant={selectedEvent.type === 'activity' ? 'late' : 'primary'}>
                  {selectedEvent.type === 'activity' ? 'Activity Deadline' : 'Course Session'}
                </Badge>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  aria-label="Close event details"
                  className="rounded-lg p-1 text-[#6B7280] hover:bg-gray-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                <h3 className="text-base font-bold text-[#1E1B4B]">{selectedEvent.title}</h3>
                <p className="mt-1 text-xs font-medium text-[#7C5CFC]">
                  {selectedEvent.courseCode} — {selectedEvent.courseName}
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-[#F5F3FF] px-3 py-2 text-xs text-[#1E1B4B]">
                <Clock className="h-4 w-4 text-[#7C5CFC]" />
                <span>
                  {selectedEvent.date.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}{' '}
                  · {selectedEvent.timeLabel}
                </span>
              </div>

              <p className="text-xs leading-relaxed text-[#4B5563]">
                {selectedEvent.description}
              </p>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
