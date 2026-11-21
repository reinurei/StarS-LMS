// Quiz Auto-Grading & Randomization
// Requirements: 17.3, 17.4; Property 7

export interface QuizAnswerPair {
  questionId?: string;
  studentAnswer: string;
  correctAnswer: string;
}

export interface QuizScoreResult {
  correctCount: number;
  totalQuestions: number;
  percentage: number;
}

/**
 * Normalizes an answer by trimming leading/trailing whitespace and lowercasing.
 */
export function normalizeQuizAnswer(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Auto-grades a quiz submission by comparing each student answer against the
 * corresponding correct answer after `trim()` + `toLowerCase()` (Property 7).
 */
export function scoreQuizSubmission(pairs: QuizAnswerPair[]): QuizScoreResult {
  const totalQuestions = pairs.length;
  let correctCount = 0;

  for (const pair of pairs) {
    if (normalizeQuizAnswer(pair.studentAnswer) === normalizeQuizAnswer(pair.correctAnswer)) {
      correctCount += 1;
    }
  }

  const percentage =
    totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 10000) / 100;

  return { correctCount, totalQuestions, percentage };
}

/**
 * Shuffles an array of questions using Fisher-Yates without mutating the input
 * (Requirement 17.4). Optionally accepts a deterministic seed for per-session
 * reproducibility.
 */
export function randomizeQuestions<T>(items: readonly T[], seed?: string): T[] {
  const copy = [...items];
  let rng: () => number;

  if (seed) {
    // Simple Mulberry32 PRNG seeded from hash of seed string
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let state = h >>> 0;
    rng = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  } else {
    rng = Math.random;
  }

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
