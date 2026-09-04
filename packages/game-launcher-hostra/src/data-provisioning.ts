import type { ChildProcess } from "node:child_process";

export interface HostraRuntimeDataPrepareRequest {
  readonly candidateId: string;
  readonly endpoint: string;
  readonly generation: number;
  readonly dataProfile: string;
}

export interface HostraRuntimeDataProvisioner {
  prepare(
    request: HostraRuntimeDataPrepareRequest,
    signal: AbortSignal,
  ): Promise<void>;
  commit(candidateId: string, signal: AbortSignal): Promise<void>;
  revoke(candidateId: string): void;
}

export type HostToRunnerDataMessage =
  | ({ readonly type: "provision" } & HostraRuntimeDataPrepareRequest)
  | { readonly type: "commit"; readonly candidateId: string }
  | { readonly type: "revoke"; readonly candidateId: string };

export type RunnerToHostDataMessage =
  | { readonly type: "prepared"; readonly candidateId: string }
  | { readonly type: "committed"; readonly candidateId: string }
  | {
      readonly type: "rejected";
      readonly candidateId: string;
      readonly operation: "prepare" | "commit";
    };

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(reason: unknown): void;
}

function deferred(): Deferred {
  let settled = false;
  let resolvePromise!: () => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve() {
      if (settled) return;
      settled = true;
      resolvePromise();
    },
    reject(reason) {
      if (settled) return;
      settled = true;
      rejectPromise(reason);
    },
  };
}

function validCandidateId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function validDataEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  let endpoint: URL;
  try { endpoint = new URL(value); }
  catch { return false; }
  return endpoint.protocol === "ws:" &&
    endpoint.hostname === "127.0.0.1" &&
    endpoint.port !== "" &&
    endpoint.username === "" && endpoint.password === "" &&
    endpoint.search === "" && endpoint.hash === "" &&
    /^\/[A-Za-z0-9_-]{43}$/.test(endpoint.pathname);
}

export function isRunnerToHostDataMessage(
  value: unknown,
): value is RunnerToHostDataMessage {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (!validCandidateId(message.candidateId)) return false;
  if (message.type === "prepared" || message.type === "committed") {
    return Object.keys(message).length === 2;
  }
  return message.type === "rejected" &&
    (message.operation === "prepare" || message.operation === "commit") &&
    Object.keys(message).length === 3;
}

export function isHostToRunnerDataMessage(
  value: unknown,
): value is HostToRunnerDataMessage {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (!validCandidateId(message.candidateId)) return false;
  if (message.type === "commit" || message.type === "revoke") {
    return Object.keys(message).length === 2;
  }
  return message.type === "provision" &&
    Object.keys(message).length === 5 &&
    validDataEndpoint(message.endpoint) &&
    Number.isSafeInteger(message.generation) && (message.generation as number) > 0 &&
    typeof message.dataProfile === "string" && message.dataProfile.length > 0;
}

interface Operation {
  readonly candidateId: string;
  readonly deferred: Deferred;
  readonly signal: AbortSignal;
  readonly detachAbort: () => void;
}

