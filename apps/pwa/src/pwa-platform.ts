import type { PwaLaunchPlan } from "@loomrealm/game-launcher-pwa";
import type { MainPlatform, MainRealmStateFatalSource } from "@loomrealm/main";
import type { RendererControlBinding } from "@loomrealm/platform-ports";
import type { RealmStateAuthority } from "@loomrealm/realm-state";
import type { PwaInstallRendererControlV1 } from "./bootstrap-protocol.js";
import { PwaDataBroker } from "./data-broker.js";
import { createMessagePortCarrier } from "./message-port-carrier.js";
import { createPwaRuntimeHosting } from "./runtime-hosting.js";
import { SessionWindowBridge } from "./window-bridge.js";

function opaque(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export class PwaPlatform {
  readonly main: MainPlatform;
  private readonly bridge: SessionWindowBridge;
  private readonly broker: PwaDataBroker;
  private closed = false;

  constructor(options: {
    readonly launchPlan: PwaLaunchPlan;
    readonly sessionEpoch: string;
    readonly bridgePort: MessagePort;
    readonly realmStateAuthority: RealmStateAuthority;
    readonly realmStateFatal: MainRealmStateFatalSource;
    readonly observe?: (event: Readonly<Record<string, unknown> & { type: string }>) => void;
  }) {
    this.bridge = new SessionWindowBridge(options.bridgePort, options.sessionEpoch);
    this.broker = new PwaDataBroker(this.bridge, options.sessionEpoch);
    const rendererControl: RendererControlBinding = Object.freeze({
      acquire: async (rendererControlToken: string, signal: AbortSignal) => {
        if (this.closed || signal.aborted) throw signal.reason ?? new Error("PWA Platform closed");
        const pair = new MessageChannel();
        const requestId = crypto.randomUUID();
        const message: PwaInstallRendererControlV1 = Object.freeze({ formatVersion: 1, type: "renderer-control/install", requestId, sessionEpoch: options.sessionEpoch, rendererControlToken, port: pair.port2 });
        try { await this.bridge.request(message, [pair.port2]); }
        catch (cause) { pair.port1.close(); throw cause; }
        if (signal.aborted) { pair.port1.close(); throw signal.reason; }
        return createMessagePortCarrier(pair.port1);
      },
    });
    const runtimeHosting = createPwaRuntimeHosting({
      launchPlan: options.launchPlan,
      sessionEpoch: options.sessionEpoch,
      realmStateAuthority: options.realmStateAuthority,
      onRuntimeDataProvisioner: this.broker.onRuntimeDataProvisioner,
      observe: options.observe,
    });
    this.main = Object.freeze({
      scheduler: Object.freeze({ schedule(delayMs: number, callback: () => void) { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); } }),
      opaqueMaterial: Object.freeze({ generate: opaque }),
      runtimeHosting,
      rendererControl,
      dataConnections: this.broker.sink,
      realmStateFatal: options.realmStateFatal,
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.broker.close();
    this.bridge.close();
  }
}
