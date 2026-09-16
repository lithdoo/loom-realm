# LoomRealm 系统架构总览

> 层级：系统架构 · 状态：Active Design  
> 稳定程度：M10–M13 Frozen baseline；M11/M14/M15 current executable requalification由 ledger决定；Viewport/Profile v2 候选、尚未 Docs Frozen  
> 定义：logical roles、bootstrap/authority/currentness、Data/Input/Viewport/Render与 Web presentation/physical composition boundary  
> 依赖：[Product vision](../00-overview/product-vision.md) · [Document governance](../00-overview/document-governance.md)  
> 细化：[Platform composition](./platform-composition-system.md) · [Protocol layers](./renderer-subsystem-protocol-layers.md) · [Viewport architecture](./viewport-capability.md) · [Rendering](./rendering-system.md)  
> 相关：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md) · [Web Presentation API v1](../15-contracts/web-presentation-api-v1.md) · [ADR0031](../decisions/0031-business-owned-web-component-projection.md) · [ADR0032](../decisions/0032-game-library-example-boundary.md) · [ADR0034](../decisions/0034-hostra-owned-desktop-composition.md) · [ADR0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)  
> 最近复核：2026-09-16

本文只拥有 system-level role/owner map；exact message/author semantics以 formal contracts为准。M15物理实现见根目录 recomposition SSOT；Viewport/Profile v2 maturity仅以 [dedicated ledger](../30-implementation/viewport-profile-v2-qualification.md) 为准，不把 docs-only修改写作实现完成。

## 1. Logical roles and authority

| Role | Owns |
|---|---|
| Game Package | logical Game Entry/Subsystem topology |
| Platform Launcher / launch profile | executable binding、PREPARE、PlatformLaunchPlan/LogicalGameBootstrap |
| Main | Session/Runtime/Frame/Stack/Activation、InputTarget、DataAuthority、Renderer currentness、failure unwind |
| Subsystem Runtime | business state、Input Interest、authoritative Render Domains、readonly ContentClient；candidate readonly retained Viewport observation |
| Renderer | Main authority readonly mirror、Input producer gate、per-subsystem Data/Render replicas、Web projection；candidate current document viewport physical observation |
| Platform | Process/Worker/window/transport/provisioning与 trusted physical source realization |
| Business Web Components | concrete Shadow DOM/Canvas/WebGL/layout/private physical presentation、retry |
| `game-libs/*` / `examples/*` | reusable domain semantics / concrete game composition |

一个 application authority只有一个 owner。Platform持有 physical Window/transport不产生 Main/Render/Frame或 map state的第二 authority。

## 2. Bootstrap boundaries

```text
installation/source
→ matching Platform Launcher PREPARE
→ Game Entry + Platform manifest join
→ executable/capability preflight
→ PlatformLaunchPlan / LogicalGameBootstrap
→ RuntimeHosting
```

独立 Web bootstrap：product/platform-private Web Config→prepared Content→Renderer document/window bootstrap→presentation start。Game topology、executable binding、Window/document creation与 Web presentation不能混为一体；Config acquisition/browser binding属于 physical composition，不能进入 Main/Frame/RenderNode/Launcher logical ABI。

## 3. Main and current Data

Main通过 Renderer Control full committed authority snapshot唯一发布 Session、current Renderer、Runtime/Frame/Activation/InputTarget与 `{subsystemKey,generation,dataProfile:string}`。Main能选择 profile identity，但**不得保存或转发** ordinary input、viewport width/height或 Render payload。Broker仅建立匹配 current `(Session,Renderer,S,G,P)`的 paired physical carrier；Connection v1限制同一 current slot 0..1。Data loss不等于 Runtime/Frame failure；same G/P reconnect只换 carrier，不更换 Renderer identity；document reload则 fresh Renderer participant。Profile change必须 fresh G。

```text
loomrealm.renderer-data/1 [Frozen] = Connection1 + Input1 + Render1
loomrealm.renderer-data/2 [Candidate target] = Connection1 + Input1 + Render1 + Viewport1
```

ADR0036目标 subject的 Main policy对所有 current Subsystem authorities统一选 `/2`；Profile v1仍为 Frozen compatibility，现行代码尚未实现 `/2`。Control v1 wire `dataProfile:string` 已允许 profile successor，不需要 Control wire v2；旧“Phase 1=/1”是当时 executable baseline，不扩大旧 profile的 acceptance集合。没有 negotiation、per-Subsystem fallback、silent `/1` downgrade。

## 4. Input / Viewport / Render independent semantics

```text
Input = current Data × Main InputTarget × active Activation × Subsystem Interest × physical Producer
```

