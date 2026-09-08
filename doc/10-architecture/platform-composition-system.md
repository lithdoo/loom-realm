# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving overall / M9 closed / **M12 Content placement frozen**  
> 主要定义：跨平台 composition boundary、Launcher-owned PREPARE、PlatformLaunchPlan、Runtime Runner、Renderer/Data physical provisioning、Content binding，以及 Hostra/PWA 对同一 logical Session 的 realization  
> 依赖：[系统架构总览](./system-overview.md)、[ADR 0017](../decisions/0017-system-level-platform-composition.md)、[ADR 0019](../decisions/0019-platform-launch-manifest-boundary.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)  
> 被以下文档细化：[运行承载系统](./runtime-hosting-system.md)、[存储与内容系统](./storage-system.md)  
> 被以下文档实现：[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 最近复核：2026-09-08

本文回答：**同一套 LoomRealm application semantics 如何在不同物理平台上被完整准备、组合并运行。**

---

## 1. Core Boundary

```text
             Platform-neutral application roles
┌──────────────────────────────────────────────────────┐
│ Main             Renderer             Subsystem      │
│                  logical Content consumers           │
└──────────────────────────────────────────────────────┘
                         ▲
                 narrow role capabilities
                         │
        ┌────────────────┴────────────────┐
        │                                 │
     Hostra                             PWA
```

Platform是完整 physical Session composition boundary，但不是 universal application authority/service locator。

---

## 2. Launcher-owned PREPARE

```text
Game source
→ session-scoped concrete Platform
→ matching Launcher component
    → @loomrealm/game-package validation
    → current Platform Launch Manifest
    → exact key-set join
    → executable/security/hosting preflight
    → immutable PlatformLaunchPlan
    → LogicalGameBootstrap projection
→ concrete Platform installs plan privately
→ Main receives LogicalGameBootstrap + Main-facing view
```

PREPARE failure必须保持：

```text
Process/Worker create = 0
business Definition import = 0
Runtime Control establishment = 0
```

M12在同一 PREPARE/commit boundary内额外形成 current prepared installation Content view；这不把 Game Entry重新暴露给 Main/business。

---

## 3. Logical Bootstrap vs Physical Plan

```text
LogicalGameBootstrap
    subsystemKeys + initial target/input
    → Main-visible

PlatformLaunchPlan
    executable binding + Host policy/preflight
    → Platform-private

Prepared Content view
    installationId + normalized public manifest + readonly Content index/source
    → Platform-private composition fact
```

不得创建同时暴露 logical + executable + filesystem/credential material 的万能 DTO。

---

## 4. Platform Authority Boundary

Main唯一拥有：

```text
Session / Runtime / Frame / Stack / Activation
InputTarget / Renderer currentness / DataAuthority
```

Subsystem拥有 business state、Input Interest/State、Render authoritative Domains。

Renderer拥有 read-only Main mirror、Input Producers/gate、Render replica；M12 resource bytes read不产生新的 Renderer authority。

Platform拥有：

```text
executable binding
Process/Worker/Window hosting
Control/Data physical provisioning
Content physical service/binding/credential
startup/shutdown/supervision facts
```

Physical ownership不创建第二份 application authority。

---

## 5. Role-facing Capabilities Through M12

Role-facing capability随真实 consumer冻结，不构成一个 universal `Platform` interface。

Main-facing：

```text
DeadlineScheduler
RuntimeHosting
OpaqueMaterialGenerator
RendererControlBinding?
DataConnectionAuthoritySink?
```

Subsystem physical realization：

```text
RuntimeControlBinding
SubsystemDataBinding
Hostra/PWA Runner constructs bound ContentClient
```

Renderer physical realization：

```text
RendererDataBinding
RendererInputSource environment
M12 bound readonly Content access
    → @loomrealm/renderer private ResourceClient
presentation environment
```

注意：Renderer-facing M12不是 public `ContentClient` SDK；public author `ContentClient`只属于 `@loomrealm/subsystem`。Renderer只拥有 private resource bytes responsibility。

M10/M11/M12都没有新增 `@loomrealm/platform-ports` surface。

---

## 6. Runtime / Runner

```text
RuntimeHosting.launch(subsystemKey, LaunchAttemptMaterial)
→ lookup frozen PlatformLaunchPlan
→ Host-owned Runner Container
→ selected Definition Module
→ construct role-local capabilities
→ @loomrealm/subsystem/host
```

Runner capability增长：

```text
M6  RuntimeControlBinding
M8  SubsystemDataBinding role seam
M9  Hostra child Data provisioning implementation
M12 bound ContentClient
M16 PWA equivalent Content/Data physical realization
```

Runner不重新解释 raw Game/Platform manifests，也不把 Content credential放进 Runtime Control/Data application messages。

---

## 7. Data Provisioning — M9 Closed

Hostra：

```text
Main current Renderer + DataAuthority + exact HostedRuntime
→ DataConnectionAuthoritySink.replace(full view)
→ apps/desktop Broker
→ Renderer/Runner WS candidate
→ exact child-scoped HostraRuntimeDataProvisioner
→ commit-time latest-view revalidation
→ sole-current paired install
```

Data candidate/provisioning/loss/post-install delivery failure不直接 fail Runtime/Frame，也不 mutate Main DataAuthority。

M12 Content grant/material与 M9 Data ticket/provisioning IPC严格分离。

---

## 8. Content Binding — M12 Frozen

Logical rule：

```text
Readonly Content capability != executable resolver capability
```

Desktop：

```text
successful Hostra PREPARE
→ current immutable prepared installation view
→ @loomrealm/fsdb readonly snapshot
→ private immutable Content Index + normalized public manifest/version
→ apps/desktop localhost Content Service
→ scoped bearer grants
```

Subsystem：

```text
Hostra owner injects child-private access material
→ Runner constructs bound ContentClient
→ runSubsystem({content,...})
```

Renderer：

```text
Desktop composition binds current installation/grant
→ Renderer-private ResourceClient
→ logical resource + expected version
→ Content API bytes
```

Content credentials不得进入：

```text
Runtime bootstrapToken
M9 Data provisioning IPC/ticket
Renderer Control snapshot
Frame params
Render State
ordinary business payload
```

M12不建立 global Installation Registry、Content Access Profile、generic Repository/StorageProvider 或 universal Content port。

---

## 9. Hostra / PWA Realizations

Hostra：

```text
launch.hostra.json
Node Runner Process
Runtime Control WebSocket
Desktop Data Broker / Data WebSocket
BrowserWindow (M14)
localhost Content HTTP
@loomrealm/fsdb physical source core
```

PWA：

```text
launch.pwa.json
Dedicated Worker Runner
Runtime Control MessagePort
PWA Data Broker / MessageChannel (M16)
Window
Fetch + Service Worker + OPFS/Cache Content (M16)
```

PWA不依赖 Node-only `@loomrealm/fsdb`。两平台必须保持相同 Content logical identity/version/error/business-observable result，而不要求相同 physical storage。

---

## 10. Milestone Placement

```text
M12  Desktop Content capability + two real consumers
M13  loom.map consumes Subsystem ContentClient
M14  BrowserWindow/presentation consumes Renderer ResourceClient
M15  PWA Runtime/Worker vertical
M16  PWA Renderer/Data/Input/Render/Content + full equivalence
```

M14 presentation不得直接使用 localhost privileged URL/path绕过 M12 ResourceClient。M16不得因为 Service Worker mechanics不同而改变 logical Content semantics。

---

## 11. No Platform Mega-package

Complete composition roots：

```text
apps/desktop
apps/pwa
```

Narrow launcher packages只拥有 PREPARE/Runner integration。`apps/*` 可以组合多个 lower-level packages，但不得 duplicate Game/FSDB/protocol/domain validation。

禁止仅为未来用途建立：

```text
UniversalPlatform
RendererHosting core service
ContentService platform port
InstallationRegistry service locator
ConnectionRegistry
cross-platform StorageProvider SPI
```

---

## 12. Cross-platform Equivalence

共享：

```text
same Game topology/LogicalGameBootstrap
same SubsystemDefinitionFactory ABI
same Runtime/Frame/Renderer/Data/Input/Render contracts
same Content logical semantics
same logical scenario/business outcome
```

不比较：

```text
module path/bytes
PID vs Worker id
WS URL vs MessagePort
IPC vs Port transfer
Desktop FSDB/HTTP vs PWA OPFS/Service Worker
```

---

## 13. Final Invariants

1. session-scoped concrete Platform是完整 physical composition boundary；
2. matching Launcher owns current-platform PREPARE，Main不读 Game/executable material；
3. Main仍是唯一 Session/Runtime/Frame/Renderer/Data application authority；
4. Host-owned Runner是 physical Runtime entry；
5. Data provisioning与 Content injection是不同 physical capabilities；
6. M12 Content不新增 Platform Port或 universal Content service locator；
7. Subsystem public ContentClient 与 Renderer private ResourceClient职责不同；
8. Content physical service/credential属于 Platform，logical Content semantics属于 Content contract；
9. Hostra/PWA可以使用不同 storage/transport mechanics；
10. M16只在 logical application trace等价时关闭跨平台 equivalence。
