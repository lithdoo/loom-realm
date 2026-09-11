# ADR 0034 — Hostra owns Desktop Electron composition; LoomRealm runs as HOSTRA_SUBCMD

- 状态：Accepted / M15 preimplementation correction
- 日期：2026-09-11
- 影响范围：M15 Desktop physical composition、Window ownership、Renderer bootstrap transport、shutdown/failure convergence、qualification
- Supersedes for canonical M15 composition：ADR 0033 的 direct-Electron embedding assumption

## Context

M15 首次实现已经证明 LoomRealm 的 Main、RuntimeHosting、Data Broker、Content、Renderer、DOM Input、M13 Presentation 与 M14 game 可以在真实 Electron BrowserWindow 中工作。但该实现由 `apps/desktop` 自己 import Electron、创建 BrowserWindow，并使用 Electron preload / MessageChannelMain 完成 Renderer bootstrap。

真实 `lithdoo/hostra` 的产品模型不同：Hostra 自己是 Electron local shell、BrowserWindow owner 与 WebSocket JSON-RPC server，并通过 `HOSTRA_SUBCMD` 启动直属业务子进程。业务进程通过 Hostra RPC 请求 `openWindow` / `closeWindow` 并消费 `hostra.event`；它不应再次成为第二个 Electron window host。

因此旧 M15 physical topology：

```text
LoomRealm Desktop
→ Electron
→ BrowserWindow
```

不能作为 canonical Hostra Desktop composition。

当前尚无针对该错误 direct-Electron M15 topology 的外部 compatibility obligation。按照 `document-governance.md` 的 Frozen preimplementation correction 规则，本 ADR 记录一次最小的首次实现前 physical correction。

## Decision

Canonical M15 topology 固定为：

```text
Hostra shell
├─ Electron app
├─ BrowserWindow owner
├─ Hostra preload / ambient API
├─ WebSocket JSON-RPC
└─ HOSTRA_SUBCMD
     ↓
LoomRealm Desktop process (plain Node)
├─ Hostra RPC concrete adapter
├─ Main
├─ RuntimeHosting
│   └─ Runner child
├─ DesktopDataConnectionBroker
├─ Content + trusted shell listener
├─ Renderer Control loopback physical carrier
└─ Renderer Data settlement loopback physical carrier
```

术语固定：

```text
Hostra shell
    = lithdoo/hostra external Electron host

Hostra launch profile
    = @loomrealm/game-launcher-hostra PREPARE + Node Runner realization

LoomRealm Desktop process
    = Hostra HOSTRA_SUBCMD direct child

Runner
    = LoomRealm RuntimeHosting child of the Desktop process
```

不得再用模糊的 `Hostra → Runner` 表述替代真实进程 owner chain。

## Ownership

```text
Hostra shell
    physical Electron / BrowserWindow / direct-subprocess authority

LoomRealm Desktop process
    LoomRealm-specific Control/Data/Content/shell physical composition

Main
    Session / Runtime / Frame / Renderer currentness / DataAuthority

Renderer
    replica / presentation / physical input producer

Subsystem/game
    business state / Render authority
```

Hostra RPC 只承担已有 host-control operations。Renderer Control、Data settlement/application、Content bytes、Input/Render/business messages 不进入 Hostra RPC。

## Renderer physical transport

Direct-Electron `MessageChannelMain` / LoomRealm preload handoff 被 supersede。

M15 使用 LoomRealm-owned loopback physical capabilities：

```text
Renderer Control
    existing RendererControlBinding logical contract
    → concrete one-shot loopback carrier

Data
    existing DesktopDataConnectionBroker authority/currentness
    → concrete narrow settlement carrier
    → existing Data application carrier

Content
    existing Desktop Content semantics
    + exact trusted document shell route
```

具体 listener 是否共享不是 architecture contract。冻结的是 capability/wire separation，而不是 Server-class topology。

## Document bootstrap rendezvous

Single-window M15 只需要三个有界事实：

```text
pendingAcquire   0..1
pendingDocument  0..1
currentDocument  0..1
```

Main Renderer Control acquire 与 top-level document navigation 谁先到谁等待；两者都存在时才 mint fresh document-local Control/Data/Content material并完成 bootstrap。

