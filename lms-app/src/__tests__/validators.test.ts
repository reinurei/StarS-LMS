import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, evaluateLockoutState, type AuthContextValue } from '../hooks/useAuth';
import { useIdleTimeout } from '../hooks/useIdleTimeout';
import { formatLockoutMessage } from '../pages/auth/LoginPage';
import { scoreQuizSubmission } from '../lib/scoreQuizSubmission';
import {
  courseSchema,
  createActivitySchema,
  forumPostSchema,
  profileSchema,
  validateAvatarFile,
} from '../lib/validators';

describe('Unit Tests — Auth Lockout & Idle Timeout (Task 3.7)', () => {
  it('locks account on 5th consecutive failed attempt within 15 minutes', () => {
    const base = 1_700_000_000_000;
    let state = null;
    for (let i = 1; i <= 4; i++) {
      const res = evaluateLockoutState(state, base + i * 1000);
      expect(res.isLocked).toBe(false);
      state = res.next;
    }
    const fifth = evaluateLockoutState(state, base + 5000);
    expect(fifth.isLocked).toBe(true);
    expect(fifth.lockedUntilIso).toBeTruthy();
    expect(formatLockoutMessage(fifth.lockedUntilIso!)).toContain('15-minute lockout');
  });

  it('signs out after idle timeout expires', async () => {
    vi.useFakeTimers();
    const signOutMock = vi.fn().mockResolvedValue(undefined);

    function Harness() {
      useIdleTimeout(5000);
      return React.createElement('div', null, 'Active');
    }

    const ctx: AuthContextValue = {
      user: {
        id: 'u1',
        email: 'a@university.edu',
        full_name: 'Test User',
        role: 'student',
        avatar_url: null,
      },
      session: null,
      role: 'student',
      isSuperAdmin: false,
      isLoading: false,
      isDemoMode: true,
      signIn: async () => ({ ok: true }),
      signUp: async () => ({ ok: true }),
      signInWithGoogle: async () => ({ ok: true }),
      signInDemo: async () => {},
      signOut: signOutMock,
      refreshProfile: async () => {},
    };

    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          AuthContext.Provider,
          { value: ctx },
          React.createElement(Harness),
        ),
      ),
    );

    await act(async () => {
      vi.advanceTimersByTime(4999);
    });
    expect(signOutMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('Unit Tests — Profile, Course, Activity, Quiz & Forum Validators (Tasks 4.3, 6.8, 9.7, 12.5)', () => {
  it('validates profile name length, email format, and avatar constraints', () => {
    expect(profileSchema.safeParse({ full_name: 'Elena Reyes', email: 'elena@edu.ph' }).success).toBe(true);
    expect(profileSchema.safeParse({ full_name: 'a'.repeat(101), email: 'elena@edu.ph' }).success).toBe(false);
    expect(profileSchema.safeParse({ full_name: 'Elena', email: 'invalid-email' }).success).toBe(false);

    expect(validateAvatarFile({ type: 'image/png', size: 1024 }).valid).toBe(true);
    expect(validateAvatarFile({ type: 'image/png', size: 6 * 1024 * 1024 }).valid).toBe(false);
    expect(validateAvatarFile({ type: 'application/pdf', size: 1024 }).valid).toBe(false);
  });

  it('validates course fields (name, subject_code, description, schedule)', () => {
    expect(
      courseSchema.safeParse({
        name: 'Algorithms',
        subject_code: 'CS301',
        description: 'Core algorithms course.',
        schedule: 'Mon 9am',
        semester: '1st Semester',
        academic_year: '2026-2027',
      }).success,
    ).toBe(true);

    expect(
      courseSchema.safeParse({
        name: 'Algorithms',
        subject_code: 'C1', // too short (<3)
        description: 'Desc',
        schedule: 'Mon 9am',
        semester: '1st Semester',
        academic_year: '2026-2027',
      }).success,
    ).toBe(false);
  });

  it('validates activity deadline must be in the future', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    const schema = createActivitySchema(now);

    expect(
      schema.safeParse({
        title: 'Lab 1',
        activity_type: 'assignment',
        instructions: 'Submit PDF',
        deadline: '2026-11-20T12:00:00Z',
      }).success,
    ).toBe(true);

    expect(
      schema.safeParse({
        title: 'Lab 1',
        activity_type: 'assignment',
        instructions: 'Submit PDF',
        deadline: '2026-11-18T12:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('scores quiz edge cases: all correct, all wrong, whitespace and case variants', () => {
    expect(
      scoreQuizSubmission([
        { studentAnswer: '  InOrder  ', correctAnswer: 'inorder' },
        { studentAnswer: 'O(LOG N)', correctAnswer: 'O(log n)' },
      ]),
    ).toEqual({ correctCount: 2, totalQuestions: 2, percentage: 100 });

    expect(
      scoreQuizSubmission([
        { studentAnswer: 'wrong', correctAnswer: 'right' },
        { studentAnswer: '', correctAnswer: 'answer' },
      ]),
    ).toEqual({ correctCount: 0, totalQuestions: 2, percentage: 0 });
  });

  it('rejects blank and >10,000 char forum posts', () => {
    expect(forumPostSchema.safeParse({ content: '   \n\t  ' }).success).toBe(false);
    expect(forumPostSchema.safeParse({ content: 'a'.repeat(10_001) }).success).toBe(false);
    expect(forumPostSchema.safeParse({ content: 'Valid question' }).success).toBe(true);
  });
});
