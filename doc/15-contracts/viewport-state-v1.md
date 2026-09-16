# Renderer → Subsystem Viewport State v1

> 层级：正式契约 / Child Protocol  
> 状态：**Draft / Normative Candidate / Not Frozen**  
> 协议版本：1；标识：`loomrealm.viewport-state/1`  
> 主要定义：单一 designated logical presentation surface 的 readonly geometry observation、bounded publication、retention/currentness、failure及 author capability  
> 依赖：[Data Connection v1](./renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](./renderer-data-profile-v1.md) · [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> Conformance：[Viewport v1 Conformance](./viewport-state-conformance-v1.md)；最近复核：2026-09-16

本文件仅规范跨角色必须一致的 geometry/value/currentness；不选择 Browser DOM API、不定义游戏视口 cap、camera、Frame gameplay规则或产品 rollout。`MUST / MUST NOT / SHOULD / MAY` 在 Docs Freeze 前为候选约束。

## 1. 单一 logical presentation surface

Current Renderer physical composition MUST 明确指定 **恰好一个**其负责的 logical presentation surface，且该 surface identity在同一 Renderer participant生存期不被暗中重新指向另一个不同区域。`width/height` 是指定 surface 的 **CSS logical pixels**，经确定性 floor转换为 positive finite safe integers；同一 Renderer participant 下所有 current `/1` Subsystem carrier观察同一 raw geometry。没有合法 sample不造 0/null/default wire，曾观察的 last合法值可留作 historical observation。

这是跨角色的**尺寸坐标系/单 surface**契约，不要求实现读取 DOM `Window.innerWidth`、`visualViewport`或 host element API；source选择与指定 surface的真实物理边界必须由当前 Platform/Product composition SSOT与测试固定。当前 Desktop/PWA Web 产品指定 document layout viewport、以 `innerWidth/innerHeight`实现；这是产品物理选择而不是子协议的硬编码 API。对于独立 content box/sidebar/多 pane，必须先评审其 source与实际分配的内容区域是否一致，不得借同一个 participant静默改变指定的 surface identity或把不同区域尺寸混用。v1不支持多个并行 surface，不引入 `surfaceId/windowId/frameId`或 router。

Viewport只表达 Renderer 已观察到的 geometry，不表达焦点、用户动作、Renderer可绘制性、Main authority或 DOM desired state。

## 2. Exact message / validation

唯一 Renderer→Subsystem：

```ts
interface ViewportStateV1 {
  readonly type: "viewport.state";
  readonly width: number;
  readonly height: number;
}
```

Exact own top-level `{type,width,height}`；两个值均 positive finite safe integers，单位 CSS logical pixel。不得带 DPR、focus、visibility、timestamp、revision、sequence、Renderer/Session/Frame/Activation、map/camera或任意 metadata。无 `viewport.event/reset/interest/request/ack/revision`。

[修正后的 Profile v1](./renderer-data-profile-v1.md) 的 one UTF-8 JSON text / 1MiB / depth64 / Wire representation preflight / direction validation先于 child semantic mutation。已识别的 `viewport.state` shape/value invalid是 child protocol-fatal，public diagnostic `protocol:"viewport"`，retire本 Data carrier；不自动 fail Runtime/Frame或 destroy RenderDomain。合法等值消息可省略 author callback。既有 User Input/Render child不变。

## 3. Per-carrier bounded latest-state publication

一份状态为自包含的 latest geometry，不承诺传递全部中间 resize。每 current carrier的 publisher MUST 同时满足：

```text
at most 1 viewport unit writer-admitted / send awaiting outcome
AND at most 1 not-yet-admitted pending latest-size slot
```

新的合法 observation替换 pending，而不是每次进入 shared writer；已 admitted unit不可撤回/重排。先前 unit结算后，若 pending不同于已提交 size，则向 writer交付最新值，直到收敛。Writer阻塞时 pending仍有界；普通尺寸 burst不能单独造成 shared writer overflow、无界 promise/work累积或永久饿死 Input/Render。无 generic priority scheduler、不修改现有 writer的 bounded/fail-closed机制。`carrier.send()` fulfilled不是 Subsystem ACK。

Old carrier terminal立即使其 sender cursor/late work inert，不把 pending或admitted单位迁移至 fresh carrier。Trusted physical source可保留最新合法 sample，fresh carrier根据 admission时最新值建立该 carrier自己的 baseline；baseline过程中新的尺寸仍按 bounded latest收敛。没有历史事件、revision或 replay。

## 4. Retained observation / transition matrix

Subsystem host的一个 Runtime拥有单一 detached/immutable last-successfully-accepted `current`。初值 `null`，不能因普通 carrier loss、zero source或非 InputTarget而合成 null：

| Situation | Wire | Author projection |
|---|---|---|
| Startup without any legal sample | no synthetic message | current=null；新 subscriber同步收到null |
| First accepted A | legal state(A) | set A before change callback |
| Same A | suppress or accept equal | current=A；no duplicate callback |
| Burst A→B→C | not-admitted latest wins | eventually C；B delivery not guaranteed |
| Current carrier lost/retired | discard its cursor | retain last value, no null callback |
| Same G fresh carrier, still A | fresh A baseline required when legal | equal no callback |
| Same G fresh carrier, B | fresh B | update B before one notification |
| Fresh G, same Runtime survives | fresh matching carrier/size, old G fenced | retain last until new legal baseline; equality suppress |
| Fresh Renderer, same Runtime survives | old source/carrier/rAF fenced | retain historical size until current legal baseline converges |
| Fresh participant no legal sample | no default/zero | retain last, or null if never observed |
| Runtime terminal | no active reader/subscription delivery | all late callback inert |

`current !== null` **不是** current Renderer/carrier/DOM/paintability proof。Control、Viewport、Render独立收敛；不承诺跨 plane super-snapshot、barrier、fixed ordering或 atomic baseline。只有 exact current authority的 carrier traffic可更新 value；retired source/old generation/queued callback一律 inert。

## 5. Geometry delivery与 Input/Frame 正交

Viewport publish/receive MUST NOT被 InputTarget、Activation、Frame active/suspended、Interest、keyboard/pointer/gamepad availability、focus/blur门控。接收几何 observation本身**不 mint 或改变** Main InputTarget/Activation/Frame mutation authority，也不直接修改 Render Store/Projector/desired Render state；业务如需改变呈现，仍自主使用现有 Render author API。此处不定义任何地图移动、碰撞、转场或菜单行为。

物理 source在 current participant存续期间提供 initial legal sample、resize latest与必要的 source-recovery resample；invalid/zero/fractional/unsafe raw geometry不生成新值、不清空last合法值；DPR-only变化不构成尺寸变化。stop/replacement时清 listener/queued tasks并用 current source/authority identity fence；Data-only reconnect可重用同一 source sample，但 sender cursor必须fresh。指定 source的方法和 visible recovery机制归 Platform/Product物理实现。

## 6. Author projection

```ts
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}
export interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (viewport: ViewportSize | null) => void): () => void;
}
export interface SubsystemScope {
  readonly viewport: Viewport;
}
```

`Viewport` object lifetime为 Runtime/Scope，`current`及 delivered snapshot detached/immutable；不能由业务 mutate影响 future。`subscribe` MUST 同步恰好交付调用时 latest committed current（含null），随后仅 structural width/height变化时通知；getter更新先于 callback。初次同步 throw和其他 listener throw局部隔离，仍返回 unsubscribe；returned thenable rejection须被局部 catch/report，不阻塞 Data reader、不造成 unhandled rejection/terminal。Unsubscribe幂等，调用后无再交付；Runtime terminal/abort后所有 late callback inert。不加 `get()+onChange`第二套 API，也不公开物理 Window/identity/transport。

## 7. Scope/qualification

本 child属于**直接修正后的唯一 Profile `/1`**，没有 `/2` compatibility、silent downgrade或迁回 `/1`的问题。Docs Freeze需要 [conformance](./viewport-state-conformance-v1.md) executable-ready文本、[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)兼容性核查、跨文档review与docs SHA；不要求实现前有 raw PASS。实现后由 [qualification ledger](../30-implementation/viewport-profile-v1-qualification.md)在新 executable SHA证明。地图 cap/settle/camera/chunk/Browser performance和真实菜单验收完全独立治理。

Final: one designated CSS logical surface、exact three fields、Input-independent retained state、per-carrier bounded latest/fresh baseline、Runtime readonly callbacks、currentness fencing、Data-only fatal、Main不持尺寸。