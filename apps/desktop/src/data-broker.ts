import { randomBytes } from "node:crypto";
import type {
  DataConnectionAuthorityEntry,
  DataConnectionAuthoritySink,
  DataConnectionAuthorityView,
  HostedRuntime,
  RendererDataBinding,
} from "@loomrealm/platform-ports";
import type { HostraRuntimeDataProvisioner } from "@loomrealm/game-launcher-hostra";
import {
  createDesktopDataWebSocketPair,
  DEFAULT_DATA_BUFFER_POLICY,
  type DataBufferPolicy,
  type DesktopDataWebSocketPair,
} from "./data-websocket.js";
import { DesktopRendererDataBinding } from "./renderer-data-binding.js";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return {
    promise,
    resolve(value) { if (!settled) { settled = true; resolvePromise(value); } },
  };
}

interface CandidateIdentity {
  readonly rendererControlToken: string;
  readonly runtime: HostedRuntime;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}

interface Candidate extends CandidateIdentity {
  readonly candidateId: string;
  readonly provisioner: HostraRuntimeDataProvisioner;
  readonly renderer: DesktopRendererDataBinding;
  readonly controller: AbortController;
  readonly completion: Deferred<boolean>;
  physical: DesktopDataWebSocketPair | null;
  state: "preparing" | "prepared" | "current" | "retired";
}

interface Slot {
  current: Candidate | null;
  pending: Candidate | null;
  tail: Promise<void>;
}

export interface DesktopDataBrokerOptions {
  readonly bufferPolicy?: DataBufferPolicy;
  readonly candidateId?: () => string;
}

export class DesktopDataConnectionBroker {
  readonly sink: DataConnectionAuthoritySink;
  readonly onRuntimeDataProvisioner: (
    runtime: HostedRuntime,
    provisioner: HostraRuntimeDataProvisioner,
  ) => void;

  private authority: DataConnectionAuthorityView | null = null;
  private readonly provisioners = new WeakMap<HostedRuntime, HostraRuntimeDataProvisioner>();
  private readonly renderers = new Map<string, DesktopRendererDataBinding>();
  private readonly slots = new Map<string, Slot>();
  private readonly policy: DataBufferPolicy;
  private readonly mintCandidateId: () => string;
  private closed = false;

  constructor(options: DesktopDataBrokerOptions = {}) {
    this.policy = options.bufferPolicy ?? DEFAULT_DATA_BUFFER_POLICY;
    if (
      !Number.isSafeInteger(this.policy.maxMessages) || this.policy.maxMessages <= 0 ||
      !Number.isSafeInteger(this.policy.maxBytes) || this.policy.maxBytes <= 0
    ) {
      throw new TypeError("Invalid Desktop Data buffer policy");
    }
    this.mintCandidateId = options.candidateId ?? (() => randomBytes(24).toString("base64url"));
    this.sink = Object.freeze({
      replace: (view: DataConnectionAuthorityView | null) => this.replace(view),
    });
    this.onRuntimeDataProvisioner = (runtime, provisioner) => {
      this.provisioners.set(runtime, provisioner);
      this.scheduleReconcile();
    };
  }

  rendererDataBinding(rendererControlToken: string): RendererDataBinding {
    if (typeof rendererControlToken !== "string" || rendererControlToken.length === 0) {
      throw new TypeError("Invalid Renderer Control correlation token");
    }
    let renderer = this.renderers.get(rendererControlToken);
    if (renderer === undefined) {
      renderer = new DesktopRendererDataBinding(this.policy);
      this.renderers.set(rendererControlToken, renderer);
      for (const [token, stale] of this.renderers) {
        if (token === rendererControlToken || token === this.authority?.rendererControlToken) continue;
        stale.close();
        this.renderers.delete(token);
      }
      this.scheduleReconcile();
    }
    return renderer.binding;
  }

