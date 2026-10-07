import type { DataConnectionAuthoritySink, DataConnectionAuthorityView, HostedRuntime } from "@loomrealm/platform-ports";
import type { PwaInstallRendererDataV1, PwaInstallSubsystemDataV1, PwaRevokeSubsystemDataV1 } from "./bootstrap-protocol.js";
import type { PwaRuntimeDataProvisioner } from "./runtime-hosting.js";
import { SessionWindowBridge } from "./window-bridge.js";

interface Current {
  readonly runtime: HostedRuntime;
  readonly provisioner: PwaRuntimeDataProvisioner;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly requestId: string;
}

export class PwaDataBroker {
  readonly sink: DataConnectionAuthoritySink;
  readonly onRuntimeDataProvisioner: (runtime: HostedRuntime, provisioner: PwaRuntimeDataProvisioner) => void;
  private authority: DataConnectionAuthorityView | null = null;
  private readonly provisioners = new WeakMap<HostedRuntime, PwaRuntimeDataProvisioner>();
  private readonly current = new Map<string, Current>();
  private tail = Promise.resolve();
  private closed = false;

  constructor(private readonly bridge: SessionWindowBridge, private readonly sessionEpoch: string) {
    this.sink = Object.freeze({ replace: (view: DataConnectionAuthorityView | null) => { this.authority = view; this.schedule(); } });
    this.onRuntimeDataProvisioner = (runtime, provisioner) => { this.provisioners.set(runtime, provisioner); this.schedule(); };
  }

  private schedule(): void {
    this.tail = this.tail.then(() => this.reconcile()).catch(() => {});
  }

  private async reconcile(): Promise<void> {
    if (this.closed) return;
    const desired = new Map((this.authority?.entries ?? []).map((entry) => [entry.subsystemKey, entry] as const));
    for (const [key, current] of [...this.current]) {
      const next = desired.get(key);
      if (next !== undefined && next.runtime === current.runtime && next.generation === current.generation && next.dataProfile === current.dataProfile) continue;
      const revoke: PwaRevokeSubsystemDataV1 = Object.freeze({ formatVersion: 1, type: "data/revoke", subsystemKey: current.subsystemKey, generation: current.generation, dataProfile: current.dataProfile });
      current.provisioner.revoke(revoke);
      this.current.delete(key);
    }
    if (this.authority === null) return;
    for (const entry of this.authority.entries) {
      if (this.current.has(entry.subsystemKey)) continue;
      const provisioner = this.provisioners.get(entry.runtime);
      if (provisioner === undefined) continue;
      const requestId = crypto.randomUUID();
      const pair = new MessageChannel();
      const rendererMessage: PwaInstallRendererDataV1 = Object.freeze({ formatVersion: 1, type: "renderer-data/install", requestId, sessionEpoch: this.sessionEpoch, subsystemKey: entry.subsystemKey, generation: entry.generation, dataProfile: entry.dataProfile, port: pair.port1 });
      const runnerMessage: Omit<PwaInstallSubsystemDataV1, "port"> = Object.freeze({ formatVersion: 1, type: "data/install", subsystemKey: entry.subsystemKey, generation: entry.generation, dataProfile: entry.dataProfile });
      provisioner.install(runnerMessage, pair.port2);
      await this.bridge.request(rendererMessage, [pair.port1]);
      this.current.set(entry.subsystemKey, Object.freeze({ runtime: entry.runtime, provisioner, subsystemKey: entry.subsystemKey, generation: entry.generation, dataProfile: entry.dataProfile, requestId }));
    }
  }

  close(): void {
    this.closed = true;
    this.authority = null;
    for (const current of this.current.values()) current.provisioner.revoke(Object.freeze({ formatVersion: 1, type: "data/revoke", subsystemKey: current.subsystemKey, generation: current.generation, dataProfile: current.dataProfile }));
    this.current.clear();
  }
}
