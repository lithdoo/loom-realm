import type { MessageCarrier } from "@loomrealm/foundation";
import type { RendererDataBinding } from "@loomrealm/platform-ports";
import {
  connectBoundedDataCarrier,
  type DataBufferPolicy,
} from "./data-websocket.js";

interface AuthorityTuple {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}

interface PreparedCarrier extends AuthorityTuple {
  readonly candidateId: string;
  readonly carrier: MessageCarrier;
}

interface CurrentCarrier extends PreparedCarrier {
  delivered: boolean;
}

interface AcquireWaiter extends AuthorityTuple {
  readonly signal: AbortSignal;
  readonly resolve: (carrier: MessageCarrier) => void;
  readonly reject: (reason: unknown) => void;
  readonly detachAbort: () => void;
}

interface Slot {
  prepared: PreparedCarrier | null;
  current: CurrentCarrier | null;
  waiter: AcquireWaiter | null;
}

function sameTuple(left: AuthorityTuple, right: AuthorityTuple): boolean {
  return left.subsystemKey === right.subsystemKey &&
    left.generation === right.generation &&
    left.dataProfile === right.dataProfile;
}

export class DesktopRendererDataBinding {
  readonly binding: RendererDataBinding;
  private readonly slots = new Map<string, Slot>();

  constructor(private readonly policy: DataBufferPolicy) {
    this.binding = Object.freeze({
      acquire: (
        subsystemKey: string,
        generation: number,
        dataProfile: string,
        signal: AbortSignal,
      ) => this.acquire({ subsystemKey, generation, dataProfile }, signal),
    });
  }

  private slot(subsystemKey: string): Slot {
    let slot = this.slots.get(subsystemKey);
    if (slot === undefined) {
      slot = { prepared: null, current: null, waiter: null };
      this.slots.set(subsystemKey, slot);
    }
    return slot;
  }

  private acquire(tuple: AuthorityTuple, signal: AbortSignal): Promise<MessageCarrier> {
    if (signal.aborted) return Promise.reject(signal.reason);
    const slot = this.slot(tuple.subsystemKey);
    if (slot.waiter !== null) return Promise.reject(new Error("Renderer Data acquire already pending"));
    if (slot.current !== null && !slot.current.delivered && sameTuple(slot.current, tuple)) {
      slot.current.delivered = true;
      return Promise.resolve(slot.current.carrier);
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (slot.waiter?.resolve !== resolve) return;
        slot.waiter = null;
        reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      slot.waiter = {
        ...tuple,
        signal,
        resolve,
        reject,
        detachAbort: () => signal.removeEventListener("abort", onAbort),
      };
    });
  }

  async prepare(
    candidateId: string,
    endpoint: string,
    tuple: AuthorityTuple,
    signal: AbortSignal,
  ): Promise<void> {
    const slot = this.slot(tuple.subsystemKey);
    if (slot.prepared !== null) throw new Error("Renderer Data candidate already prepared");
    const carrier = await connectBoundedDataCarrier(endpoint, signal, this.policy);
    if (signal.aborted || slot.prepared !== null) {
      void carrier.close().catch(() => {});
      throw signal.aborted ? signal.reason : new Error("Renderer Data candidate already prepared");
    }
    const prepared: PreparedCarrier = Object.freeze({ candidateId, carrier, ...tuple });
    slot.prepared = prepared;
    void carrier.closed.then(() => {
      if (slot.prepared === prepared) slot.prepared = null;
      if (slot.current?.candidateId === prepared.candidateId) slot.current = null;
    });
  }

  commit(candidateId: string, tuple: AuthorityTuple): boolean {
    const slot = this.slot(tuple.subsystemKey);
    const prepared = slot.prepared;
    if (prepared === null || prepared.candidateId !== candidateId || !sameTuple(prepared, tuple)) return false;
    slot.prepared = null;
    const current: CurrentCarrier = { ...prepared, delivered: false };
    slot.current = current;
    const waiter = slot.waiter;
    if (waiter !== null && sameTuple(waiter, tuple) && !waiter.signal.aborted) {
      slot.waiter = null;
      waiter.detachAbort();
      current.delivered = true;
      waiter.resolve(current.carrier);
    }
    return true;
  }

  revoke(candidateId: string): void {
    for (const slot of this.slots.values()) {
      if (slot.prepared?.candidateId === candidateId) {
        const prepared = slot.prepared;
        slot.prepared = null;
        void prepared.carrier.close().catch(() => {});
      }
      if (slot.current?.candidateId === candidateId) {
        const current = slot.current;
        slot.current = null;
        void current.carrier.close().catch(() => {});
      }
    }
  }

  close(): void {
    for (const slot of this.slots.values()) {
      if (slot.prepared !== null) void slot.prepared.carrier.close().catch(() => {});
      if (slot.current !== null) void slot.current.carrier.close().catch(() => {});
      slot.prepared = null;
      slot.current = null;
      const waiter = slot.waiter;
      slot.waiter = null;
      waiter?.detachAbort();
      waiter?.reject(new Error("Renderer Data binding closed"));
    }
  }
}
