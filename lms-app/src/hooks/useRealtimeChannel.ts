import { useEffect, useRef } from 'react';
import { lmsRealtimeBus } from '../lib/realtimeBus';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

/**
 * Generic Realtime Broadcast subscription hook (Requirement 16.2, Task 19.3).
 * Subscribes to Supabase Realtime Broadcast when configured, and always wires
 * the local pub/sub event bus for immediate UI delivery in Demo Mode.
 */
export function useRealtimeChannel<T = unknown>(
  channelName: string | null,
  eventName: string,
  onMessage: (payload: T) => void,
): void {
  const handlerRef = useRef(onMessage);
  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!channelName) return;

    const unsubscribeBus = lmsRealtimeBus.subscribe<T>(channelName, (payload) => {
      handlerRef.current(payload);
    });

    if (!isSupabaseConfigured) {
      return unsubscribeBus;
    }

    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: eventName }, ({ payload }) => {
        handlerRef.current(payload as T);
      })
      .subscribe();

    return () => {
      unsubscribeBus();
      supabase.removeChannel(channel);
    };
  }, [channelName, eventName]);
}
