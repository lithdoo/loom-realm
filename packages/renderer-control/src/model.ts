import type { MessageCarrier } from "@loomrealm/foundation";

export type AuthorityRevision = number;

export type RendererRuntimeLifecycleV2 =
  | "declared"
  | "starting"
  | "connected"
  | "identified"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed";

export interface RendererRuntimeStateV2 {
  readonly subsystemKey: string;
  readonly state: RendererRuntimeLifecycleV2;
}

export type RendererFrameLifecycleV2 =
  | "starting"
  | "active"
  | "suspended"
  | "closing";

export interface RendererFrameStateV2 {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly lifecycle: RendererFrameLifecycleV2;
  readonly activationId?: string;
}

export interface RendererDataAuthorityV2 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}

export interface RendererAuthoritySnapshotV2 {
  readonly sessionId: string;
  readonly revision: AuthorityRevision;
  readonly runtimes: readonly RendererRuntimeStateV2[];
  readonly stack: readonly RendererFrameStateV2[];
  readonly dataAuthorities: readonly RendererDataAuthorityV2[];
}

export interface RendererHelloParamsV2 {
  readonly rendererControlToken: string;
  readonly protocolVersions: readonly number[];
}

export interface RendererHelloResultV2 {
  readonly protocolVersion: 2;
  readonly snapshot: RendererAuthoritySnapshotV2;
}

export interface RendererStateParamsV2 {
  readonly snapshot: RendererAuthoritySnapshotV2;
}

export type RendererControlTerminalKind =
  | "retired"
  | "carrier-closed"
  | "carrier-lost"
  | "protocol-fatal"
  | "local-fatal";

export interface RendererControlTerminal {
  readonly kind: RendererControlTerminalKind;
  readonly cause?: unknown;
}

export type RendererControlPublishOutcome =
  | { readonly kind: "accepted" }
  | { readonly kind: "terminal"; readonly terminal: RendererControlTerminal };

export type MainRendererControlHelloAcceptance =
  | {
      readonly kind: "accepted";
      readonly snapshot: RendererAuthoritySnapshotV2;
      readonly preparedHelloText: string;
    }
  | {
      readonly kind: "rejected";
      readonly code: "RENDERER_AUTHENTICATION_FAILED" | "PROTOCOL_STATE_ERROR";
    };

export interface MainRendererControlPeerOptions {
  readonly carrier: MessageCarrier;
  acceptHello(
    peer: MainRendererControlPeer,
    params: RendererHelloParamsV2,
    selectedProtocolVersion: 2,
  ):
    | MainRendererControlHelloAcceptance
    | Promise<MainRendererControlHelloAcceptance>;
}

export interface MainRendererControlPeer {
  readonly terminal: Promise<RendererControlTerminal>;
  publish(snapshot: RendererAuthoritySnapshotV2): RendererControlPublishOutcome;
  retire(): RendererControlTerminal;
}

export interface RendererControlPeer {
  readonly terminal: Promise<RendererControlTerminal>;
  states(): AsyncIterable<RendererAuthoritySnapshotV2>;
  close(): Promise<void>;
}

export interface RendererPeerConnectOptions {
  readonly carrier: MessageCarrier;
  readonly rendererControlToken: string;
  readonly protocolVersions?: readonly number[];
}

export type RendererPeerConnectOutcome =
  | {
      readonly kind: "connected";
      readonly peer: RendererControlPeer;
      readonly snapshot: RendererAuthoritySnapshotV2;
    }
  | {
      readonly kind: "rejected";
      readonly code:
        | "RENDERER_AUTHENTICATION_FAILED"
        | "RENDERER_CONTROL_PROTOCOL_UNSUPPORTED"
        | "PROTOCOL_STATE_ERROR";
    }
  | { readonly kind: "terminal"; readonly terminal: RendererControlTerminal };
