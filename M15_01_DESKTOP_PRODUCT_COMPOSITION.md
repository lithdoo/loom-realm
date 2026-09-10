# M15 / 01 — Desktop Product Composition

> 状态：**Implementation Planned / Boundary Frozen**  
> 阶段：M15 Desktop Full E2E  
> 落地顺序：01  
> 最近复核：2026-09-10  
> 依赖：[Desktop Host design](doc/20-modules/desktop-host/README.md)、[Platform Composition](doc/10-architecture/platform-composition-system.md)、[M14 / 05](M14_05_QUALIFICATION_CLOSURE.md)  
> 目标：把 `apps/desktop` 从已有 Data/Content physical slices 补成真实 Electron product composition；只负责物理组合，不新增 application authority。

> **M15 的新增事实只有真实 Desktop hosting。Main、Renderer、Subsystem、M10–M14 的 logical/business semantics 均保持原 owner。**

---

## 1. Required Product Trace

```text
Hostra PREPARE
→ Main Session
→ real Node Runner child
→ Runtime Control
→ Desktop Data Broker
→ Desktop Content
→ Electron BrowserWindow
→ Renderer Control/Data/Input/Presentation
→ same M14 concrete game
```

M15 不再使用 M14 test-owned Window composition 作为产品宿主。

## 2. `apps/desktop` Owns

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

## 3. Startup Ordering

Canonical startup：

```text
Electron ready
→ acquire product inputs
→ Hostra PREPARE
→ prepared Desktop Content view/service
→ Desktop Data Broker + Main physical bindings
→ Main Session / real Runner child
→ arm Renderer candidate capability
→ create BrowserWindow
→ Renderer bootstrap
```

Web Presentation Config 是独立 product startup input；不得进入 Game Entry、Hostra launch manifest、HostraLaunchPlan 或 Main bootstrap。

PREPARE failure 不创建 Runner/business Definition side effects，也不启动 presentation。

## 4. Minimal Implementation Rule

优先直接组合已有 production objects。允许增加 `apps/desktop` 内部的 concrete Electron entry/composition functions；不得为了 M15 新建：

```text
DesktopRuntimeHost
GameHost / GameManager
WindowRegistry
ServiceLocator
UniversalRendererHost
PlatformManager
```

若现有 M13 Window composition 缺少 production-consumable 入口，只提升实际 Desktop consumer 所需的最窄 concrete seam；不新增 package，不抽象跨平台 hosting framework。

## 5. Completion

M15/01 完成时必须能从真实 Electron process 启动同一 M14 game，并证明：

```text
Hostra PREPARE succeeded
real Runner child exists
Main Session is live
Desktop Data/Content are live
one BrowserWindow Renderer candidate becomes current
M14 presentation becomes visible
```

此阶段不以 reload/reconnect/shutdown 完整资格为 closure；这些属于后续 M15 slices。
