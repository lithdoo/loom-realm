import type { MessageCarrier } from "@loomrealm/foundation";

export type AuthorityRevision = number;

export type RendererRuntimeLifecycleV1 =
  | "declared"
  | "starting"
  | "connected"
  | "identified"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed";

export interface RendererRuntimeStateV1 {
  readonly subsystemKey: string;
  readonly state: RendererRuntimeLifecycleV1;
}

export type RendererFrameLifecycleV1 =
  | "starting"
  | "active"
  | "suspended"
  | "closing";

export interface RendererFrameStateV1 {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly lifecycle: RendererFrameLifecycleV1;
  readonly activationId?: string;
}

export interface RendererInputTargetV1 {
  readonly subsystemKey: string;
  readonly frameId: string;
  readonly activationId: string;
}

export interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}

export interface RendererAuthoritySnapshotV1 {
  readonly sessionId: string;
  readonly revision: AuthorityRevision;
  readonly runtimes: readonly RendererRuntimeStateV1[];
  readonly stack: readonly RendererFrameStateV1[];
  readonly inputTarget: RendererInputTargetV1 | null;
  readonly dataAuthorities: readonly RendererDataAuthorityV1[];
}

export interface RendererHelloParamsV1 {
  readonly rendererControlToken: string;
  readonly protocolVersions: readonly number[];
}

export interface RendererHelloResultV1 {
  readonly protocolVersion: 1;
  readonly snapshot: RendererAuthoritySnapshotV1;
}

export interface RendererStateParamsV1 {
  readonly snapshot: RendererAuthoritySnapshotV1;
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
      readonly snapshot: RendererAuthoritySnapshotV1;
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
    params: RendererHelloParamsV1,
    selectedProtocolVersion: 1,
  ):
    | MainRendererControlHelloAcceptance
    | Promise<MainRendererControlHelloAcceptance>;
}

export interface MainRendererControlPeer {
  readonly terminal: Promise<RendererControlTerminal>;
  publish(snapshot: RendererAuthoritySnapshotV1): RendererControlPublishOutcome;
  retire(): RendererControlTerminal;
}

export interface RendererControlPeer {
  readonly terminal: Promise<RendererControlTerminal>;
  states(): AsyncIterable<RendererAuthoritySnapshotV1>;
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
      readonly snapshot: RendererAuthoritySnapshotV1;
    }
  | {
      readonly kind: "rejected";
      readonly code:
        | "RENDERER_AUTHENTICATION_FAILED"
        | "RENDERER_CONTROL_PROTOCOL_UNSUPPORTED"
        | "PROTOCOL_STATE_ERROR";
    }
  | { readonly kind: "terminal"; readonly terminal: RendererControlTerminal };
