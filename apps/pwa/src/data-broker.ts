import type {
  DataConnectionAuthorityEntry,
  DataConnectionAuthoritySink,
  DataConnectionAuthorityView,
  HostedRuntime,
} from "@loomrealm/platform-ports";
import type {
  PwaInstallRendererDataV1,
  PwaInstallSubsystemDataV1,
  PwaRevokeRendererDataV1,
  PwaRevokeSubsystemDataV1,
} from "./bootstrap-protocol.js";
import type { PwaRuntimeDataProvisioner } from "./runtime-hosting.js";

interface DataWindowBridge {
  request(
    message: PwaInstallRendererDataV1 | PwaRevokeRendererDataV1,
    transfer?: Transferable[],
    signal?: AbortSignal,
  ): Promise<void>;
}

interface DataTuple {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}

interface Operation extends DataTuple {
  readonly runtime: HostedRuntime;
  readonly provisioner: PwaRuntimeDataProvisioner;
  readonly authorityRevision: number;
  readonly connectionId: string;
  readonly ports: MessageChannel;
  readonly controller: AbortController;
  state: "preparing" | "runner-installed" | "window-installed" | "rolling-back";
  runnerRevoked: boolean;
  windowRevoked: boolean;
}

interface Current extends DataTuple {
  readonly runtime: HostedRuntime;
  readonly provisioner: PwaRuntimeDataProvisioner;
  readonly connectionId: string;
  state: "committed" | "revoking";
  runnerRevoked: boolean;
  windowRevoked: boolean;
}

type Observation = Readonly<Record<string, unknown> & { type: string }>;

function sameTuple(left: DataTuple, right: DataTuple): boolean {
  return left.subsystemKey === right.subsystemKey
    && left.generation === right.generation
    && left.dataProfile === right.dataProfile;
}

