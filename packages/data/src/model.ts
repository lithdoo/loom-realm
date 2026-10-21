import type { MessageCarrier } from "@loomrealm/foundation";
import type { JsonObject, JsonValue } from "@loomrealm/wire";

export const RENDERER_DATA_PROFILE_V2 = "loomrealm.renderer-data/2" as const;
export type RendererDataProfileV2 = typeof RENDERER_DATA_PROFILE_V2;

export interface DataCurrentBindingV2 {
  readonly carrier: MessageCarrier;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: RendererDataProfileV2;
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
export type RendererDataMessageV2 = RenderUpdateMessageV1 | ViewportStateV1;

export type DataProtocolFamily = "profile" | "render" | "viewport";
export type DataTerminal =
  | { readonly kind: "carrier-closed" }
  | { readonly kind: "carrier-lost"; readonly cause?: unknown }
  | { readonly kind: "protocol-fatal"; readonly protocol: DataProtocolFamily; readonly cause?: unknown }
  | { readonly kind: "local-fatal"; readonly cause: unknown };
export type DataSendOutcome = { readonly kind: "sent" } | { readonly kind: "terminal"; readonly terminal: DataTerminal };
export type DataInboundDisposition = { readonly kind: "accepted" } | { readonly kind: "protocol-fatal"; readonly cause?: unknown };

export interface SubsystemDataHandlers {
  onViewportState(message: ViewportStateV1): DataInboundDisposition | Promise<DataInboundDisposition>;
}
export interface SubsystemDataPeerOptions { readonly binding: DataCurrentBindingV2; readonly handlers: SubsystemDataHandlers; }
export interface SubsystemRenderDataPeer {
  sendDomains(message: RenderDomainsV1): Promise<DataSendOutcome>;
  sendSnapshot(message: RenderSnapshotV1): Promise<DataSendOutcome>;
  sendPatch(message: RenderPatchV1): Promise<DataSendOutcome>;
  sendEvent(message: RenderEventV1): Promise<DataSendOutcome>;
}
export interface DataBindingViewV2 { readonly subsystemKey: string; readonly generation: number; readonly dataProfile: RendererDataProfileV2; }
export interface SubsystemDataPeer {
  readonly binding: Readonly<DataBindingViewV2>;
  readonly render: SubsystemRenderDataPeer;
  readonly terminal: Promise<DataTerminal>;
  close(): Promise<void>;
}

export interface RendererDataHandlers {
  onRenderDomains(message: RenderDomainsV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderSnapshot(message: RenderSnapshotV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderPatch(message: RenderPatchV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderEvent(message: RenderEventV1): DataInboundDisposition | Promise<DataInboundDisposition>;
}
export interface RendererDataPeerOptions { readonly binding: DataCurrentBindingV2; readonly handlers: RendererDataHandlers; }
export interface RendererViewportDataPeer {
  sendState(message: ViewportStateV1): Promise<DataSendOutcome>;
}
export interface RendererDataPeer {
  readonly binding: Readonly<DataBindingViewV2>;
  readonly viewport: RendererViewportDataPeer;
  readonly terminal: Promise<DataTerminal>;
  close(): Promise<void>;
}
