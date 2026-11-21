// Notification Fan-out, 100-Cap Enforcement, and Read-State Transitions
// Requirements: 11.1, 11.2, 11.4, 11.5, 11.6, 11.7; Properties 6 & 8

import type { Enrollment, Notification } from './types';

export const MAX_NOTIFICATIONS_PER_USER = 100;

/**
 * Builds exactly one notification per actively enrolled student in a course
 * (no duplicates, no omissions) — Property 6.
 */
export function buildCourseNotifications(params: {
  enrollments: ReadonlyArray<Pick<Enrollment, 'course_id' | 'student_id' | 'status'>>;
  courseId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}): Notification[] {
  const activeStudentIds = new Set<string>();
  for (const enr of params.enrollments) {
    if (enr.course_id === params.courseId && enr.status === 'active') {
      activeStudentIds.add(enr.student_id);
    }
  }

  const now = params.createdAt ?? new Date().toISOString();
  const results: Notification[] = [];
  let seq = 0;

  for (const studentId of activeStudentIds) {
    seq += 1;
    results.push({
      id: `notif-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 7)}`,
      recipient_id: studentId,
      type: params.type,
      title: params.title,
      body: params.body,
      metadata: params.metadata ?? { course_id: params.courseId },
      is_read: false,
      created_at: now,
      read_at: null,
    });
  }

  return results;
}

/**
 * Enforces the 100-notification cap per user by keeping the 100 newest
 * notifications for each recipient (Requirement 11.5).
 */
export function enforceNotificationCap(
  notifications: Notification[],
  maxPerUser = MAX_NOTIFICATIONS_PER_USER,
): Notification[] {
  const byUser = new Map<string, Notification[]>();
  for (const n of notifications) {
    const list = byUser.get(n.recipient_id) ?? [];
    list.push(n);
    byUser.set(n.recipient_id, list);
  }

  const result: Notification[] = [];
  for (const list of byUser.values()) {
    const sorted = [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    result.push(...sorted.slice(0, maxPerUser));
  }

  return result;
}

/**
 * Marks a single notification as read and returns the updated list + new unread
 * count for that recipient (Property 8).
 */
export function markNotificationReadState(
  notifications: Notification[],
  notificationId: string,
  readAt: string = new Date().toISOString(),
): { notifications: Notification[]; unreadCount: number; transitioned: boolean } {
  let transitioned = false;
  let recipientId: string | null = null;

  const updated = notifications.map((n) => {
    if (n.id === notificationId) {
      recipientId = n.recipient_id;
      if (!n.is_read) {
        transitioned = true;
        return { ...n, is_read: true, read_at: readAt };
      }
    }
    return n;
  });

  const unreadCount = updated.filter(
    (n) => (recipientId ? n.recipient_id === recipientId : true) && !n.is_read,
  ).length;

  return { notifications: updated, unreadCount, transitioned };
}
