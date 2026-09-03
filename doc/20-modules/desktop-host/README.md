# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：M6 Runtime Vertical Implemented / M14 Full E2E Planned  
> 稳定程度：M6 Qualified Baseline / Later Slices Evolving  
> 主要定义：Hostra Desktop Platform Composition realization：Hostra Launcher-owned Game PREPARE、Node Runner、Runtime Control WebSocket，以及 M14 BrowserWindow/Renderer Control/Data/Content full composition target  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[ADR 0026](../../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[Hostra Game Launcher / Node Subsystem Runner Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-09-03

本文描述完整 Hostra Desktop Platform Composition target，不是 `@loomrealm/platform-hostra` package spec。当前 M6 已只关闭 Runtime physical vertical；Renderer/Data/Content 的真实 Hostra product composition在 M14及其前置 milestones逐步完成。

---

## 1. Milestone Shape

### M6 Qualified Baseline

```text
apps/desktop / Hostra product entry
→ session-scoped HostraPlatform
→ HostraPlatform.prepareGame(...)
→ @loomrealm/game-launcher-hostra PREPARE
→ HostraLaunchPlan installed privately + LogicalGameBootstrap
→ runMain({bootstrap, platform})
→ RuntimeHosting
→ Host-owned Node Runner
→ Runtime Control WebSocket
→ @loomrealm/subsystem/host
```

M6 explicitly does **not** include BrowserWindow Renderer、Renderer Control physical hosting、Data Broker、Input/Render/Content。

### M14 Full Desktop Target

```text
M6 Runtime vertical
+
Hostra BrowserWindow/Web Renderer
+
M7 Frozen RendererControlBinding physical realization
+
Renderer Control WebSocket
+
M9 Desktop DataConnectionBroker / Data WebSocket
+
M10 Input
+
M11 Render
+
M12 Content
→ full Desktop E2E
```

Hostra only owns physical topology/executable realization；Main retains Frame/Activation/InputTarget/DataAuthority/Renderer-currentness authority。

---

## 2. Hostra PREPARE

Product bootstrap caller调用 `HostraPlatform.prepareGame(...)`；HostraPlatform内部调用 Hostra Launcher component：

```text
obtain Game Entry
→ @loomrealm/game-package validate
→ validate launch.hostra.json
→ exact Game↔Hostra key-set join
→ validate every module logical path
→ resolve every module under trusted Installation Root
→ containment / symlink-junction-reparse checks
→ validate Host-selected Node + Runner capability
→ freeze HostraLaunchPlan
→ project LogicalGameBootstrap
```

Any PREPARE failure：

```text
process create = 0
business module import = 0
Runtime Control establish = 0
```

`apps/desktop` MUST NOT duplicate Game Package schema validation or Hostra manifest/join semantics。

---

## 3. Main Installation Boundary

Main receives only：

```text
LogicalGameBootstrap
+
Main-facing narrow capability view
```

Main does not receive：

```text
GameEntryV1 / formatVersion
launch.hostra.json
HostraLaunchPlan
module/path
Node/Runner/process details
```

Through M7 Main-facing view evolves to：

```text
DeadlineScheduler
OpaqueMaterialGenerator
RuntimeHosting
RendererControlBinding?   // optional; M14 Hostra realization
```

M7 `OpaqueMaterialGenerator` migration is mechanical for existing Hostra Runtime-only provider；M6 composition remains valid with `rendererControl` absent。

---

## 4. Runner Model

Physical Runtime entry：

```text
Host-owned Node Runner
```

Business module：

```text
HostraLaunchPlan[key].module
= installation-local Definition Module
```

Runner current/future capability growth：

```text
M6  RuntimeControlBinding
M8+ SubsystemDataBinding
M12+ ContentClient
```

Game common document不选择 module；Hostra launch manifest不选择 Node executable/Runner entry/arbitrary argv-env/WebSocket credential。

---

## 5. Hostra Shell Separation

```text
Hostra Shell / product lifecycle
    window/platform shell operations

Hostra Game Launcher
    Game validation + executable PREPARE + RuntimeHosting + Runner

Runtime Control
    Main ⇄ Subsystem Control/Frame semantics

Renderer Control
    Main committed Renderer authority mirror

Renderer Data
    Data Connection + Input + Render

Platform provisioning
    physical carrier/ticket/IPC material
```

同一 product process可协调这些，但不能合并 protocol/authority domain。

---

## 6. Runtime Bootstrap — M6

```text
HostraLaunchPlan frozen
→ Main creates Launch Attempt/bootstrap credential
→ RuntimeHosting looks up plan[key]
→ spawn Host-owned Runner
→ Runner loads exact Definition Module
→ Runtime Control WS
→ subsystem.hello / identified / initialize / ready
```

```text
plan valid != spawned != module loaded != connected != identified != ready
ready != Renderer exists
ready != Data current
```

`stopped`只来自 process termination observation。Unexpected Runtime exit仍进入 Main Runtime failure domain；no automatic restart。

---

## 7. Host-owned Process Policy

Host chooses：

```text
Node executable
Host-owned Runner entry
safe environment baseline
shell=false
cwd/resource/timeout/supervision policy
```

`launch.hostra.json` MUST NOT override executable/Runner/security/credential policy。

---

## 8. Runtime Control WebSocket — M6

```text
one WebSocket text message
= one UTF-8 JSON text string
= one JSON-RPC application object
```

No binary/Batch/adapter retry/duplicate。

Frame transaction ordering保持 Response-before-dependent-RPC / ACK-before-publication。Runtime Control loss进入 Runtime failure；same-attempt reconnect不存在。

---

## 9. Renderer Hosting / Control — M14

M14 Hostra product负责创建/显示/reload BrowserWindow；该 responsibility **不是** 一个 M7 Core `RendererHosting` port。

Frozen candidate path：

```text
Main arms RendererControlBinding.acquire(T, signal)
→ Hostra product waits for/accepts one physical BrowserWindow Renderer candidate
→ delivers exact Main-issued T through secure bootstrap
→ establishes Renderer Control WebSocket MessageCarrier<string>
→ acquire resolves with that candidate carrier
→ @loomrealm/renderer-control peer handles renderer.hello/version
→ Main atomic hello acceptance grants current Renderer
```

Binding does not authenticate token、negotiate protocol version或 decide currentness。

Transient physical candidate establishment failure MAY be absorbed/disposed inside Hostra while `acquire` remains pending。If a non-abort `acquire` rejection is surfaced to Main, Frozen M7 semantics make that Binding terminal for the Main Session；Hostra must not invent a private retry/currentness protocol。

Renderer Snapshot contains only logical Runtime/Stack/Activation/InputTarget/DataAuthority，never endpoint/ticket/HostraLaunchPlan/module path。

---

## 10. DataConnectionBroker — M9 Core / M14 Composition

M9 closes Desktop broker/provisioning mechanics：

```text
DataAuthority(S,G,P)
→ Desktop Broker
→ Data WebSocket candidate material
→ Renderer endpoint
→ target Runner endpoint through provisioning IPC
→ paired Data Connection install
```

Broker不拥有 generation/profile；endpoint/ticket不能创造 DataAuthority。

M9 does not imply BrowserWindow full product composition。M14 composes M9 broker with real Renderer + Input/Render/Content。

---

## 11. Runner Provisioning IPC

Dedicated Host-owned provisioning path MAY carry：

```text
fresh Data endpoint/ticket for current S/G/P
revoke/supersede old physical material
```

It MUST NOT carry Frame RPC、business command、Main authority mutation或 Game manifest rewrite。

Provisioning failure本身 != Runtime failure / Frame unwind / DataAuthority mutation。

---

## 12. Data Application / Input / Render

Renderer Data Profile：

```text
loomrealm.renderer-data/1
= Data Connection v1 + User Input v1 + Render Update v1
```

Data WebSocket application unit remains UTF-8 JSON text。One Data dispatcher demux input/render。

Fresh carrier resets remote Input baseline and Render publication baseline according to frozen child contracts；Frame/Data/Render lifecycles remain independent。

---

## 13. Content — M12/M14

Desktop Content target：

```text
filesystem-backed readonly Content Service
→ localhost HTTP
```

Content credential与 Runtime/Renderer/Data credentials独立。Executable module resolution remains trusted Launcher/Runner capability, not ordinary Content access。

---

## 14. Composition Root

`apps/desktop` is final product composition root and MAY combine packages/adapters as milestones land；this does not make Main/business depend on concrete Hostra implementation。

M14 is the first milestone that claims **full Desktop E2E** across Runtime/Renderer/Data/Input/Render/Content。

---

## 15. Cross-platform Equivalence

Hostra/PWA share：

```text
same Game logical topology
same LogicalGameBootstrap semantics
same formal Runtime/Frame/Renderer/Data/Input/Render/Content contracts
same business-observable result
```

Physical module path/bytes、PID/Worker、WS/MessagePort、IPC/Port transfer MAY differ。

---

## 16. Qualification Placement

M6 already qualifies：

```text
Hostra PREPARE
Node Runner
RuntimeHosting
Runtime Control WebSocket
real Main↔Runner↔Subsystem trace
process supervision/termination
```

M14 additionally must qualify：

```text
M7 Frozen RendererControlBinding settlement/currentness semantics on real WS
BrowserWindow reload/replacement
finite stalled-write close policy
M9 Data Broker + Runner provisioning
Input/Render/Content full trace
transient candidate establishment handling without second Binding protocol
shutdown convergence
```

---

## 17. Final Invariants

1. M6 Runtime vertical remains a qualified baseline；
2. HostraLauncher owns Game PREPARE/Runtime launch only，不吞并 Renderer/Data/Content；
3. Main receives no Game/executable material；
4. Host-owned Node Runner is Runtime entry；
5. Hostra physical composition does not own Main authority；
6. M7 `RendererControlBinding` is Main-facing candidate-slot/carrier capability；
7. BrowserWindow hosting remains M14 concrete product responsibility；
8. Renderer Control token/version/currentness semantics remain Frozen M7, not Hostra-specific；
9. M9 broker/provisioning does not own DataAuthority；
10. Data provisioning failure != Runtime/Frame failure；
11. Control/Data application units remain UTF-8 JSON text；
12. M14, not M6/M9, is full Desktop E2E closure。
