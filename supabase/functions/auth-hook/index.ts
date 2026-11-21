/**
 * Supabase Auth Hook — Failed Login Counter
 *
 * This Deno Edge Function is registered as a Supabase Auth
 * "custom-sms-hook" / password-attempt hook. Supabase invokes it via
 * signed POST requests on each authentication event.
 *
 * Logic (Requirement 1.2):
 *  - On every POST the payload contains `event` ("LOGIN_FAILED" or
 *    "LOGIN") and `user` with the user's current `app_metadata`.
 *  - If `locked_until` is set and in the future  → reject immediately.
 *  - On LOGIN_FAILED: increment `failed_attempts`; set
 *    `failed_attempts_start` if it is not yet set.  When
 *    `failed_attempts >= 5` and all failures occurred within 15 minutes
 *    of `failed_attempts_start`, write `locked_until = now + 15 min`.
 *  - On LOGIN (success): reset `failed_attempts = 0` and clear
 *    `locked_until` / `failed_attempts_start`.
 *
 * The function uses the Supabase service-role key to call
 * `auth.admin.updateUserById` and persist `app_metadata` changes.
 *
 * Environment variables required at deploy time:
 *   SUPABASE_URL          – project REST URL
 *   SUPABASE_SERVICE_ROLE_KEY – service-role secret
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppMetadata {
  role?: string;
  failed_attempts?: number;
  failed_attempts_start?: string; // ISO timestamp of first failure in window
  locked_until?: string; // ISO timestamp — absent or empty when not locked
}

interface AuthHookPayload {
  /**
   * Event type sent by Supabase Auth.
   * "LOGIN"        – successful credential check
   * "LOGIN_FAILED" – credential check failed
   */
  event: "LOGIN" | "LOGIN_FAILED";
  user: {
    id: string;
    app_metadata: AppMetadata;
  };
}

interface AuthHookResponse {
  /** When present and non-empty, Supabase Auth will reject the request. */
  error?: {
    http_code: number;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

// ---------------------------------------------------------------------------
// Helper: build admin Supabase client
// ---------------------------------------------------------------------------

function buildAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }

  return createClient(url, key, {
    auth: {
      // Service-role clients must not persist sessions
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Helper: update app_metadata via admin API
// ---------------------------------------------------------------------------

async function updateAppMetadata(
  userId: string,
  metadata: Partial<AppMetadata>,
): Promise<void> {
  const supabase = buildAdminClient();

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: metadata,
  });

  if (error) {
    // Surface the error so the caller can decide how to handle it
    throw new Error(`Failed to update app_metadata: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // Supabase hooks use POST; reject everything else
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  let payload: AuthHookPayload;

  try {
    payload = await req.json() as AuthHookPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { event, user } = payload;

  if (!user?.id) {
    return new Response(
      JSON.stringify({ error: "Missing user.id in payload" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const meta: AppMetadata = user.app_metadata ?? {};
  const now = new Date();

  // -------------------------------------------------------------------------
  // 1. Check lockout — applies to both LOGIN and LOGIN_FAILED
  // -------------------------------------------------------------------------
  if (meta.locked_until) {
    const lockedUntil = new Date(meta.locked_until);
    if (lockedUntil > now) {
      const remainingMs = lockedUntil.getTime() - now.getTime();
      const remainingMinutes = Math.ceil(remainingMs / 60_000);

      const response: AuthHookResponse = {
        error: {
          http_code: 429,
          message:
            `Account locked due to too many failed login attempts. ` +
            `Try again in ${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}.`,
        },
      };

      return new Response(JSON.stringify(response), {
        status: 200, // Supabase hooks always expect HTTP 200 from the hook itself
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 2. Handle LOGIN_FAILED — increment counter; lock if threshold reached
  // -------------------------------------------------------------------------
  if (event === "LOGIN_FAILED") {
    const failedAttempts = (meta.failed_attempts ?? 0) + 1;
    let failedAttemptsStart = meta.failed_attempts_start
      ? new Date(meta.failed_attempts_start)
      : null;
    let lockedUntil: string | undefined = undefined;

    // Start the failure window on the first failed attempt (or after a reset)
    if (!failedAttemptsStart) {
      failedAttemptsStart = now;
    }

    const windowElapsedMs = now.getTime() - failedAttemptsStart.getTime();
    const windowElapsedMinutes = windowElapsedMs / 60_000;

    if (windowElapsedMinutes > WINDOW_MINUTES) {
      // The existing window has expired — start a fresh one with this attempt
      const updatedMeta: AppMetadata = {
        ...meta,
        failed_attempts: 1,
        failed_attempts_start: now.toISOString(),
        locked_until: undefined,
      };
      // Persist without awaiting to keep response fast; errors are logged
      updateAppMetadata(user.id, updatedMeta).catch(console.error);

      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Still within the window — check if threshold is crossed
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockoutDate = new Date(
        now.getTime() + LOCKOUT_MINUTES * 60_000,
      );
      lockedUntil = lockoutDate.toISOString();
    }

    const updatedMeta: AppMetadata = {
      ...meta,
      failed_attempts: failedAttempts,
      failed_attempts_start: failedAttemptsStart.toISOString(),
    };
    if (lockedUntil !== undefined) {
      updatedMeta.locked_until = lockedUntil;
    }

    updateAppMetadata(user.id, updatedMeta).catch(console.error);

    // If the account just got locked, block this login attempt too
    if (lockedUntil) {
      const response: AuthHookResponse = {
        error: {
          http_code: 429,
          message:
            `Too many failed login attempts. ` +
            `Your account has been locked for ${LOCKOUT_MINUTES} minutes.`,
        },
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Allow the error to pass through to Supabase Auth's default handling
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // -------------------------------------------------------------------------
  // 3. Handle successful LOGIN — reset counter and lockout fields
  // -------------------------------------------------------------------------
  if (event === "LOGIN") {
    // Only update metadata if there's something to clear
    if (
      meta.failed_attempts !== 0 &&
      meta.failed_attempts !== undefined ||
      meta.locked_until ||
      meta.failed_attempts_start
    ) {
      const updatedMeta: AppMetadata = {
        ...meta,
        failed_attempts: 0,
        failed_attempts_start: undefined,
        locked_until: undefined,
      };

      updateAppMetadata(user.id, updatedMeta).catch(console.error);
    }

    // Allow the login to proceed
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Unknown event — allow through without side effects
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