Viewport不通过 User Input或 Input gate：current Renderer participant观察其**一个 current document layout viewport**，Desktop/PWA以 `Window.innerWidth/innerHeight` 的 CSS logical pixels/floor为同义尺寸；Profile v2 viewport child向各 current Subsystem复制 raw size，Subsystem Runtime-scoped `scope.viewport`保留 last successfully accepted value。frame suspend/non-top/InputTarget change仍可观察。每 carrier bounded latest sender（最多一个 admitted/in-flight + 一个 pending latest），fresh carrier独立 baseline，old source/carrier fenced；`current`非null不证明 Renderer/paintability当前存在。DPR、focus/visibility、DOM rect或多 surface routing不属于 v1。Map业务据已提交 world facts决定 camera/chunks并通过 RenderDomain提交；Core viewport不直接写 Store或授予 suspended gameplay mutation。

Render始终：Subsystem authoritative Render Domains→Frozen Render Update v1→per-subsystem Renderer Store。Live wire identity `(Session,subsystemKey,generation,domainId,key)`；Frame/Activation/InputTarget不隐式 destroy Domain，Data retire不销毁 business truth。Viewport、Input、Render共享 `/2` carrier单 reader/writer/terminal但无跨 child transaction/revision/ACK，Control/Data无 global total order。

## 5. Web presentation / currentness

```text
Window/document bootstrap
→ presentation start
→ current Control facts + eligible current Render Store facts
→ package-private thin Projector
→ business Custom Elements
```

只有 Control committed authority变化及 current Render Store成功 commit才触发 LoomRealm-managed presentation reevaluation；Viewport physical observation不是第三个 Projector desired-state source，除非业务先通过既有 Render API提交变化。Renderer Store/currentness不可从 DOM反向生成。same full live identity保留 HTMLElement；fresh Session/G结束旧 universe；same-generation carrier loss保留/冻结 DOM并按 Render baseline重新收敛，不等于 Web Component receiver retry。Business WC对 managed attrs/data/light DOM只读，自己拥有 Shadow DOM/Canvas/资源重试；presentation failure Window-local，不 rollback Store/Runtime。

## 6. Failure and lifetime

Malformed Viewport child是 Data/profile failure→retire carrier，不自动 Frame unwind/Runtime fail/RenderDomain destroy；v2 diagnostic `protocol:"viewport"`。Subscriber failure local-contained，不控制 reader/backpressure。Data-only reconnect保留 runtime viewport capability和 last observation；fresh current baseline same value无callback、changed value收敛。fresh Renderer且同 Runtime幸存时，旧物理 source/binding不得覆盖新的 matching carrier；无 Control/Viewport/Render跨 plane atomic super-snapshot。Physical terminal由 Hostra/PWA concrete composition汇入已有 owner chain，不建第二 kill authority。

## 7. Repository/dependency and non-goals

```text
packages/* → framework/runtime
game-libs/* → reusable game library
examples/* → concrete game
apps/* → physical product composition
tools/* → importer/development only

dependency: examples → game-libs → public @loomrealm/subsystem author APIs
```

禁止 Framework→map/example反向依赖、business Runtime→DOM/transport/FSDB/raw credentials、business WC→Store/Data authority、DOM→Store reverse sync、public second PresentationState/Store、component registry/dynamic loader/AssetManager、generic Environment manager、layout/layer authority、Main viewport mirror、跨 child ACK、profile negotiation与改 Frozen `/1` semantics。

## 8. M14/M15 placement

M14 `examples/essentials-v21.1`→`game-libs/map`，只消费 public Subsystem与已 prepared Map/Tileset Content；M14可用 test-owned harness+Chromium，完整 Hostra Desktop归 M15。Map dynamic viewport的真实 consumer gap由 ADR0036狭义 reopen；camera/tiles/chunk/autotile仍在 game library。其性能设计/PR0与 executable qualification不能被 Core Docs Freeze替代。

Canonical Hostra chain：

```text
Hostra shell (sole Electron/BrowserWindow owner)
→ HOSTRA_SUBCMD LoomRealm Desktop plain Node
→ LoomRealm RuntimeHosting → Runner → Subsystem
```

`@loomrealm/game-launcher-hostra` 是 PREPARE+Runner launch profile，不是 external Hostra shell。M15 reload=fresh Renderer；Data-only reconnect=same Renderer/new carrier；physical lifecycle/rendezvous由 ADR0034+M15 recomposition SSOT拥有。PWA在 M16/M17 materialize不同 physical mechanics但相同 public author semantics。

## 9. Phase / evidence

M10 Input→M11 Render→M12 Content→M13 Web Presentation→M14 Map→M15 Hostra→M16 PWA Runtime→M17 equivalence。Viewport/Profile v2是跨既有阶段的 capability correction，不创建新 Main authority或把旧 M11/M14/M15 historical PASS转给新 SHA。Core Docs Freeze只要求 formal specification/可执行测试规范与 cross-review一致；实现后的 conformance/hosted/product证据记录到 [viewport ledger](../30-implementation/viewport-profile-v2-qualification.md)。Map PR0另需 exact dense 1080p bytes、Core full-state validation、Browser receive/raster及 single-clock latency PASS后才 Map Docs Freeze。