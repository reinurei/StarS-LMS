// Activity Logger Utility — Requirements 15.4, 6.8 (Tasks 22.1, 22.2)
import { isSupabaseConfigured, supabase } from './supabaseClient';
import type { ActivityLog } from './types';

export type ActivityActionType = 'create' | 'update' | 'delete' | 'download';

export interface LogActivityParams {
  userId: string;
  actionType: ActivityActionType;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

const LOGS_STORAGE_KEY = 'lms_activity_logs_v1';

export function getLocalActivityLogs(): ActivityLog[] {
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ActivityLog[]) : [];
  } catch {
    return [];
  }
}

export async function logActivity(params: LogActivityParams): Promise<ActivityLog> {
  const entry: ActivityLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    user_id: params.userId,
    action_type: params.actionType,
    resource_type: params.resourceType,
    resource_id: params.resourceId ?? null,
    metadata: params.metadata ?? null,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured) {
    try {
      await supabase.from('activity_logs').insert({
        user_id: entry.user_id,
        action_type: entry.action_type,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        metadata: entry.metadata,
      });
    } catch {
      // Never block primary user mutation on audit log failure
    }
    return entry;
  }

  try {
    const existing = getLocalActivityLogs();
    existing.unshift(entry);
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(existing.slice(0, 500)));
  } catch {
    // ignore storage quota errors
  }

  return entry;
}