export function createHostraRuntimeDataProvisioner(
  child: ChildProcess,
): HostraRuntimeDataProvisioner {
  let terminal = false;
  let preparedCandidateId: string | null = null;
  let currentCandidateId: string | null = null;
  let prepareOperation: Operation | null = null;
  let commitOperation: Operation | null = null;

  const failOperation = (operation: Operation | null, reason: unknown) => {
    if (operation === null) return;
    operation.detachAbort();
    operation.deferred.reject(reason);
  };
  const terminate = () => {
    if (terminal) return;
    terminal = true;
    const failure = new Error("Runner Data provisioning IPC is unavailable");
    failOperation(prepareOperation, failure);
    failOperation(commitOperation, failure);
    prepareOperation = null;
    commitOperation = null;
    preparedCandidateId = null;
    currentCandidateId = null;
  };
  const send = (message: HostToRunnerDataMessage): boolean => {
    if (terminal || !child.connected) return false;
    try {
      return child.send(message, (error) => {
        if (error != null) terminate();
      });
    } catch {
      terminate();
      return false;
    }
  };
  const makeOperation = (
    candidateId: string,
    signal: AbortSignal,
    revokeOnAbort: boolean,
  ): Operation => {
    const result = deferred();
    const onAbort = () => {
      if (revokeOnAbort) provisioner.revoke(candidateId);
      result.reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    return {
      candidateId,
      deferred: result,
      signal,
      detachAbort: () => signal.removeEventListener("abort", onAbort),
    };
  };

  child.on("message", (value: unknown) => {
    if (terminal || !isRunnerToHostDataMessage(value)) return;
    if (value.type === "prepared") {
      const operation = prepareOperation;
      if (operation === null || operation.candidateId !== value.candidateId) return;
      prepareOperation = null;
      operation.detachAbort();
      if (operation.signal.aborted) return;
      preparedCandidateId = value.candidateId;
      operation.deferred.resolve();
      return;
    }
    if (value.type === "committed") {
      const operation = commitOperation;
      if (operation === null || operation.candidateId !== value.candidateId) return;
      commitOperation = null;
      operation.detachAbort();
      if (operation.signal.aborted) return;
      preparedCandidateId = null;
      currentCandidateId = value.candidateId;
      operation.deferred.resolve();
      return;
    }
    const operation = value.operation === "prepare" ? prepareOperation : commitOperation;
    if (operation === null || operation.candidateId !== value.candidateId) return;
    if (value.operation === "prepare") prepareOperation = null;
    else commitOperation = null;
    operation.detachAbort();
    if (preparedCandidateId === value.candidateId) preparedCandidateId = null;
    operation.deferred.reject(new Error(`Runner rejected Data ${value.operation}`));
  });
  child.once("disconnect", terminate);
  child.once("exit", terminate);
  child.once("error", terminate);

  const provisioner: HostraRuntimeDataProvisioner = Object.freeze({
    prepare(request: HostraRuntimeDataPrepareRequest, signal: AbortSignal) {
      if (
        request === null || typeof request !== "object" ||
        !validCandidateId(request.candidateId) ||
        !validDataEndpoint(request.endpoint) ||
        !Number.isSafeInteger(request.generation) || request.generation <= 0 ||
        typeof request.dataProfile !== "string" || request.dataProfile.length === 0
      ) {
        return Promise.reject(new TypeError("Invalid Runtime Data prepare request"));
      }
      if (signal.aborted) return Promise.reject(signal.reason);
      if (terminal) return Promise.reject(new Error("Runner Data provisioning IPC is unavailable"));
      if (prepareOperation !== null || preparedCandidateId !== null) {
        return Promise.reject(new Error("A Runtime Data candidate is already prepared"));
      }
      const operation = makeOperation(request.candidateId, signal, true);
      prepareOperation = operation;
      if (!send(Object.freeze({ type: "provision", ...request }))) {
        prepareOperation = null;
        operation.detachAbort();
        operation.deferred.reject(new Error("Runner Data provisioning IPC is unavailable"));
      }
      return operation.deferred.promise;
    },
    commit(candidateId: string, signal: AbortSignal) {
      if (!validCandidateId(candidateId)) return Promise.reject(new TypeError("Invalid Runtime Data candidate ID"));
      if (signal.aborted) return Promise.reject(signal.reason);
      if (terminal) return Promise.reject(new Error("Runner Data provisioning IPC is unavailable"));
      if (commitOperation !== null || preparedCandidateId !== candidateId) {
        return Promise.reject(new Error("Runtime Data candidate is not prepared"));
      }
      const operation = makeOperation(candidateId, signal, true);
      commitOperation = operation;
      if (!send(Object.freeze({ type: "commit", candidateId }))) {
        commitOperation = null;
        operation.detachAbort();
        operation.deferred.reject(new Error("Runner Data provisioning IPC is unavailable"));
      }
      return operation.deferred.promise;
    },
    revoke(candidateId: string) {
      if (!validCandidateId(candidateId)) return;
      if (prepareOperation?.candidateId === candidateId) {
        const operation = prepareOperation;
        prepareOperation = null;
        operation.detachAbort();
        operation.deferred.reject(new Error("Runtime Data candidate was revoked"));
      }
      if (commitOperation?.candidateId === candidateId) {
        const operation = commitOperation;
        commitOperation = null;
        operation.detachAbort();
        operation.deferred.reject(new Error("Runtime Data candidate was revoked"));
      }
      if (preparedCandidateId === candidateId) preparedCandidateId = null;
      if (currentCandidateId === candidateId) currentCandidateId = null;
      send(Object.freeze({ type: "revoke", candidateId }));
    },
  });
  return provisioner;
}
