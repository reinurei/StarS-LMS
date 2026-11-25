import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthGuard, IdleTimeoutProvider, RoleGuard } from './components/guards';
import { AppShell } from './components/layout/AppShell';
import { ToastContainer } from './components/ui';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { queryClient } from './lib/queryClient';

// Pages
import LoginPage from './pages/auth/LoginPage';
import PasswordResetConfirmPage from './pages/auth/PasswordResetConfirmPage';
import PasswordResetRequestPage from './pages/auth/PasswordResetRequestPage';
import ProfessorDashboard from './pages/dashboard/ProfessorDashboard';
import StudentDashboard from './pages/dashboard/StudentDashboard';
import CourseCreatePage from './pages/courses/CourseCreatePage';
import CourseDetailPage from './pages/courses/CourseDetailPage';
import CourseListPage from './pages/courses/CourseListPage';
import ModuleViewPage from './pages/materials/ModuleViewPage';
import ActivityCreatePage from './pages/activities/ActivityCreatePage';
import ActivityDetailPage from './pages/activities/ActivityDetailPage';
import ActivityListPage from './pages/activities/ActivityListPage';
import AttendanceHistoryPage from './pages/attendance/AttendanceHistoryPage';
import StudentAttendancePage from './pages/attendance/StudentAttendancePage';
import GradeBookPage from './pages/grades/GradeBookPage';
import StudentGradesPage from './pages/grades/StudentGradesPage';
import ForumListPage from './pages/forums/ForumListPage';
import ThreadViewPage from './pages/forums/ThreadViewPage';
import AcademicCalendarPage from './pages/calendar/AcademicCalendarPage';
import AnalyticsDashboardPage from './pages/reports/AnalyticsDashboardPage';
import ProfilePage from './pages/profile/ProfilePage';

function DashboardSwitch() {
  const { role } = useAuth();
  return role === 'professor' ? <ProfessorDashboard /> : <StudentDashboard />;
}

function AttendanceSwitch() {
  const { role } = useAuth();
  return role === 'professor' ? <AttendanceHistoryPage /> : <StudentAttendancePage />;
}

function GradesSwitch() {
  const { role } = useAuth();
  return role === 'professor' ? <GradeBookPage /> : <StudentGradesPage />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/signup" element={<LoginPage initialMode="signup" />} />
            <Route path="/auth/reset-password" element={<PasswordResetRequestPage />} />
            <Route path="/auth/reset-password/confirm" element={<PasswordResetConfirmPage />} />

            {/* Protected App Routes */}
            <Route
              element={
                <AuthGuard>
                  <IdleTimeoutProvider>
                    <AppShell />
                  </IdleTimeoutProvider>
                </AuthGuard>
              }
            >
              <Route path="/dashboard" element={<DashboardSwitch />} />
              <Route path="/courses" element={<CourseListPage />} />
              <Route
                path="/courses/new"
                element={
                  <RoleGuard requiredRole="professor">
                    <CourseCreatePage />
                  </RoleGuard>
                }
              />
              <Route path="/courses/:courseId" element={<CourseDetailPage />} />
              <Route path="/courses/:courseId/modules/:moduleId" element={<ModuleViewPage />} />
              <Route path="/courses/:courseId/forums" element={<ForumListPage />} />
              <Route path="/courses/:courseId/forums/:threadId" element={<ThreadViewPage />} />

              <Route path="/activities" element={<ActivityListPage />} />
              <Route
                path="/activities/new"
                element={
                  <RoleGuard requiredRole="professor">
                    <ActivityCreatePage />
                  </RoleGuard>
                }
              />
              <Route path="/activities/:activityId" element={<ActivityDetailPage />} />

              <Route path="/attendance" element={<AttendanceSwitch />} />
              <Route path="/grades" element={<GradesSwitch />} />
              <Route path="/forums" element={<ForumListPage />} />
              <Route path="/calendar" element={<AcademicCalendarPage />} />
              <Route
                path="/reports"
                element={
                  <RoleGuard requiredRole="professor">
                    <AnalyticsDashboardPage />
                  </RoleGuard>
                }
              />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/:userId" element={<ProfilePage />} />
            </Route>

            {/* Fallback redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <ToastContainer />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
