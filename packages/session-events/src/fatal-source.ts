export interface SessionEventFatalSource {
  subscribe(listener: () => void): () => void;
}

export interface SessionEventFatalLatch {
  readonly source: SessionEventFatalSource;
  report(): void;
}

export function createSessionEventFatalLatch(): SessionEventFatalLatch {
  const listeners = new Set<() => void>();
  const notified = new WeakSet<() => void>();
  let latched = false;

  const notify = (listener: () => void): void => {
    if (notified.has(listener)) return;
    notified.add(listener);
    queueMicrotask(() => {
      if (!listeners.has(listener)) return;
      try { listener(); } catch {}
    });
  };

  return Object.freeze({
    source: Object.freeze({
      subscribe(listener: () => void): () => void {
        if (typeof listener !== "function") throw new TypeError("Invalid fatal listener");
        listeners.add(listener);
        if (latched) notify(listener);
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          listeners.delete(listener);
        };
      },
    }),
    report(): void {
      if (latched) return;
      latched = true;
      for (const listener of listeners) notify(listener);
    },
  });
}
