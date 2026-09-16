# LoomRealm 系统架构总览

> 层级：系统架构 · Active Design  
> 稳定程度：M10–M13 frozen executable baseline；M11/M14/M15 requalification ledger-owned；Viewport v1 / revised Data Profile `/1` preimplementation candidates / Docs Freeze HOLD  
> 定义：logical roles、bootstrap/authority/currentness、Input/Viewport/Render、Web presentation与 physical/product boundary  
> 依赖：[Product vision](../00-overview/product-vision.md) · [Document governance](../00-overview/document-governance.md)  
> 细化：[Platform composition](./platform-composition-system.md) · [Protocol layers](./renderer-subsystem-protocol-layers.md) · [Viewport](./viewport-capability.md) · [Rendering](./rendering-system.md)  
> 决策：[ADR0031](../decisions/0031-business-owned-web-component-projection.md) · [ADR0032](../decisions/0032-game-library-example-boundary.md) · [ADR0034](../decisions/0034-hostra-owned-desktop-composition.md) · [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> 最近复核：2026-09-16

本文只拥有系统级 owner/authority/topology；exact messages/author behavior由 contract，物理 source由 Platform/Product composition，业务政策由 game library拥有。Docs-only更改不代表新的可执行实现或PASS。

## 1. Logical roles and sole authorities

| Role | Owns |
|---|---|
| Game Package | logical Game Entry / Subsystem topology |
| Launcher / profile | executable binding、PREPARE、PlatformLaunchPlan/LogicalGameBootstrap |
| Main | Session、Runtime、Frame/Stack/Activation/InputTarget、DataAuthority、Renderer currentness、failure unwind |
| Subsystem | business world state、Input Interest、authoritative Render Domains、readonly Content；candidate readonly Runtime viewport observation |
| Renderer | readonly Main mirror、Input Producer、Render Store replica、Web Projector；candidate physical designated surface observation |
| Platform | Process/Worker/Window/transport/provisioning/trusted physical source realization |
| Business Web Components | concrete Shadow DOM/Canvas/WebGL/layout and local retry |
| `game-libs/*` / `examples/*` | reusable game-domain semantics / concrete game product policy |

Physical Platform Window ownership不造第二份 Main、Render或map authority；framework不能反向依赖 map。

## 2. Bootstrap / composition

```text
installation/source
→ matching Launcher PREPARE
→ Game Entry + Platform manifest exact join
→ executable/capability preflight
→ PlatformLaunchPlan / LogicalGameBootstrap
→ RuntimeHosting
```

Web bootstrap另行进行：product/private Web Config→prepared Content→Renderer Window/document→ordered business scripts/styles→presentation start。Game topology、executable bindings、Web Config acquisition不能混入 Main Frame/Render ABI。

## 3. Control/Data/currentness

Main以 Renderer Control v1 full committed snapshot发布 Session/current Renderer/Runtime/Frame/Activation/InputTarget与 `{subsystemKey,generation,dataProfile:string}`，不保存/转发 ordinary Input/Viewport width/Render payload。Broker只对 current `(Session,Renderer,S,G,P)` pair physical carrier，每 current slot 0..1。Data loss不等于 Runtime/Frame failure；same G/P reconnect只换 carrier；reload=fresh Renderer。未来**不同 profile identity**需 fresh G，Control wire无需升级。

本次首次发布前经 [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) 显式修正唯一 Data Profile：

```text
loomrealm.renderer-data/1 [revised candidate]
= Connection v1 + User Input v1 + Render Update v1 + Viewport State v1
```

旧三-child `/1`是已经实现的历史基线，修正后的 `/1`尚未实现/冻结，二者不能混配；`/2`是 Superseded historical proposal，**不是**新的 current profile。Main拥有选择 authority；当前产品统一部署 revised `/1`属于 [implementation ledger](../30-implementation/viewport-profile-v1-qualification.md)，不是 universal protocol MUST。Direct reset前必须完成真实外部兼容性义务核查。

## 4. Input/Viewport/Render independent semantics

```text
User Input = current Data × Main InputTarget × active Activation × Interest × producer
```

Viewport不是 User Input：current Renderer physical composition指定**一个** logical presentation surface并观察其 CSS logical positive safe width/height；Viewport child在唯一 `/1`上向 current Subsystem Runtime复制，只读 `scope.viewport`保存last observation。Frame suspend/non-InputTarget/focus不 gate size；per-carrier至多一个 writer-admitted viewport + 一个 pending latest，fresh carrier baseline、old source/carrier fenced；last nonnull不代表 paintability。接收 geometry不授予 InputTarget/Frame mutation或直接写 Render Store。具体 Desktop/PWA选 document layout viewport + `Window.innerWidth/innerHeight` 属物理产品实现，不是所有 Core peer必须依赖 DOM的 wire 规则；实际 business content box/letterbox另由产品验收。

Render仍为：Subsystem authoritative RenderDomain→Frozen Render Update v1→per-subsystem Renderer Store→Web Projector。Frame/Activation/InputTarget不自动 destroy Domain，Data retire不 destroy business truth。三 child共享 one reader/writer/terminal但无跨 child revision/ACK/transaction；Control/Data无 total order。Map自行用已经提交的 world facts决定 camera/chunks，使用既有 RenderDomain author API提交 presentation；Core不定义 map gameplay/menu/settle/raster。

## 5. Web presentation / M13 currentness

```text
Window/document bootstrap
→ presentation start
→ current committed Control + eligible Render Store facts
→ package-private Web Projector
→ business Custom Elements
```

Projector reevaluation仅由 committed Control topology或成功 current Render Store commit触发；Viewport physical observation不是第三 desired-state authority。Store/currentness不可从 DOM反推。Same full live identity保留 HTMLElement，fresh Session/G退役旧 universe；same-generation carrier loss保留/冻结 affected DOM，再以 complete Render baseline reconcile；structurally equal RenderData不会因 reconnect重新触发 `receiveRenderData()`。WC owns resource/raster retry与其 ShadowDOM/Canvas，不改 managed DOM或 Store。Presentation physical failure为 Window-local，不回滚 Runtime。

## 6. Failure & lifetime

Malformed Viewport child是 Data terminal `protocol:"viewport"`，不自动 Frame unwind/Runtime fail/RenderDomain destroy；subscriber error local-contained。Data reconnect保留 Runtime viewport capability/last observation，新 matching baseline equal不通知/changed一次；fresh Renderer旧 sample/rAF不能覆盖新 authority。No Control/Viewport/Render super-snapshot或跨 plane barrier。Platform physical terminal汇入已有 authority funnel，不产生第二 kill authority。

## 7. Package direction / non-goals

```text
packages/* framework/runtime
  ↑ public @loomrealm/subsystem author APIs
game-libs/* reusable game domain
  ↑
examples/* concrete games
apps/* physical composition; tools/* importer/dev only
```

禁止 Framework→game-libs反向依赖，business Runtime→DOM/transport/credentials、business WC→Store authority、DOM→Store reverse sync、第二 Store/PresentationState、component registry/AssetManager、generic Environment manager、Main viewport mirror、layout authority、cross-child ACK/transaction、dual Profile、map-special Core fast path或把一次产品 rollout写成协议全局义务。

## 8. M14/M15 and evidence

M14 `examples/essentials-v21.1` consumes `game-libs/map` public author API与prepared Content；map contract gap由 ADR0037 狭义补足，camera/tile/chunk/autotile仍在 library。M14可有 test-owned Chromium harness；真正 Hostra product belongs M15。

```text
Hostra shell (sole Electron/BrowserWindow owner)
→ HOSTRA_SUBCMD LoomRealm Desktop plain Node child
→ RuntimeHosting → Runner → Subsystem
```

M15 reload=fresh Renderer、Data-only reconnect=same Renderer/new carrier。PWA后续 milestone采用不同 physical mechanics但相同 logical author semantics。Viewport修正版 `/1` maturity只看 [dedicated ledger](../30-implementation/viewport-profile-v1-qualification.md)，M11/M14/M15看各自 ledger，历史 PASS不可跨 executable SHA继承。Core Docs Freeze为兼容核查+formal cross-review+executable-ready specs+docs SHA；map PR0 exact 1080p bytes/Core validation/Browser raster/latency是独立 Map Freeze gate。