  requestCandidate(subsystemKey: string): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    const view = this.authority;
    const entry = view?.entries.find((candidate) => candidate.subsystemKey === subsystemKey);
    if (view === null || view === undefined || entry === undefined) return Promise.resolve(false);
    const slot = this.slot(subsystemKey);
    if (slot.pending !== null) return Promise.resolve(false);
    const renderer = this.renderers.get(view.rendererControlToken);
    const provisioner = this.provisioners.get(entry.runtime);
    if (renderer === undefined || provisioner === undefined) return Promise.resolve(false);
    let candidateId: string;
    try { candidateId = this.mintCandidateId(); }
    catch { return Promise.resolve(false); }
    if (typeof candidateId !== "string" || candidateId.length === 0) return Promise.resolve(false);
    const completion = deferred<boolean>();
    const candidate: Candidate = {
      candidateId,
      rendererControlToken: view.rendererControlToken,
      runtime: entry.runtime,
      subsystemKey: entry.subsystemKey,
      generation: entry.generation,
      dataProfile: entry.dataProfile,
      provisioner,
      renderer,
      controller: new AbortController(),
      completion,
      physical: null,
      state: "preparing",
    };
    slot.pending = candidate;
    void this.prepareCandidate(slot, candidate);
    return completion.promise;
  }

  private slot(subsystemKey: string): Slot {
    let slot = this.slots.get(subsystemKey);
    if (slot === undefined) {
      slot = { current: null, pending: null, tail: Promise.resolve() };
      this.slots.set(subsystemKey, slot);
    }
    return slot;
  }

  private replace(view: DataConnectionAuthorityView | null): void {
    if (this.closed && view !== null) return;
    const oldRendererControlToken = this.authority?.rendererControlToken;
    this.authority = view;
    const retired: Candidate[] = [];
    try {
      for (const slot of this.slots.values()) {
        if (slot.pending !== null && !this.authorized(slot.pending)) {
          retired.push(slot.pending);
          slot.pending = null;
        }
        if (slot.current !== null && !this.authorized(slot.current)) {
          retired.push(slot.current);
          slot.current = null;
        }
      }
    } catch {
      // Logical invalidation above is synchronous; cleanup remains best effort.
    }
    for (const candidate of retired) {
      try { this.retire(candidate); } catch { candidate.completion.resolve(false); }
    }
    if (oldRendererControlToken !== undefined && oldRendererControlToken !== view?.rendererControlToken) {
      const stale = this.renderers.get(oldRendererControlToken);
      try { stale?.close(); } catch {}
      this.renderers.delete(oldRendererControlToken);
    }
    try { this.scheduleReconcile(); } catch {}
  }

  private authorityEntry(subsystemKey: string): DataConnectionAuthorityEntry | undefined {
    return this.authority?.entries.find((entry) => entry.subsystemKey === subsystemKey);
  }

  private authorized(candidate: CandidateIdentity): boolean {
    const view = this.authority;
    if (view === null || view.rendererControlToken !== candidate.rendererControlToken) return false;
    const entry = this.authorityEntry(candidate.subsystemKey);
    return entry !== undefined &&
      entry.runtime === candidate.runtime &&
      entry.generation === candidate.generation &&
      entry.dataProfile === candidate.dataProfile;
  }

  private scheduleReconcile(): void {
    queueMicrotask(() => {
      if (this.closed || this.authority === null) return;
      for (const entry of this.authority.entries) {
        const slot = this.slot(entry.subsystemKey);
        const currentMatches = slot.current !== null && this.authorized(slot.current);
        if (!currentMatches && slot.pending === null) void this.requestCandidate(entry.subsystemKey);
      }
    });
  }

  private async prepareCandidate(slot: Slot, candidate: Candidate): Promise<void> {
    try {
      const physical = await createDesktopDataWebSocketPair(
        this.policy,
        (cause) => this.onPhysicalFailure(slot, candidate, cause),
      );
      candidate.physical = physical;
      if (slot.pending !== candidate || !this.authorized(candidate) || candidate.controller.signal.aborted) {
        physical.dispose();
        this.disposePending(slot, candidate);
        return;
      }
      const tuple = {
        subsystemKey: candidate.subsystemKey,
        generation: candidate.generation,
        dataProfile: candidate.dataProfile,
      };
      await Promise.all([
        candidate.renderer.prepare(
          candidate.candidateId,
          physical.rendererEndpoint,
          tuple,
          candidate.controller.signal,
        ),
        candidate.provisioner.prepare({
          candidateId: candidate.candidateId,
          endpoint: physical.runnerEndpoint,
          generation: candidate.generation,
          dataProfile: candidate.dataProfile,
        }, candidate.controller.signal),
        physical.prepared,
      ]);
      candidate.state = "prepared";
      this.enqueue(slot, () => this.install(slot, candidate));
    } catch {
      this.enqueue(slot, () => this.disposePending(slot, candidate));
    }
  }

  private install(slot: Slot, candidate: Candidate): void {
    if (
      slot.pending !== candidate ||
      candidate.state !== "prepared" ||
      candidate.physical === null ||
      !this.authorized(candidate)
    ) {
      this.disposePending(slot, candidate);
      return;
    }
    const old = slot.current;
    if (old !== null) {
      old.state = "retired";
      old.controller.abort(new Error("Data Connection superseded"));
      slot.current = null;
    }
    slot.pending = null;
    slot.current = candidate;
    candidate.state = "current";
    const tuple = {
      subsystemKey: candidate.subsystemKey,
      generation: candidate.generation,
      dataProfile: candidate.dataProfile,
    };
    if (!candidate.physical.install() || !candidate.renderer.commit(candidate.candidateId, tuple)) {
      slot.current = null;
      this.retire(candidate);
      if (old !== null) this.cleanupRetired(old);
      return;
    }
    let delivery: Promise<void>;
    try {
      delivery = candidate.provisioner.commit(candidate.candidateId, candidate.controller.signal);
    } catch (error) {
      delivery = Promise.reject(error);
    }
    if (old !== null) this.cleanupRetired(old);
    candidate.completion.resolve(true);
    void delivery.then(
      () => {},
      () => this.enqueue(slot, () => {
        if (slot.current !== candidate) return;
        slot.current = null;
        this.retire(candidate);
        this.scheduleReconcile();
      }),
    );
  }

  private onPhysicalFailure(slot: Slot, candidate: Candidate, _cause: unknown): void {
    this.enqueue(slot, () => {
      if (slot.pending === candidate) {
        slot.pending = null;
        this.retire(candidate);
      }
      if (slot.current === candidate) {
        slot.current = null;
        this.retire(candidate);
        this.scheduleReconcile();
      }
    });
  }

  private disposePending(slot: Slot, candidate: Candidate): void {
    if (slot.pending === candidate) slot.pending = null;
    this.retire(candidate);
  }

  private retire(candidate: Candidate): void {
    if (candidate.state === "retired") {
      candidate.completion.resolve(false);
      return;
    }
    candidate.state = "retired";
    candidate.controller.abort(new Error("Data Connection retired"));
    this.cleanupRetired(candidate);
    candidate.completion.resolve(false);
  }

  private cleanupRetired(candidate: Candidate): void {
    try { candidate.provisioner.revoke(candidate.candidateId); } catch {}
    try { candidate.physical?.dispose(); } catch {}
    candidate.renderer.revoke(candidate.candidateId);
    candidate.completion.resolve(candidate.state === "current");
  }

  private enqueue(slot: Slot, operation: () => void): void {
    const next = slot.tail.then(operation, operation);
    slot.tail = next.then(() => undefined, () => undefined);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.replace(null);
    for (const renderer of this.renderers.values()) renderer.close();
    this.renderers.clear();
  }
}
