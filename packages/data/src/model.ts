import type { MessageCarrier } from "@loomrealm/foundation";
import type { JsonObject, JsonValue } from "@loomrealm/wire";

export const RENDERER_DATA_PROFILE_V3 = "loomrealm.renderer-data/3" as const;
export type RendererDataProfileV3 = typeof RENDERER_DATA_PROFILE_V3;

export interface DataCurrentBindingV3 {
  readonly carrier: MessageCarrier;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: RendererDataProfileV3;
}

export interface RenderDomainsV1 { readonly type: "render.domains"; readonly domains: readonly string[]; }
export interface RenderNodeV1 {
  readonly key: string;
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly data: JsonObject;
  readonly children: readonly RenderNodeV1[];
}
export interface RenderSnapshotV1 { readonly type: "render.snapshot"; readonly domainId: string; readonly revision: number; readonly zIndex: number; readonly roots: readonly RenderNodeV1[]; }
export interface RenderNodeInsertV1 { readonly op: "insert"; readonly parentKey: string | null; readonly beforeKey: string | null; readonly node: RenderNodeV1; }
export interface RenderNodeRemoveV1 { readonly op: "remove"; readonly key: string; }
export interface RenderNodeMoveV1 { readonly op: "move"; readonly key: string; readonly parentKey: string | null; readonly beforeKey: string | null; }
export interface StringMapDeltaV1 { readonly set?: Readonly<Record<string, string>>; readonly remove?: readonly string[]; }
export interface JsonObjectDeltaV1 { readonly set?: Readonly<Record<string, JsonValue>>; readonly remove?: readonly string[]; }
export interface RenderNodeUpdateV1 { readonly op: "update"; readonly key: string; readonly attrs?: StringMapDeltaV1; readonly data?: JsonObjectDeltaV1; }
export type RenderPatchOpV1 = RenderNodeInsertV1 | RenderNodeRemoveV1 | RenderNodeMoveV1 | RenderNodeUpdateV1;
export interface RenderPatchV1 { readonly type: "render.patch"; readonly domainId: string; readonly baseRevision: number; readonly revision: number; readonly zIndex?: number; readonly ops: readonly RenderPatchOpV1[]; }
export interface RenderEventV1 { readonly type: "render.event"; readonly domainId: string; readonly targetKey: string; readonly name: string; readonly data: JsonObject; }
export type RenderUpdateMessageV1 = RenderDomainsV1 | RenderSnapshotV1 | RenderPatchV1 | RenderEventV1;
export interface ViewportStateV1 {
  readonly type: "viewport.state";
  readonly width: number;
  readonly height: number;
}
export interface PresentationFrameInterestV1 {
  readonly frameId: string;
  readonly channels: readonly string[];
}
export interface PresentationInterestV1 {
  readonly type: "presentation.interest";
  readonly frames: readonly PresentationFrameInterestV1[];
}
export interface PresentationEventV1 {
  readonly type: "presentation.event";
  readonly sourceSubsystemKey: string;
  readonly domainId: string;
  readonly targetKey: string;
  readonly frameId: string;
  readonly activationId: string;
  readonly channel: string;
  readonly name: string;
  readonly data: JsonObject;
}
export type RendererDataMessageV3 =
  | RenderUpdateMessageV1
  | ViewportStateV1
  | PresentationInterestV1
  | PresentationEventV1;

export type DataProtocolFamily = "profile" | "render" | "viewport" | "presentation";
export type DataTerminal =
  | { readonly kind: "carrier-closed" }
  | { readonly kind: "carrier-lost"; readonly cause?: unknown }
  | { readonly kind: "protocol-fatal"; readonly protocol: DataProtocolFamily; readonly cause?: unknown }
  | { readonly kind: "local-fatal"; readonly cause: unknown };
export type DataSendOutcome = { readonly kind: "sent" } | { readonly kind: "terminal"; readonly terminal: DataTerminal };
export type DataInboundDisposition = { readonly kind: "accepted" } | { readonly kind: "protocol-fatal"; readonly cause?: unknown };

export interface SubsystemDataHandlers {
  onViewportState(message: ViewportStateV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onPresentationEvent?(message: PresentationEventV1): DataInboundDisposition | Promise<DataInboundDisposition>;
}
export interface SubsystemDataPeerOptions { readonly binding: DataCurrentBindingV3; readonly handlers: SubsystemDataHandlers; }
export interface SubsystemRenderDataPeer {
  sendDomains(message: RenderDomainsV1): Promise<DataSendOutcome>;
  sendSnapshot(message: RenderSnapshotV1): Promise<DataSendOutcome>;
  sendPatch(message: RenderPatchV1): Promise<DataSendOutcome>;
  sendEvent(message: RenderEventV1): Promise<DataSendOutcome>;
}
export interface SubsystemPresentationDataPeer {
  sendInterest(message: PresentationInterestV1): Promise<DataSendOutcome>;
}
export interface DataBindingViewV3 { readonly subsystemKey: string; readonly generation: number; readonly dataProfile: RendererDataProfileV3; }
export interface SubsystemDataPeer {
  readonly binding: Readonly<DataBindingViewV3>;
  readonly render: SubsystemRenderDataPeer;
  readonly presentation: SubsystemPresentationDataPeer;
  readonly terminal: Promise<DataTerminal>;
  close(): Promise<void>;
}

export interface RendererDataHandlers {
  onRenderDomains(message: RenderDomainsV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderSnapshot(message: RenderSnapshotV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderPatch(message: RenderPatchV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderEvent(message: RenderEventV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onPresentationInterest?(message: PresentationInterestV1): DataInboundDisposition | Promise<DataInboundDisposition>;
}
export interface RendererDataPeerOptions { readonly binding: DataCurrentBindingV3; readonly handlers: RendererDataHandlers; }
export interface RendererViewportDataPeer {
  sendState(message: ViewportStateV1): Promise<DataSendOutcome>;
}
export interface RendererPresentationDataPeer {
  sendEvent(message: PresentationEventV1): Promise<DataSendOutcome>;
}
export interface RendererDataPeer {
  readonly binding: Readonly<DataBindingViewV3>;
  readonly viewport: RendererViewportDataPeer;
  readonly presentation: RendererPresentationDataPeer;
  readonly terminal: Promise<DataTerminal>;
  close(): Promise<void>;
}