function failure(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function randomIdentity(): string {
  return crypto.randomUUID();
}

/**
 * Owns the private Window/Runner Data provisioning transaction.
 *
 * A channel is not recorded as current until both endpoints acknowledged the
 * same connection identity. Failed or stale operations remain fenced in the
 * cleanup map until both endpoints have acknowledged revocation, so a newer
 * channel cannot race an older late completion.
 */
export class PwaDataBroker {
  readonly sink: DataConnectionAuthoritySink;
  readonly onRuntimeDataProvisioner: (runtime: HostedRuntime, provisioner: PwaRuntimeDataProvisioner) => void;
  private authority: DataConnectionAuthorityView | null = null;
  private authorityRevision = 0;
  private readonly provisioners = new WeakMap<HostedRuntime, PwaRuntimeDataProvisioner>();
  private readonly terminated = new WeakSet<HostedRuntime>();
  private readonly current = new Map<string, Current>();
  private readonly cleanup = new Map<string, Operation>();
  private tail: Promise<void> = Promise.resolve();
  private dirty = false;
  private running = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private closed = false;

  constructor(
    private readonly bridge: DataWindowBridge,
    private readonly sessionEpoch: string,
    private readonly observe?: (event: Observation) => void,
  ) {
    this.sink = Object.freeze({
      replace: (view: DataConnectionAuthorityView | null) => {
        if (this.closed) return;
        this.authority = view;
        this.authorityRevision += 1;
        for (const operation of this.cleanup.values()) operation.controller.abort(new Error("Data authority replaced"));
        this.retryAttempt = 0;
        this.cancelRetry();
        this.schedule();
      },
    });
    this.onRuntimeDataProvisioner = (runtime, provisioner) => {
      if (this.closed || this.terminated.has(runtime)) return;
      this.provisioners.set(runtime, provisioner);
      runtime.terminated.then(
        () => {
          this.terminated.add(runtime);
          for (const operation of this.cleanup.values()) if (operation.runtime === runtime) operation.controller.abort(new Error("Data Runtime terminated"));
          if (this.provisioners.get(runtime) === provisioner) this.provisioners.delete(runtime);
          this.schedule();
        },
        (cause) => {
          this.report({ type: "data-runtime-termination-rejected", detail: failure(cause) });
          this.terminated.add(runtime);
          for (const operation of this.cleanup.values()) if (operation.runtime === runtime) operation.controller.abort(new Error("Data Runtime termination rejected"));
          if (this.provisioners.get(runtime) === provisioner) this.provisioners.delete(runtime);
          this.schedule();
        },
      );
      this.retryAttempt = 0;
      this.cancelRetry();
      this.schedule();
    };
  }

  /** Resolves after all work already scheduled on the broker has settled. */
  async whenIdle(): Promise<void> {
    let observed: Promise<void>;
    do {
      observed = this.tail;
      await observed;
    } while (observed !== this.tail);
  }

  private schedule(): void {
    if (this.closed) return;
    this.dirty = true;
    if (this.running) return;
    this.running = true;
    const drain = async () => {
      while (this.dirty && !this.closed) {
        this.dirty = false;
        try {
          await this.reconcile();
          this.retryAttempt = 0;
        } catch (cause) {
          this.report({ type: "data-reconcile-failed", detail: failure(cause) });
          if (this.dirty) continue;
          this.scheduleRetry();
          break;
        }
      }
    };
    this.tail = this.tail.then(drain, drain).finally(() => {
      this.running = false;
      if (this.dirty && !this.closed) this.schedule();
    });
  }

  private scheduleRetry(): void {
    if (this.closed || this.retryTimer !== null) return;
    const delays = [50, 250, 1_000] as const;
    const delay = delays[Math.min(this.retryAttempt, delays.length - 1)]!;
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.schedule();
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryTimer === null) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private report(event: Observation): void {
    try {
      this.observe?.(Object.freeze(event));
    } catch (cause) {
      console.error("PWA Data observation failed", cause);
    }
  }

  private desired(): Map<string, DataConnectionAuthorityEntry> {
    const desired = new Map<string, DataConnectionAuthorityEntry>();
    for (const entry of this.authority?.entries ?? []) {
      if (desired.has(entry.subsystemKey)) throw new Error(`Duplicate Data authority entry: ${entry.subsystemKey}`);
      if (!this.terminated.has(entry.runtime)) desired.set(entry.subsystemKey, entry);
    }
    return desired;
  }

  private operationStillDesired(operation: Operation): boolean {
    if (this.closed || operation.authorityRevision !== this.authorityRevision || this.terminated.has(operation.runtime)) return false;
    const entry = this.authority?.entries.find((candidate) => candidate.subsystemKey === operation.subsystemKey);
    return entry !== undefined
      && entry.runtime === operation.runtime
      && sameTuple(entry, operation)
      && this.provisioners.get(entry.runtime) === operation.provisioner;
  }

  private async reconcile(): Promise<void> {
    for (const operation of [...this.cleanup.values()]) await this.rollback(operation);
    const desired = this.desired();
    for (const [key, current] of [...this.current]) {
      const next = desired.get(key);
      if (
        current.state === "committed"
        && next !== undefined
        && next.runtime === current.runtime
        && sameTuple(next, current)
        && this.provisioners.get(next.runtime) === current.provisioner
      ) continue;
      await this.revokeCurrent(current);
    }
    if (this.authority === null || this.closed) return;
    for (const entry of this.desired().values()) {
      if (this.current.has(entry.subsystemKey) || this.cleanup.has(entry.subsystemKey)) continue;
      const provisioner = this.provisioners.get(entry.runtime);
      if (provisioner === undefined) continue;
      await this.provision(entry, provisioner);
    }
  }

  private async provision(entry: DataConnectionAuthorityEntry, provisioner: PwaRuntimeDataProvisioner): Promise<void> {
    const operation: Operation = {
      runtime: entry.runtime,
      provisioner,
      subsystemKey: entry.subsystemKey,
      generation: entry.generation,
      dataProfile: entry.dataProfile,
      authorityRevision: this.authorityRevision,
      connectionId: randomIdentity(),
      ports: new MessageChannel(),
      controller: new AbortController(),
      state: "preparing",
      runnerRevoked: false,
      windowRevoked: false,
    };
    this.cleanup.set(operation.subsystemKey, operation);
    try {
      const runnerInstall: Omit<PwaInstallSubsystemDataV1, "port"> = Object.freeze({
        formatVersion: 1,
        type: "data/install",
        requestId: randomIdentity(),
        subsystemKey: operation.subsystemKey,
        generation: operation.generation,
        dataProfile: operation.dataProfile,
        connectionId: operation.connectionId,
      });
      await operation.provisioner.install(runnerInstall, operation.ports.port2, operation.controller.signal);
      operation.state = "runner-installed";
      if (!this.operationStillDesired(operation)) throw new Error("Data authority changed during Runner installation");

      const windowInstall: PwaInstallRendererDataV1 = Object.freeze({
        formatVersion: 1,
        type: "renderer-data/install",
        requestId: randomIdentity(),
        sessionEpoch: this.sessionEpoch,
        subsystemKey: operation.subsystemKey,
        generation: operation.generation,
        dataProfile: operation.dataProfile,
        connectionId: operation.connectionId,
        port: operation.ports.port1,
      });
      await this.bridge.request(windowInstall, [operation.ports.port1], operation.controller.signal);
      operation.state = "window-installed";
      if (!this.operationStillDesired(operation)) throw new Error("Data authority changed during Window installation");

      this.cleanup.delete(operation.subsystemKey);
      this.current.set(operation.subsystemKey, {
        runtime: operation.runtime,
        provisioner: operation.provisioner,
        subsystemKey: operation.subsystemKey,
        generation: operation.generation,
        dataProfile: operation.dataProfile,
        connectionId: operation.connectionId,
        state: "committed",
        runnerRevoked: false,
        windowRevoked: false,
      });
      this.report({ type: "data-committed", subsystemKey: operation.subsystemKey, generation: operation.generation });
    } catch (cause) {
      this.report({ type: "data-provision-failed", subsystemKey: operation.subsystemKey, detail: failure(cause) });
      try {
        await this.rollback(operation);
      } catch (rollbackCause) {
        throw new AggregateError([cause, rollbackCause], "Data provisioning and rollback failed");
      }
      throw cause;
    }
  }

  private async rollback(operation: Operation): Promise<void> {
    operation.state = "rolling-back";
    operation.controller.abort(new Error("Data provisioning rolled back"));
    operation.ports.port1.close();
    operation.ports.port2.close();
    const failures: unknown[] = [];
    if (!operation.windowRevoked) {
      const request: PwaRevokeRendererDataV1 = Object.freeze({
        formatVersion: 1,
        type: "renderer-data/revoke",
        requestId: randomIdentity(),
        sessionEpoch: this.sessionEpoch,
        subsystemKey: operation.subsystemKey,
        generation: operation.generation,
        dataProfile: operation.dataProfile,
        connectionId: operation.connectionId,
      });
      try {
        await this.bridge.request(request);
        operation.windowRevoked = true;
      } catch (cause) {
        failures.push(cause);
      }
    }
    if (!operation.runnerRevoked) {
      try {
        await operation.provisioner.revoke(this.runnerRevoke(operation));
        operation.runnerRevoked = true;
      } catch (cause) {
        failures.push(cause);
      }
    }
    if (operation.windowRevoked && operation.runnerRevoked) {
      this.cleanup.delete(operation.subsystemKey);
      this.report({ type: "data-rollback-complete", subsystemKey: operation.subsystemKey });
    }
    if (failures.length > 0) throw new AggregateError(failures, "Data rollback incomplete");
  }

  private async revokeCurrent(current: Current): Promise<void> {
    current.state = "revoking";
    const failures: unknown[] = [];
    if (!current.windowRevoked) {
      const request: PwaRevokeRendererDataV1 = Object.freeze({
        formatVersion: 1,
        type: "renderer-data/revoke",
        requestId: randomIdentity(),
        sessionEpoch: this.sessionEpoch,
        subsystemKey: current.subsystemKey,
        generation: current.generation,
        dataProfile: current.dataProfile,
        connectionId: current.connectionId,
      });
      try {
        await this.bridge.request(request);
        current.windowRevoked = true;
      } catch (cause) {
        failures.push(cause);
      }
    }
    if (!current.runnerRevoked) {
      try {
        await current.provisioner.revoke(this.runnerRevoke(current));
        current.runnerRevoked = true;
      } catch (cause) {
        failures.push(cause);
      }
    }
    if (current.windowRevoked && current.runnerRevoked) {
      this.current.delete(current.subsystemKey);
      this.report({ type: "data-revoked", subsystemKey: current.subsystemKey });
    }
    if (failures.length > 0) throw new AggregateError(failures, "Data revoke incomplete");
  }

  private runnerRevoke(tuple: DataTuple & { readonly connectionId: string }): PwaRevokeSubsystemDataV1 {
    return Object.freeze({
      formatVersion: 1,
      type: "data/revoke",
      requestId: randomIdentity(),
      subsystemKey: tuple.subsystemKey,
      generation: tuple.generation,
      dataProfile: tuple.dataProfile,
      connectionId: tuple.connectionId,
    });
  }

  async close(): Promise<void> {
    if (this.closed) {
      await this.whenIdle();
      return;
    }
    this.closed = true;
    this.authority = null;
    this.authorityRevision += 1;
    for (const operation of this.cleanup.values()) operation.controller.abort(new Error("Data broker closed"));
    this.cancelRetry();
    await this.whenIdle();
    const shutdowns: Promise<void>[] = [];
    for (const operation of this.cleanup.values()) shutdowns.push(this.rollback(operation));
    for (const current of this.current.values()) shutdowns.push(this.revokeCurrent(current));
    const results = await Promise.allSettled(shutdowns);
    for (const result of results) {
      if (result.status === "rejected") this.report({ type: "data-shutdown-revoke-failed", detail: failure(result.reason) });
    }
    this.cleanup.clear();
    this.current.clear();
  }
}
