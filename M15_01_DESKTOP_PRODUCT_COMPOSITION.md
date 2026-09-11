# M15 / 01 — Desktop Product Composition

> 状态：**Logical intent retained / direct-Electron physical realization superseded**  
> 阶段：M15 Desktop Full E2E  
> 原落地顺序：01  
> 最近复核：2026-09-11  
> 当前 physical SSOT：[M15 Hostra Desktop Recomposition Plan](M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)  
> 依赖：[Desktop Host design](doc/20-modules/desktop-host/README.md)、[Platform Composition](doc/10-architecture/platform-composition-system.md)、[M14 / 05](M14_05_QUALIFICATION_CLOSURE.md)

> **Supersession notice:** 本文关于 Main/Broker/Content ownership、Hostra-ready installation、无 shadow authority 的约束继续有效；关于 LoomRealm 自己拥有 Electron app、BrowserWindow、Electron-main Runner/run-as-node product topology 的 physical realization 已被 `M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md` supersede，不再作为实施要求。

> **M15 的新增事实只有真实 Desktop hosting。Main、Renderer、Subsystem、M10–M14 的 logical/business semantics 均保持原 owner。**

---

## 1. Historical Required Product Trace

以下 trace 记录原 direct-Electron 实现目标，仅作为历史/迁移背景：

```text
Hostra-ready M14 installation
→ Hostra PREPARE in Electron main
→ Main Session
→ process.execPath Hostra Runner child in Electron run-as-node mode
→ existing Runtime Control WebSocket
→ Desktop Data Broker
→ Desktop Content
→ Electron BrowserWindow
→ Renderer Control/Data/Input/Presentation
→ same M14 concrete game
```

当前 canonical product trace 由 recomposition plan 定义为 Hostra-owned Electron/BrowserWindow + `HOSTRA_SUBCMD` LoomRealm Node process。

## 2. Hostra-ready M14 Installation

Canonical Desktop vertical 直接使用 checked-in `examples/essentials-v21.1` installation，不在测试中临时生成另一份 Hostra game：

```text
examples/essentials-v21.1/
    game.json
    launch.hostra.json
    subsystems/map.mjs
    presentation.json
    presentation.css
    fixtures/...
```

Hostra binding exactly：

```text
subsystemKey = "map"
→ subsystems/map.mjs
→ default export from @loomrealm-game/map
```

`launch.hostra.json` 只完成 Hostra executable binding；不得携带 Electron、Content、Data、Renderer 或 presentation 配置。`subsystems/map.mjs` 只作为 installation-local module seam，不复制 map Runtime/business source。

因此同一个 concrete example 同时拥有：

```text
game.json              logical game declaration
launch.hostra.json      Hostra executable binding
presentation.json       Web presentation startup declaration
```

三者保持既有边界，不合并成 product manifest。

## 3. `apps/desktop` Ownership — Current Rule

`apps/desktop` 只拥有 LoomRealm physical composition：

```text
thin Hostra RPC adapter
physical Renderer Control binding
existing Desktop Data Broker wiring
existing Desktop Content/shell service wiring
product-private Web Presentation Config acquisition
LoomRealm startup/shutdown ordering
```

Hostra owns：

```text
Electron application
BrowserWindow creation/teardown
Hostra preload/RPC/direct subprocess lifetime
```

`apps/desktop` 不拥有：

```text
Session / Runtime / Frame / Activation / InputTarget / DataAuthority
Render business state
map semantics
presentation component registry/layering
second currentness/projection state
Electron app / BrowserWindow authority
```

## 4. Historical Electron-hosted Runner Note

The earlier direct-Electron implementation used `process.execPath` + host-synthesized `ELECTRON_RUN_AS_NODE=1` to run the existing Hostra Runner without creating a second Runtime path. That compatibility behavior remains historical implementation evidence, but it is no longer the canonical M15 product topology after recomposition。

Current M15 product topology is：

```text
Hostra Electron process
→ HOSTRA_SUBCMD LoomRealm Desktop plain Node process
→ existing RuntimeHosting
→ Node Runner
```

Do not reopen M6/M9 RuntimeHosting merely to remove historical Electron compatibility code；remove it only if independent qualification proves no remaining real consumer。

## 5. Current Startup Ownership

Canonical startup ordering now comes from the recomposition plan：

```text
Hostra RPC ready
→ Hostra starts HOSTRA_SUBCMD
→ LoomRealm PREPARE
→ prepared Content/shell + Data/Control physical services
→ runMain(...)
→ Main arms Renderer Control candidate
→ Hostra RPC openWindow(...)
→ Hostra-owned BrowserWindow requests LoomRealm shell
→ Renderer Control/Data/Content/Presentation converge
```

`RendererControlBinding.acquire(...)` 的 slot/currentness 仍由 Main-owned flow 决定；Desktop只提供 physical carrier，不 mint Renderer authority。

Web Presentation Config 是独立 product startup input；不得进入 Game Entry、Hostra launch manifest、HostraLaunchPlan 或 Main bootstrap。

PREPARE failure 不创建 Runner/business Definition side effects，也不启动 presentation。

## 6. Minimal Implementation Rule

优先直接组合已有 production objects。不得为了 M15 新建：

```text
DesktopRuntimeHost
GameHost / GameManager
WindowRegistry / WindowLifecycleManager
DocumentManager / BootstrapCoordinator
ServiceLocator
UniversalRendererHost
PlatformManager
HostraManager / HostraSession
```

Hostra RPC adapter 保持 `apps/desktop` concrete module；不提升到 `platform-ports`。M13 production seam 继续只使用既有最窄 trusted Renderer subpath；不得新增 package 或跨平台 hosting framework。

## 7. Current Completion Meaning

M15/01 retained intent is complete when：

```text
checked-in Hostra installation remains canonical
Hostra PREPARE / Main / existing RuntimeHosting remain the same logical path
prepared Desktop Content exists
Desktop Data Broker + Main physical bindings exist
apps/desktop owns no Electron app/BrowserWindow authority
Hostra RPC composition can provide the product Window
product-owned lifetime/cancellation is established without a second authority
```

Renderer/browser physical details、reload/reconnect/full qualification are governed by `M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md` and the retained logical intent of M15/02–M15/05。
