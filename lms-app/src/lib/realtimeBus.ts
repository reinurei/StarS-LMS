// Local pub/sub event bus used for real-time updates (notifications, forum posts)
// alongside Supabase Realtime Broadcast channels.

type Listener<T = unknown> = (payload: T) => void;

class RealtimeEventBus {
  private channels = new Map<string, Set<Listener>>();

  subscribe<T = unknown>(channel: string, listener: Listener<T>): () => void {
    const set = this.channels.get(channel) ?? new Set<Listener>();
    set.add(listener as Listener);
    this.channels.set(channel, set);
    return () => {
      set.delete(listener as Listener);
      if (set.size === 0) {
        this.channels.delete(channel);
      }
    };
  }

  emit<T = unknown>(channel: string, payload: T): void {
    const set = this.channels.get(channel);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch {
        // isolate subscriber errors
      }
    }
  }
}

export const lmsRealtimeBus = new RealtimeEventBus();
