# `@loomrealm/data` 设计

> 层级：Package-local implementation/role seam  
> 状态：**旧三-child `/1` M8 historical Implemented/Qualified；修正后四-child `/1` Candidate / Not implemented / Docs Freeze HOLD**  
> 当前规范：[Profile v1](../../doc/15-contracts/renderer-data-profile-v1.md) · [Viewport v1](../../doc/15-contracts/viewport-state-v1.md) · [Connection v1](../../doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Input v1](../../doc/15-contracts/user-input-v1.md) · [Render v1](../../doc/15-contracts/render-update-v1.md)  
> ADR：[ADR0025 partial update](../../doc/decisions/0025-renderer-data-profile-v1-preimplementation-closure.md) · [ADR0037](../../doc/decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；[唯一资格 ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md) · [保全审查](../../doc/30-implementation/viewport-v1-final-freeze-closure-2026-09-16.md)  
> 最近复核：2026-09-16

本文是**包的 exact API 和实现职责投影**，不另定 wire、Connection authority 或 consumer gameplay。既有源码仍是三 child；以下 four-child public shape 是首次发行前的待实施候选，不能将历史 PASS 冒充新资格。无 `/2`、dual parser、deprecated alias。

## 1. Ownership / dependency

```text
Platform DataConnectionBroker
→ paired readiness + Main current authority revalidation + install
→ already-current MessageCarrier<string>
→ @loomrealm/data
    profile identity/binding validation; UTF-8/JSON/depth preflight
    child codecs/validators; one inbound reader/ordered dispatcher
    one serialized bounded writer; child disposition/first-wins terminal
→ Subsystem and Renderer role-specific peers
```

Data package不拥有 Main DataAuthority/InputTarget、Renderer participant currentness、Frame/Activation、WebSocket/MessagePort/Process、Input Interest/business gate、Render Domain/Store、Viewport physical source、map Canvas/policy、Content、Runtime/Frame terminal。Runtime dependencies恰为 `@loomrealm/foundation`与`@loomrealm/wire`；Node≥20、ESM/browser-compatible、`sideEffects=false`、root export only。不得依赖 Main/Subsystem/Renderer concrete role packages、runtime/renderer-control、Launcher/Platform、`node:*`、FS/Fetch。

## 2. Identity / binding / package surface

```ts
import type { MessageCarrier } from "@loomrealm/foundation";

export const RENDERER_DATA_PROFILE_V1: "loomrealm.renderer-data/1";
export type RendererDataProfileV1 = typeof RENDERER_DATA_PROFILE_V1;
export interface DataCurrentBindingV1 {
  readonly carrier: MessageCarrier;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: RendererDataProfileV1;
}
```

Binding/options/handlers construction validation发生在任何 `carrier.messages()` 或 `carrier.send()` effect 前：carrier符合契约、subsystemKey非空 string、generation positive safe integer、identity exact；invalid trusted integration config→`TypeError`且零 carrier side effect。Session/Renderer/target Runtime身份由 surrounding paired installation 保证，不重复塞进 binding。`dataProfile`不是 ticket、URL、Port或凭据。

唯一目标 `loomrealm.renderer-data/1 = Connection1+Input1+Render1+Viewport1`；旧三-child `/1`不能同新peer混配，产品必须按唯一 ledger 协调 cohort。只发布 `@loomrealm/data` root，不发布 `/input`、`/render`、`/viewport`、`/profile`、`/connection`、`/testing`、`/internal`、`/node`、`/browser`等 subpath。内部 src 拆分不构成 package ABI；历史包元数据 `0.1.0-alpha.0` 不证明已向外部实际分发。

## 3. Public exact wire family / preflight

沿用原 Input 和 Render **逐字段** frozen wire exports，包括：

```text
InputChannelV1, InputStateChannelV1, InputEventChannelV1,
FrameInputInterestV1, InputInterestV1, InputStateV1, InputEventV1,
InputResetV1, KeyboardCodeV1, KeyboardStatePayloadV1,
KeyboardEventPayloadV1, PointerKindV1, PointerButtonV1,
PointerSampleV1, PointerStatePayloadV1, PointerEventPayloadV1,
GamepadAxesV1, GamepadButtonsV1, GamepadSampleV1,
GamepadStatePayloadV1, GamepadButtonNameV1,
GamepadEventPayloadV1, UserInputMessageV1;
RenderDomainsV1, RenderSnapshotV1, RenderPatchV1, RenderEventV1,
RenderNodeV1, RenderPatchOpV1, RenderNodeInsertV1,
RenderNodeRemoveV1, RenderNodeMoveV1, RenderNodeUpdateV1,
StringMapDeltaV1, JsonObjectDeltaV1, RenderUpdateMessageV1.
```

新增唯一 child：

```ts
export interface ViewportStateV1 {
  readonly type: "viewport.state";
  readonly width: number;
  readonly height: number;
}
```

Composite `RendererDataMessageV1`联合类型增加 `ViewportStateV1`，不扩大旧 Input/Render acceptance；其余 identifier、count、payload、depth/JSON representation仍由 Frozen children/Wire 定义，TS无法编码的 grammar/range/UTF-8 byte limits由 runtime validator强制。Viewport必须 exact own `{type,width,height}`、positive finite safe integer CSS logical px，Renderer→Subsystem。不得使用 `unknown`/extension bag替代 exact closed schema。所有消息 one JSON text string、actual UTF-8 ≤1,048,576 bytes、depth≤64、现有 Wire parse/representation；先 common/child validation 才进行 semantic mutation，invalid local sender bytes不可发送。Profile不建立另一个 parser 或 map-specific size limit。

## 4. Exact shared outcome and terminal API（保全原 §6）

```ts
export type DataProtocolFamily = "profile" | "input" | "render" | "viewport";

export type DataTerminal =
  | { readonly kind: "carrier-closed" }
  | { readonly kind: "carrier-lost"; readonly cause?: unknown }
  | { readonly kind: "protocol-fatal"; readonly protocol: DataProtocolFamily; readonly cause?: unknown }
  | { readonly kind: "local-fatal"; readonly cause: unknown };

export type DataSendOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "terminal"; readonly terminal: DataTerminal };

export type DataInboundDisposition =
  | { readonly kind: "accepted" }
  | { readonly kind: "protocol-fatal"; readonly cause?: unknown };
```

与原三-child类型相比**仅 `DataProtocolFamily` 加入 `viewport`**；`kind` discriminants、`sent/terminal`、`cause` optionality与 `accepted`含 child-approved well-formed stale drop不变。`Error.message`、stack、concrete cause类型/文案不作 protocol decisions。Common/unknown→`protocol:"profile"`；recognized child exact-invalid→对应 `"input"/"render"/"viewport"`；handler unexpected throw/reject→`local-fatal`而非伪造远端 malformed。Subscriber error须在 Viewport role boundary contain，不穿过 Data reader。

## 5. Exact Subsystem peer API（保全原 §7，仅加 handler）

```ts
export interface SubsystemDataHandlers {
  onInputState(message: InputStateV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onInputEvent(message: InputEventV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onInputReset(message: InputResetV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onViewportState(message: ViewportStateV1): DataInboundDisposition | Promise<DataInboundDisposition>;
}
export interface SubsystemDataPeerOptions {
  readonly binding: DataCurrentBindingV1;
  readonly handlers: SubsystemDataHandlers;
}
export interface SubsystemInputDataPeer {
  sendInterest(message: InputInterestV1): Promise<DataSendOutcome>;
}
export interface SubsystemRenderDataPeer {
  sendDomains(message: RenderDomainsV1): Promise<DataSendOutcome>;
  sendSnapshot(message: RenderSnapshotV1): Promise<DataSendOutcome>;
  sendPatch(message: RenderPatchV1): Promise<DataSendOutcome>;
  sendEvent(message: RenderEventV1): Promise<DataSendOutcome>;
}
export interface SubsystemDataPeer {
  readonly binding: Readonly<{
    subsystemKey: string;
    generation: number;
    dataProfile: RendererDataProfileV1;
  }>;
  readonly input: SubsystemInputDataPeer;
  readonly render: SubsystemRenderDataPeer;
  readonly terminal: Promise<DataTerminal>;
  close(): Promise<void>;
}
export function createSubsystemDataPeer(options: SubsystemDataPeerOptions): SubsystemDataPeer;
```

Subsystem inbound仅 Renderer ordinary Input + Viewport，outbound只 Input Interest/Render。`scope.viewport`由 `@loomrealm/subsystem` 映射为 author API；业务不 import `@loomrealm/data`，绝不以新增 handler 作为 Frame mutation permit。

## 6. Exact Renderer peer API（保全原 §8，仅加 sender）

```ts
export interface RendererDataHandlers {
  onInputInterest(message: InputInterestV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderDomains(message: RenderDomainsV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderSnapshot(message: RenderSnapshotV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderPatch(message: RenderPatchV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderEvent(message: RenderEventV1): DataInboundDisposition | Promise<DataInboundDisposition>;
}
export interface RendererDataPeerOptions {
  readonly binding: DataCurrentBindingV1;
  readonly handlers: RendererDataHandlers;
}
export interface RendererInputDataPeer {
  sendState(message: InputStateV1): Promise<DataSendOutcome>;
  sendEvent(message: InputEventV1): Promise<DataSendOutcome>;
  sendReset(message: InputResetV1): Promise<DataSendOutcome>;
}
export interface RendererViewportDataPeer {
  sendState(message: ViewportStateV1): Promise<DataSendOutcome>;
}
export interface RendererDataPeer {
  readonly binding: Readonly<{
    subsystemKey: string;
    generation: number;
    dataProfile: RendererDataProfileV1;
  }>;
  readonly input: RendererInputDataPeer;
  readonly viewport: RendererViewportDataPeer;
  readonly terminal: Promise<DataTerminal>;
  close(): Promise<void>;
}
export function createRendererDataPeer(options: RendererDataPeerOptions): RendererDataPeer;
```

Renderer不发 Render，Subsystem不发 ordinary Input/Viewport；不加 generic send、connect(url)、ACK/request、Environment/Map service或新 root subpath。Viewport producer/coalescing 由 Renderer role 实现，`viewport.sendState()`只是有界发行后进入共享 writer 的 typed send seam；不得让每次原始 DOM event直接无限并发调用它。

## 7. Reader / writer / terminal mechanics（保全原 §9–12、§14）

每 current peer `carrier.messages()` exactly once，common preflight→type/direction→exact child static validation→ordered handler，N disposition settles before N+1 protocol effect；Input/Render/Viewport不争抢stream。Role handler先完成 protocol/state transition，再与慢 business/presentation callback解耦；业务 exception不应逃逸成 peer protocol-invalid。Profile不是JSON-RPC或跨 child transaction。

Public send先 trusted local validation→compact Wire stringify→actual-byte guard→enqueue **one shared FIFO writer**，max concurrent `carrier.send=1`；accepted invocation FIFO、pending settlement exactly once；`{kind:"sent"}`仅说明 local carrier send boundary，非 remote ACK。Local invalid send→`local-fatal`且不发 malformed bytes。Writer不可 coalesce Input State、Render commits、Viewport 或重排 child barrier，不能 retry、duplicate、replay或跨 fresh carrier搬迁旧 queue；child producer必须在 admission 前自己 coalesce/drop。Viewport每 current carrier≤1 writer-admitted/in-flight +≤1 pending latest；普通 resize burst不得导致通用 writer overflow/Data fatal或长期饿死 Input/Render。不得修改通用 queue capacity、添加全局 priority scheduler。

Terminal first-wins：carrier.closed/lost、common/static/child protocol fatal、outbound local invalid、send reject、internal failure→stop new operations/inbound effect，queued operations恰好一次 settle，local fatal best-effort close。`close()`幂等、不是 application `data.close`；Data terminal仅报告 role integration，不 fail Runtime/Frame/Main。Before peer exists invalid binding/options/handler→TypeError零carrier effects；well-formed stale由child handler合法 drop/accepted。

Data peer绑定一个 current carrier、never rebind。Old terminal forever；fresh peer不继承reader cursor、writer queue、old unsent bytes或terminal。Role-owned Desired Interest/current Frame facts、business RenderDomain、Runtime Viewport last可按其各自 lifetime留存，再 materialize fresh Input full Interest/effective State、Render domains/snapshot、Viewport fresh legal baseline。Same G reconnect不重建 Runtime/Frame/Domain，不触发 WC equal-data retry；fresh G/Renderer old callbacks/carrier/source fenced。

## 8. M8/M10/M11 ownership and qualification preservation

原 M8 已完成的 package core、Input/Render codec、single reader/writer、typed peers、MemoryCarrier、root export/pack测试与 real role integration 属历史subject；不能因简化文档删去这些稳定义务。M10 InputManager/InputListener+Renderer Producer，M11 RenderManager/RenderDomain+Renderer Store继续独占各自 stateful logic；不得在 Role 再建第二 reader/writer/parser。新增 Viewport 是小型 role sender+retained capability，不把 Data 包变成 Map/Environment manager。

新资格在**新可执行 subject SHA**上至少运行：binding invalid零副作用、type exact/range/role roundtrip、1MiB/depth64、one reader/ordered disposition/each dispatcher、writer FIFO+one physical send+terminal settlement/no replay、all Input/Render original tests、Viewport recognized-invalid family/blocked-writer burst、fresh carrier/source/generation fencing、two-role MemoryCarrier trace、Desktop/Hostra product and affected M13/M14/M15；完整 Profile conformance fixtureSetRevision3，旧 revision1/2/历史M11–M15 PASS不能冒充。PWA按所属里程碑；Map PR0另取性能证据。当前单一状态见 [v1 ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md)。