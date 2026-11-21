// Submission Status Classifier & Resubmission Guard
// Requirements: 6.6, 7.1, 7.3, 7.6, 7.8; Properties 2 & 3

export type ClassifiedSubmissionStatus =
  | 'upcoming'
  | 'submitted'
  | 'graded'
  | 'late'
  | 'missing'
  | 'timed_out';

export interface ClassifySubmissionInput {
  submittedAt: Date | string | null | undefined;
  deadline: Date | string;
  now?: Date | string;
  isGraded?: boolean;
  timedOutAt?: Date | string | null;
}

/**
 * Classifies an activity/submission status:
 * - `late` iff `submittedAt > deadline` (and not overridden)
 * - `graded` if `submittedAt <= deadline` and `isGraded === true`
 * - `submitted` if `submittedAt <= deadline` and not graded
 * - `missing` if no submission exists and `now > deadline`
 * - `upcoming` if no submission exists and `now <= deadline`
 */
export function classifySubmission(input: ClassifySubmissionInput): ClassifiedSubmissionStatus {
  const deadlineMs =
    input.deadline instanceof Date ? input.deadline.getTime() : new Date(input.deadline).getTime();
  const nowMs = input.now
    ? input.now instanceof Date
      ? input.now.getTime()
      : new Date(input.now).getTime()
    : Date.now();

  if (input.submittedAt) {
    const submittedMs =
      input.submittedAt instanceof Date
        ? input.submittedAt.getTime()
        : new Date(input.submittedAt).getTime();

    if (submittedMs > deadlineMs) {
      return 'late';
    }
    if (input.isGraded) {
      return 'graded';
    }
    return 'submitted';
  }

  return nowMs > deadlineMs ? 'missing' : 'upcoming';
}

export interface ResubmissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Checks whether a student can submit/resubmit an activity (Property 3).
 * Total accepted submissions per (student, activity) never exceeds maxResubmissions + 1.
 */
export function canResubmit(params: {
  hasExistingSubmission: boolean;
  allowResubmission: boolean;
  resubmissionCount: number;
  maxResubmissions: number;
  deadline?: Date | string;
  now?: Date;
}): ResubmissionCheckResult {
  if (!params.hasExistingSubmission) {
    return { allowed: true };
  }

  if (!params.allowResubmission) {
    return {
      allowed: false,
      reason: 'Resubmission is not permitted for this activity.',
    };
  }

  const effectiveMax = Math.min(Math.max(0, params.maxResubmissions), 10);

  if (params.resubmissionCount >= effectiveMax) {
    return {
      allowed: false,
      reason: `Maximum resubmission limit (${effectiveMax}) has been reached.`,
    };
  }

  if (params.deadline) {
    const deadlineMs =
      params.deadline instanceof Date
        ? params.deadline.getTime()
        : new Date(params.deadline).getTime();
    const nowMs = (params.now ?? new Date()).getTime();
    if (nowMs > deadlineMs) {
      return {
        allowed: false,
        reason: 'Resubmissions are closed after the deadline has passed.',
      };
    }
  }

  return { allowed: true };
}