request abort、acquire abort 或 product terminal 必须撤销对应 pending state。不得为此增加 `DocumentManager`、`BootstrapCoordinator`、`WindowSession` 或 product Window state-machine framework。

Trusted shell bootstrap route 只接受当前 Hostra Window 的 top-level main-document navigation。普通 `fetch`/XHR、subframe/iframe、script/resource request 或其他非 top-level navigation不得创建/替换 Renderer document lifetime。

## Termination funnel

所有 product-terminal trigger 汇入一个 idempotent one-shot termination path：

```text
window.closed
SIGTERM / SIGINT
host.shuttingDown
Hostra RPC terminal
programmatic product close
Main / Runner fatal
startup partial failure
        ↓
beginTermination(reason)
        ↓
abort runMain signal
        ↓
await/preserve Main settlement
        ↓
finally close LoomRealm Control/Data/Content/document resources
        ↓
exit LoomRealm Desktop process
```

Hostra 在非 macOS 上最后一个 Window 关闭后会进入自身 shutdown，并向 `HOSTRA_SUBCMD` 发送 SIGTERM；因此 LoomRealm Node entry 必须显式处理 termination signals，并通过同一 owner chain 收敛 Runner。不得依赖 `window.closed` notification 一定先于 signal，也不得让 Main rejection 跳过 physical cleanup。

Hostra 的外层 shutdown grace 是 qualification 必须验证的实际平台约束；若当前 RuntimeHosting owner chain 不能在 pinned Hostra 的真实 grace 下无 orphan 收敛，则必须记录为 platform contradiction，而不是增加第二套 Runner kill authority。

## Startup failure

PREPARE failure、loopback listener failure、Main early rejection、Hostra RPC/openWindow failure、document/bootstrap failure均不建立额外 rollback framework。已创建的资源通过同一个 finally-like termination path逆序收敛。`openWindow` RPC success 只代表 Hostra 接受/创建 Window，不代表 LoomRealm product ready。

## Migration staging

迁移期间允许历史 direct-Electron vertical 暂时作为 regression oracle，但它不得保持 canonical ownership。

```text
Slices 1–6
    canonical Hostra path MUST NOT depend on Electron ownership
    legacy direct-Electron path MAY remain isolated temporarily

Final replacement slice
    Hostra vertical qualified
    → delete legacy Electron ownership
    → repository-wide apps/desktop production Electron ownership/import = FAIL
```

不得同时要求“保留 legacy path”与“迁移第一步仓库内完全不存在 Electron source”。

## What does not change

本 ADR 不改变：

```text
M10–M14 logical/business contracts
Main authority
Renderer Control logical protocol
DataAuthority / M9 Broker candidate-currentness semantics
Content API semantics
M13 Web Presentation semantics
M14 game/map semantics
@loomrealm/game-launcher-hostra PREPARE/Runner logical contract
Hostra shell implementation/preload/RPC semantics
```

本次 correction 不引入 HostraManager、HostraSession、WindowRegistry、DocumentManager、ConnectionManager、RecoveryManager、TransportRegistry、BrowserPrimitiveRegistry 或新的 cross-platform Hostra port。

## ADR 0033 relationship

ADR 0033 解决的是旧假设“LoomRealm Desktop 自己是 Electron main 时，`process.execPath` 如何启动 Node Runner”的兼容问题。该 direct-Electron embedding 不再是 canonical M15 product topology，因此 ADR 0033 不再约束 canonical M15 composition。

ADR 0033 作为历史实现 provenance 保留；如果其他真实 Electron-main consumer 仍直接使用 `@loomrealm/game-launcher-hostra`，其中 run-as-node decision 可继续适用于那个 consumer。

## Propagation

本决策必须同步到：

```text
M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md
M15_01..M15_05 supersession banners
product-vision.md
system-overview.md
platform-composition-system.md
desktop-host/README.md
phase-1-delivery-plan.md
testing-strategy.md
package-architecture.md
m15-qualification.md
root README/navigation
ADR 0033 historical relationship
```

## Reopen

仅当真实 Hostra public RPC/window/subprocess lifecycle 与 frozen LoomRealm contracts 存在无法通过 concrete adapter解决的 correctness/security contradiction时 reopen。

代码便利性、测试便利性、未来多窗口/多 Hostra session、或为了复用而抽象，不足以 reopen。
