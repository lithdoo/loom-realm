export interface SessionEventFatalSource {
  subscribe(listener: () => void): () => void;
}

export interface SessionEventFatalLatch {
  readonly source: SessionEventFatalSource;
  report(): void;
}

interface FatalRegistration {
  readonly listener: () => void;
  active: boolean;
  notified: boolean;
}

export function createSessionEventFatalLatch(): SessionEventFatalLatch {
  const registrations = new Set<FatalRegistration>();
  let latched = false;

  const notify = (registration: FatalRegistration): void => {
    if (!registration.active || registration.notified) return;
    registration.notified = true;
    queueMicrotask(() => {
      if (!registration.active || !registrations.has(registration)) return;
      try { registration.listener(); } catch {}
    });
  };

  return Object.freeze({
    source: Object.freeze({
      subscribe(listener: () => void): () => void {
        if (typeof listener !== "function") throw new TypeError("Invalid fatal listener");
        const registration: FatalRegistration = {
          listener,
          active: true,
          notified: false,
        };
        registrations.add(registration);
        if (latched) notify(registration);
        return () => {
          if (!registration.active) return;
          registration.active = false;
          registrations.delete(registration);
        };
      },
    }),
    report(): void {
      if (latched) return;
      latched = true;
      for (const registration of registrations) notify(registration);
    },
  });
}
