# `@loomrealm/data` 设计

> 层级：Package-local implementation/role seam  
> 状态：**historical three-child `/1` M8 baseline Implemented/Qualified；corrected four-child `/1` candidate / Not implemented / Docs Freeze HOLD**  
> 当前规范：[Renderer Data Profile v1 corrected](../../doc/15-contracts/renderer-data-profile-v1.md) · [Viewport State v1](../../doc/15-contracts/viewport-state-v1.md) · [Connection v1](../../doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Input v1](../../doc/15-contracts/user-input-v1.md) · [Render v1](../../doc/15-contracts/render-update-v1.md)  
> ADR：[ADR0025 partial update](../../doc/decisions/0025-renderer-data-profile-v1-preimplementation-closure.md) · [ADR0037 direct correction](../../doc/decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；[唯一资格 ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md)  
> 最近复核：2026-09-16

`@loomrealm/data`拥有 Renderer Data Profile应用层机械结构，不拥有physical connection、Main authority、Subsystem/Renderer业务状态。**现有src中的三-child wire union、`DataProtocolFamily=profile|input|render`、`validateBinding`只能接受旧 `/1`，是尚待升级的历史可执行事实，不是修正后规范。** 不发布Profile `/2`、不建dual parser或deprecated alias；直接在首次发布前协调升级唯一 `/1`，先完成ADR0037外部兼容核查/Docs Freeze，之后新executable SHA重新qualification。

## 1. Ownership / dependency

```text
Platform DataConnectionBroker
→ paired readiness + Main current authority revalidation + install
→ already-current MessageCarrier<string>
→ @loomrealm/data
    profile identity & binding validation
    common UTF-8/JSON/depth preflight
    static child codecs/validators, type/direction demux
    exactly one ordered inbound reader
    exactly one serialized bounded outbound writer
    child disposition and first-wins Data terminal
→ Subsystem and Renderer role-specific peers
```

Data package不拥有Main DataAuthority/InputTarget、Renderer participant currentness、Frame/Activation、physical WebSocket/MessagePort/Process、Input Interest/business gate、Render Domain/Store desired state、Viewport physical source、map policy/Canvas、Content、Runtime/Frame terminal。Dependencies仍只有 `@loomrealm/foundation`和`@loomrealm/wire`，Node≥20、ESM/browser-compatible、sideEffects=false、root export only；不得依赖Main/Subsystem/Renderer concrete packages、runtime-control、renderer-control、launcher、Platform host、`node:*`、filesystem或Fetch。

## 2. First release profile & package surface

唯一profile identity常量仍为：

```ts
export const RENDERER_DATA_PROFILE_V1: "loomrealm.renderer-data/1";
export type RendererDataProfileV1 = typeof RENDERER_DATA_PROFILE_V1;
interface DataCurrentBindingV1 {
  readonly carrier: MessageCarrier;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: RendererDataProfileV1;
}
```

Basic trusted binding validation在任何carrier read/send副作用前完成：carrier符合MessageCarrier、subsystemKey非空string、generation positive safe integer、profile identity exact；invalid options/handlers→TypeError且零carrier effect。真实Session/Renderer/Runtime tuple由surrounding paired installation保证，不塞入binding envelope。

```text
loomrealm.renderer-data/1 = Connection1 + Input1 + Render1 + Viewport1
```

修正后的 Profile无`/2`兼容路径；旧三-child peer不能与新peer混配。只有Main可选profile identity，当前产品统一rollout策略/physical source由implementation ledger拥有，不在此处要求任意consumer全体选择同一profile。未来形成真实compat obligation后 incompatible changes另行version/migrate。

仅root package `@loomrealm/data`：不发布`/input`、`/render`、`/viewport`、`/profile`、`/connection`、`/testing`、`/internal`、`/node`、`/browser`或为协议对称拆新npm包。原src可以内部分拆`validation-common/input-codec/render-codec/profile-codec/runtime/peers/model/index`，新增viewport相关内部文件由implementation按最小职责决定，不构成npm API。Package metadata 0.1.0-alpha.0是历史实现信息，不等于Profile version/发布证明。

## 3. Exact wire model / validation

Input export type family按Frozen Input v1不变（Interest、State、Event、Reset及Keyboard/Pointer/Gamepad）；Render export family按Frozen Render Update v1不变（Domains、Snapshot、Patch、Event、Node/Delta）。新增**唯一**Viewport child type：

```ts
interface ViewportStateV1 { readonly type:"viewport.state";readonly width:number;readonly height:number }
```

Runtime必须强制exact own 3 fields、positive finite safe integers、role direction Renderer→Subsystem。Composite `RendererDataMessageV1`联合新增ViewportStateV1；不得扩大旧 Input或Render payload、额外extension bags、SDK `unknown`替代精确grammar。Common unit one UTF-8 JSON text string，actual≤1,048,576B/depth≤64/Wire parse & representation；先校验再semantic mutation，不另造 parser/limits。Identifier/count/payload/tree限制仍归各自Frozen child；Viewport无map/camera/DOM/DPR metadata。

方向：Subsystem→Renderer `input.interest;render.domains/snapshot/patch/event`；Renderer→Subsystem `input.state/event/reset;viewport.state`。Reader唯一、顺序处理dispatch/disposition，不为throughput并发apply；unknown/wrong direction→profile protocol-fatal，recognized child invalid分别 `input/render/viewport` family。三child handler不得各自读raw carrier；Viewport接受只更新host retained observation，不直接改Store/Projector/Input authority。

## 4. Public peer roles (minimal revision)

保留`createSubsystemDataPeer(options)`与`createRendererDataPeer(options)`、`DataCurrentBindingV1`、binding view、`DataSendOutcome`、`DataInboundDisposition`和`terminal/close`；保留Subsystem outbound Input Interest+Render sends、Renderer inbound Interest+Render和Renderer outbound ordinary Input。仅增加：

```ts
interface SubsystemDataHandlers {
  // existing onInputState/onInputEvent/onInputReset unchanged
  onViewportState(message: ViewportStateV1): DataInboundDisposition | Promise<DataInboundDisposition>;
}
interface RendererViewportDataPeer {
  sendState(message: ViewportStateV1): Promise<DataSendOutcome>;
}
interface RendererDataPeer {
  // existing input, binding, terminal, close unchanged
  readonly viewport: RendererViewportDataPeer;
}
```

上述为实现候选的 **role-specific minimal seam**；最终公开类型/implementation要与正式Profile v1和conformance一致；不新增generic `send(message)`、request/ACK、Data connect(url)、Environment/Map service。`@loomrealm/subsystem`独立提供author `scope.viewport`；Business Definition不得import本包。

## 5. Reader/writer/terminal mechanics

One reader：`carrier.messages()`恰好一次；common preflight→type/direction→child exact validation→ordered role handler；message N disposition settles before N+1 protocol effect。Handler显式accepted（含child合法stale drop）或protocol-fatal；handler unexpected throw/reject→local fatal，business callback自身错误须在role owner隔离，不伪造成remote malformed。

Single writer：所有local send先exact validation/stringify/byte guard再shared FIFO，max pending physical `carrier.send`=1；bounded queue、terminal settlements once、no retry/duplicate/replay/migration、send fulfilled不是remote ACK；Data writer自身不coalesce Input/Render/Viewport、child producer在入队前按各自规则合并/丢弃并保barrier。新增Viewport per current carrier producer≤1 admitted/in-flight+1 latest pending，合法resize burst本身不能填满generic writer导致fatal或无界积累，不改现有MAX_PENDING_SENDS或加global priority scheduler。old carrier/source callback fenced/fresh carrier independently baselines。

Terminal source carrier close/loss、common/child invalid、explicit child fatal、invalid local send、writer rejection/bugs，first-wins；停后续读写、pending once、local fatal best-effort close；`close()` idempotent且不是application `data.close`。Terminal families从现有`profile|input|render` **修正 `/1`实现**增`viewport`；public Error.message/stack/cause concrete text不作协议决策依据。Data terminal只报告role integration，不直接fail Runtime/Frame/Main authority。

## 6. Fresh carrier/milestones

DataPeer绑定一个current carrier不可rebind；old terminal→Platform可fresh install→newpeer，不继承reader/writer/parsed message/unsent bytes/terminal；role可保留Desired Interest、business Render Domain、Runtime viewport last value，分别重建Input Interest/State、Render domains+snapshot、Viewport fresh latest合法sample baseline。same G Data reconnect≠Runtime restart、WC retry，fresh G/Renderer old traffic须fence。

旧M8 stages（package skeleton、Input/Render static codecs、single reader/writer、terminal、typed peers、fixtures、role integration）曾在历史subject qualified；后续M10/M11复用shared mechanics、不得各建reader/parser。此次four-child修正须单独在**新executable SHA**完成Viewport codec/dispatcher/sender、Subystem retained author integration、Renderer physical source、Main product current `/1` endpoints与revised conformance fixtureSetRevision3；旧fixture revision1/2、M11/M14/M15历史PASS不可冒充新subject。当前资格和Freeze状态见[v1 ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md)；Map PR0独立。