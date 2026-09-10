# M15 / 01 — Desktop Product Composition

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M15 Desktop Full E2E  
> 落地顺序：01  
> 最近复核：2026-09-11  
> 依赖：[Desktop Host design](doc/20-modules/desktop-host/README.md)、[Platform Composition](doc/10-architecture/platform-composition-system.md)、[M14 / 05](M14_05_QUALIFICATION_CLOSURE.md)、[ADR 0033](doc/decisions/0033-electron-hostra-run-as-node.md)  
> 目标：把 `apps/desktop` 从已有 Data/Content physical slices 补成真实 Electron product composition；只负责物理组合，不新增 application authority。

> **M15 的新增事实只有真实 Desktop hosting。Main、Renderer、Subsystem、M10–M14 的 logical/business semantics 均保持原 owner。**

---

## 1. Required Product Trace

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

M15 不再使用 M14 test-owned Window composition 作为产品宿主。

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

## 3. `apps/desktop` Owns

```text
Electron application entry
BrowserWindow creation/teardown
physical Renderer Control binding
existing Desktop Data Broker wiring
existing Desktop Content service wiring
product-private Web Presentation Config acquisition
startup/shutdown ordering
```

`apps/desktop` 不拥有：

```text
Session / Runtime / Frame / Activation / InputTarget / DataAuthority
Render business state
map semantics
presentation component registry/layering
second currentness/projection state
```

## 4. Electron-hosted Hostra Runner

M15 uses the existing Hostra `RuntimeHosting` path；it does not create an Electron-specific Runner authority。

ADR 0033 fixes the exact physical realization：

```text
Electron main is current Hostra composition process
→ Hostra PREPARE keeps canonical process.execPath
→ supported Desktop Electron build keeps runAsNode fuse enabled
→ RuntimeHosting synthesizes ELECTRON_RUN_AS_NODE=1 for Runner child only
→ spawn(process.execPath, [package-owned RunnerEntry], shell=false)
→ child is the same existing Hostra Node Runner
```

Frozen constraints：

```text
no HostraPrepareOptions.nodeExecutable
no Node path in launch.hostra.json
no UtilityProcess second Runner path
no Electron-specific RuntimeHosting
no inherited/arbitrary ELECTRON_RUN_AS_NODE from Game/business config
```

The special environment value is host-owned physical launch material。Ordinary Node-hosted Hostra behavior remains unchanged。

M15 qualification MUST prove the supported Electron build can start this real Runner and that the existing Runtime Control/Main lifecycle reaches ready and later terminates through `HostedRuntime`；a Desktop build with `runAsNode` disabled is non-conforming。

## 5. Startup Ordering

Canonical startup：

```text
Electron ready
→ select Hostra installation root
→ Hostra PREPARE
→ prepared Desktop Content view/service
→ Desktop Data Broker + Main physical bindings
→ start Main Session / real Hostra Runner child
→ existing Runtime Control reaches Main-owned ready path
→ Main arms Renderer Control candidate slot
→ create BrowserWindow shell
→ M15/02 fulfills the physical Renderer candidate/bootstrap
```

`RendererControlBinding.acquire(...)` 的 slot/currentness 仍由 Main-owned flow决定；Desktop只提供 physical carrier，不 mint Renderer authority。

Web Presentation Config 是独立 product startup input；不得进入 Game Entry、Hostra launch manifest、HostraLaunchPlan 或 Main bootstrap。

PREPARE failure 不创建 Runner/business Definition side effects，也不启动 presentation。

## 6. Minimal Implementation Rule

优先直接组合已有 production objects。允许增加 `apps/desktop` 内部的 concrete Electron entry/composition functions；不得为了 M15 新建：

```text
DesktopRuntimeHost
GameHost / GameManager
WindowRegistry
ServiceLocator
UniversalRendererHost
PlatformManager
```

M15/02 唯一允许补出的 shared surface 是现有 M13 implementation 的最窄 trusted product-consumable Renderer subpath；不得新增 package或跨平台 hosting framework。

Hostra Electron correction remains inside the existing launcher/runtime-hosting owner；Desktop不得包一层新的 ProcessManager 来隐藏它。

## 7. Completion

M15/01 只关闭 **Electron main/product composition slice**；不提前要求 M15/02 的 Renderer currentness 或 visible presentation。

完成时必须证明：

```text
checked-in Hostra installation can be selected
Hostra PREPARE succeeds in Electron main
supported Electron runAsNode capability is exercised by the product
real existing Hostra Runner child starts through process.execPath Node mode
existing Runtime Control reaches ready without a second Runtime path
prepared Desktop Content view/service exists
Desktop Data Broker + Main physical bindings exist
runMain owns the same real HostedRuntime
product-owned lifetime/cancellation is established
BrowserWindow shell creation path exists
Renderer Control physical slot can be handed to M15/02
```

Renderer candidate becomes current、BrowserWindow Data/Content acquisition 与 M14 presentation visible 由 M15/02关闭；reload/reconnect/shutdown完整资格由后续 slices关闭。
