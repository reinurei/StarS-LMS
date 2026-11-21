import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const rawAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

/**
 * Verifies HTTPS enforcement for non-local URLs (Requirement 15.6).
 */
export function isSecureEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    // Allow localhost only during local development
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const isSupabaseConfigured: boolean =
  Boolean(rawUrl && rawAnonKey) &&
  !rawUrl.includes('your-project-ref') &&
  isSecureEndpoint(rawUrl);

if (rawUrl && !rawUrl.includes('your-project-ref') && !isSecureEndpoint(rawUrl)) {
  throw new Error(
    'Insecure Supabase URL detected. All client-server traffic must use HTTPS (Requirement 15.6).',
  );
}

// Create real client when configured, or a safe placeholder client in Demo Mode
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? rawUrl : 'https://demo-placeholder.supabase.co',
  isSupabaseConfigured ? rawAnonKey : 'demo-placeholder-anon-key',
);

export function getEdgeFunctionUrl(functionName: string): string {
  const base = rawUrl.replace(/\/$/, '');
  const url = `${base}/functions/v1/${functionName}`;
  if (isSupabaseConfigured && !isSecureEndpoint(url)) {
    throw new Error('Edge Function requests must use HTTPS.');
  }
  return url;
}
