import type { MessageCarrier } from "@loomrealm/foundation";
import type { SubsystemDataBinding, SubsystemDataBindingResult } from "@loomrealm/platform-ports";
import WebSocket from "ws";
import {
  isHostToRunnerDataMessage,
  type HostToRunnerDataMessage,
  type RunnerToHostDataMessage,
} from "../data-provisioning.js";
import { createWebSocketCarrier } from "../websocket-carrier.js";

const MAX_UNDELIVERED_MESSAGES = 64;
const MAX_UNDELIVERED_BYTES = 1_048_576;

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value) { if (!settled) { settled = true; resolvePromise(value); } },
    reject(reason) { if (!settled) { settled = true; rejectPromise(reason); } },
  };
}

interface PreparedCandidate {
  readonly candidateId: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly controller: AbortController;
  carrier: MessageCarrier | null;
}

interface CurrentCarrier {
  readonly candidateId: string;
  readonly result: SubsystemDataBindingResult;
  delivered: boolean;
}

interface AcquireWaiter {
  readonly deferred: Deferred<SubsystemDataBindingResult>;
  readonly signal: AbortSignal;
  readonly detachAbort: () => void;
}

function send(message: RunnerToHostDataMessage): void {
  try {
    process.send?.(message);
  } catch {
    // IPC terminal is Data-only; the Runtime Control path remains independent.
  }
}

function connect(endpoint: string, signal: AbortSignal): Promise<MessageCarrier> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    let settled = false;
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      try { socket.terminate(); } catch {}
      reject(reason);
    };
    const abort = () => fail(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    socket.once("open", () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      resolve(createWebSocketCarrier(socket, {
        maxBufferedMessages: MAX_UNDELIVERED_MESSAGES,
        maxBufferedBytes: MAX_UNDELIVERED_BYTES,
      }));
    });
    socket.once("error", fail);
  });
}

export function createRunnerDataProvisioning(): {
  readonly binding: SubsystemDataBinding;
  close(): void;
} | null {
  if (typeof process.send !== "function") return null;
  let prepared: PreparedCandidate | null = null;
  let current: CurrentCarrier | null = null;
  let waiter: AcquireWaiter | null = null;
  let terminal = false;

  const closeCarrier = (carrier: MessageCarrier | null | undefined) => {
    if (carrier !== null && carrier !== undefined) void carrier.close().catch(() => {});
  };
  const observeCurrent = (owned: CurrentCarrier) => {
    void owned.result.carrier.closed.then(() => {
      if (current === owned) current = null;
    });
  };
  const deliver = () => {
    if (current === null || current.delivered || waiter === null) return;
    const owned = current;
    const acquiring = waiter;
    waiter = null;
    acquiring.detachAbort();
    if (acquiring.signal.aborted) return;
    owned.delivered = true;
    acquiring.deferred.resolve(owned.result);
  };
  const revoke = (candidateId: string) => {
    if (prepared?.candidateId === candidateId) {
      const owned = prepared;
      prepared = null;
      owned.controller.abort(new Error("Runtime Data candidate revoked"));
      closeCarrier(owned.carrier);
    }
    if (current?.candidateId === candidateId) {
      const owned = current;
      current = null;
      closeCarrier(owned.result.carrier);
    }
  };

  const onMessage = (value: unknown) => {
    if (terminal || !isHostToRunnerDataMessage(value)) return;
    const message: HostToRunnerDataMessage = value;
    if (message.type === "revoke") {
      revoke(message.candidateId);
      return;
    }
    if (message.type === "provision") {
      if (prepared !== null) {
        send(Object.freeze({ type: "rejected", candidateId: message.candidateId, operation: "prepare" }));
        return;
      }
      const candidate: PreparedCandidate = {
        candidateId: message.candidateId,
        generation: message.generation,
        dataProfile: message.dataProfile,
        controller: new AbortController(),
        carrier: null,
      };
      prepared = candidate;
      void connect(message.endpoint, candidate.controller.signal).then(
        (carrier) => {
          if (prepared !== candidate || candidate.controller.signal.aborted || terminal) {
            closeCarrier(carrier);
            return;
          }
          candidate.carrier = carrier;
          void carrier.closed.then(() => {
            if (prepared === candidate) prepared = null;
          });
          send(Object.freeze({ type: "prepared", candidateId: candidate.candidateId }));
        },
        () => {
          if (prepared === candidate) prepared = null;
          if (!candidate.controller.signal.aborted) {
            send(Object.freeze({ type: "rejected", candidateId: candidate.candidateId, operation: "prepare" }));
          }
        },
      );
      return;
    }
    const candidate = prepared;
    if (
      candidate === null ||
      candidate.candidateId !== message.candidateId ||
      candidate.carrier === null
    ) {
      send(Object.freeze({ type: "rejected", candidateId: message.candidateId, operation: "commit" }));
      return;
    }
    prepared = null;
    if (current !== null) closeCarrier(current.result.carrier);
    const owned: CurrentCarrier = {
      candidateId: candidate.candidateId,
      result: Object.freeze({
        carrier: candidate.carrier,
        generation: candidate.generation,
        dataProfile: candidate.dataProfile,
      }),
      delivered: false,
    };
    current = owned;
    observeCurrent(owned);
    deliver();
    send(Object.freeze({ type: "committed", candidateId: candidate.candidateId }));
  };
  process.on("message", onMessage);

  const binding: SubsystemDataBinding = Object.freeze({
    acquire(signal: AbortSignal) {
      if (signal.aborted) return Promise.reject(signal.reason);
      if (terminal) return Promise.reject(new Error("Runtime Data provisioning is terminal"));
      if (waiter !== null) return Promise.reject(new Error("Runtime Data acquire already pending"));
      if (current !== null && !current.delivered) {
        current.delivered = true;
        return Promise.resolve(current.result);
      }
      const result = deferred<SubsystemDataBindingResult>();
      const onAbort = () => {
        if (waiter?.deferred !== result) return;
        waiter = null;
        result.reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      waiter = {
        deferred: result,
        signal,
        detachAbort: () => signal.removeEventListener("abort", onAbort),
      };
      deliver();
      return result.promise;
    },
  });

  return Object.freeze({
    binding,
    close() {
      if (terminal) return;
      terminal = true;
      process.off("message", onMessage);
      if (prepared !== null) revoke(prepared.candidateId);
      if (current !== null) revoke(current.candidateId);
      const acquiring = waiter;
      waiter = null;
      acquiring?.detachAbort();
      acquiring?.deferred.reject(new Error("Runtime Data provisioning is terminal"));
    },
  });
}
