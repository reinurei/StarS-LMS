// Enrollment Code Generator — Requirement 3.1, Property 1
// Generates an 8-character uppercase alphanumeric code and retries on collision.

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Clear alphanumeric (avoids ambiguous O/0, I/1)
const FULL_ALPHANUM = /^[A-Z0-9]{8}$/;

export function randomCode(length = 8): string {
  const array = new Uint32Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARSET[array[i] % CHARSET.length];
  }
  return result;
}

export function isValidEnrollmentCodeFormat(code: string): boolean {
  return FULL_ALPHANUM.test(code);
}

/**
 * Generates a unique 8-character alphanumeric enrollment code, retrying when a
 * collision is detected by `existsCheck`.
 */
export async function generateUniqueEnrollmentCode(
  existsCheck: (code: string) => Promise<boolean> | boolean,
  maxAttempts = 50,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = randomCode(8);
    const exists = await existsCheck(candidate);
    if (!exists) {
      return candidate;
    }
  }
  throw new Error('Failed to generate a unique enrollment code after maximum attempts.');
}
