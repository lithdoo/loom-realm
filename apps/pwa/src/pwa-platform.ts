import type { PwaLaunchPlan } from "@loomrealm/game-launcher-pwa";
import type {
  MainPlatform,
  MainSharedStateFatalSource,
  MainSessionEventsFatalSource,
} from "@loomrealm/main";
import type { RendererControlBinding } from "@loomrealm/platform-ports";
import type { SharedStateAuthority } from "@loomrealm/shared-state";
import type { SessionEventHub } from "@loomrealm/session-events";
import {
  serveRendererPresentationEventCarrier,
  type PresentationEventCarrierServer,
} from "@loomrealm/renderer";
import type {
  PwaInstallPresentationEventsV1,
  PwaInstallRendererControlV1,
} from "./bootstrap-protocol.js";
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
  private readonly presentationEvents: PresentationEventCarrierServer;
  private readonly presentationInstall: Promise<void>;
  private closed = false;

  constructor(options: {
    readonly launchPlan: PwaLaunchPlan;
    readonly sessionEpoch: string;
    readonly bridgePort: MessagePort;
    readonly sharedStateAuthority: SharedStateAuthority;
    readonly sharedStateFatal: MainSharedStateFatalSource;
    readonly sessionEventHub: SessionEventHub;
    readonly sessionEventsFatal: MainSessionEventsFatalSource;
    readonly observe?: (event: Readonly<Record<string, unknown> & { type: string }>) => void;
  }) {
    this.bridge = new SessionWindowBridge(options.bridgePort, options.sessionEpoch);
    this.broker = new PwaDataBroker(this.bridge, options.sessionEpoch, options.observe);
    const presentationPair = new MessageChannel();
    this.presentationEvents = serveRendererPresentationEventCarrier(
      createMessagePortCarrier(presentationPair.port1),
      async (event) => {
        if (!this.broker.authorizesPresentationEvent(event.ownerSubsystemKey, event.generation)) return false;
        const publisher = options.sessionEventHub.createDelegatedPublisher(event.ownerSubsystemKey);
        await publisher.publish(
          event.channel,
          event.type,
          event.payload,
          event.broadcast ? undefined : event.ownerSubsystemKey,
        );
        return true;
      },
    );
    const presentationRequest: PwaInstallPresentationEventsV1 = Object.freeze({
      formatVersion: 1,
      type: "presentation-events/install",
      requestId: crypto.randomUUID(),
      sessionEpoch: options.sessionEpoch,
      port: presentationPair.port2,
    });
    this.presentationInstall = this.bridge.request(
      presentationRequest,
      [presentationPair.port2],
    ).catch(async (cause) => {
      await this.presentationEvents.close();
      throw cause;
    });
    void this.presentationInstall.catch(() => undefined);
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
      sharedStateAuthority: options.sharedStateAuthority,
      sessionEventHub: options.sessionEventHub,
      onRuntimeDataProvisioner: this.broker.onRuntimeDataProvisioner,
      observe: options.observe,
    });
    this.main = Object.freeze({
      scheduler: Object.freeze({ schedule(delayMs: number, callback: () => void) { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); } }),
      opaqueMaterial: Object.freeze({ generate: opaque }),
      runtimeHosting,
      rendererControl,
      dataConnections: this.broker.sink,
      sharedStateFatal: options.sharedStateFatal,
      sessionEventsFatal: options.sessionEventsFatal,
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.presentationEvents.close();
      await this.broker.close();
    } finally {
      this.bridge.close();
    }
  }
}
