# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra Desktop Platform Composition realization：Hostra Launcher-owned Game PREPARE、Node Runner、Hostra Window、WebSocket、Runner provisioning IPC、DataConnectionBroker、HTTP/filesystem 与安全边界  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[ADR 0026](../../decisions/0026-session-scoped-platform-instance.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[Hostra Game Launcher / Node Subsystem Runner Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-28

本文描述完整 Hostra Desktop Platform Composition realization，不是 `@loomrealm/platform-hostra` package spec。`@loomrealm/game-launcher-hostra` 只抽出 Game Entry consumption + Subsystem Runtime launch planning/hosting/Runner integration；Renderer/Data Broker/Content/Shell 仍由完整 composition 负责。

---

## 1. Composition

```text
apps/desktop / product entry
        ↓
create session-scoped HostraPlatform
        ↓
HostraPlatform.prepareGame(installation/source)
        ↓
@loomrealm/game-launcher-hostra PREPARE component
    ├── @loomrealm/game-package validates Game Entry
    ├── validates launch.hostra.json
    ├── exact key-set join
    ├── full executable/security preflight
    ├── immutable HostraLaunchPlan → installed privately in HostraPlatform
    └── immutable LogicalGameBootstrap → returned to composition
        ↓
runMain({ bootstrap: logicalBootstrap, platform: same HostraPlatform })
        ↓
HostraPlatform
├── Main-facing RuntimeHosting / scheduler
├── Node RuntimeHosting / Supervisor
├── Host-owned Node Subsystem Runner
├── Runtime Control WebSocket
├── Runner Platform Provisioning IPC
├── Hostra Renderer Hosting
├── Renderer Control WebSocket
├── DataConnectionBroker / Data WebSocket
└── fs + localhost HTTP Content
```

`apps/desktop` MUST NOT duplicate Game Package schema validation or Hostra manifest/join semantics。

Hostra只拥有 physical topology和 Hostra executable realization，不拥有 Main Frame/Activation/InputTarget/DataAuthority/Render state。

---

## 2. Hostra PREPARE

Product bootstrap caller调用 `HostraPlatform.prepareGame(...)`；HostraPlatform 内部调用 Hostra Launcher component，而不是让 product caller：

```text
parse Game Entry manually
→ pass ValidatedGameEntryV1 manually
→ call Hostra planner
```

Hostra Launcher内部固定：

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

---

## 3. Main Installation Boundary

Main receives：

```text
LogicalGameBootstrap
    subsystemKeys
    initial {subsystemKey,input}

Main-facing capability view
    structurally satisfied by the same prepared HostraPlatform instance
```

Main does not receive：

```text
GameEntryV1 / ValidatedGameEntryV1
formatVersion
launch.hostra.json
HostraLaunchPlan
module/path
Node/Runner/process details
```

`HostraPlatform` 持有 frozen HostraLaunchPlan；`apps/desktop` 只负责编排 `prepareGame()` 与 `runMain()`，MUST NOT重新解释 raw config。Main 不读取 HostraLaunchPlan。

---

## 4. Runner Model

Process entry：

```text
Host-owned Node Runner
```

Business module：

```text
HostraLaunchPlan[key].module
    = installation-local .mjs Definition Module
```

Runner：

```text
parse/validate Platform bootstrap
→ verify subsystemKey + planned binding
→ import exact planned module
→ validate default SubsystemDefinitionFactory
→ construct RuntimeControlBinding
→ M8+ construct SubsystemDataBinding
→ M12+ construct ContentClient
→ runSubsystem(...) with current-milestone capabilities
```

Game common document不选择 module；Hostra launch manifest不选择 Node executable/Runner entry/arbitrary argv-env/WebSocket credential。

---

## 5. Hostra Shell Separation

```text
Hostra Shell RPC
    window/platform shell operations

Hostra Game Launcher
    Game validation orchestration + executable PREPARE + RuntimeHosting + Runner

LoomRealm Runtime Control
    Control + Frame

LoomRealm Renderer Control
    Main committed authority

LoomRealm Renderer Data
    Connection + Input + Render

Platform Provisioning IPC
    physical infrastructure material for Runner
```

同一 product process可协调这些，但 protocol/authority domain完全不同。

---

## 6. Runtime Bootstrap

```text
HostraLaunchPlan already frozen
→ Main creates Launch Attempt/token for key
→ RuntimeHosting looks up plan[key]
→ establish Runner provisioning capability
→ spawn Host-owned Runner Process
→ Runner loads exact Definition Module
→ Runtime Control WS
→ subsystem.hello
→ identified
→ initialize
→ ready
```

```text
plan valid
!= spawned
!= module loaded
!= connected
!= identified
!= ready
ready != Data offer/carrier
```

Module load/default-export ABI failure属于 required Runtime bootstrap failure；whole Game Bootstrap按 all-required policy统一 cleanup。

`stopped`只来自 process termination observation。

---

## 7. Host-owned Process Policy

Host选择：

```text
Node executable
Host-owned Runner entry
safe environment baseline
shell=false
cwd/resource/timeout/supervision policy
```

`launch.hostra.json` MUST NOT override：

```text
Node executable
--loader / --require / --inspect
shell/interpreter
arbitrary argv
NODE_OPTIONS / NODE_PATH
bootstrapToken
Control endpoint
Data ticket
```

---

## 8. Runtime Control WebSocket

```text
one WebSocket text message
= one UTF-8 JSON text string
= one JSON-RPC message
```

No binary/Batch/adapter retry/duplicate。

Frame transaction ordering保持 Response-before-dependent-RPC / ACK-before-publication。

Runtime Control loss进入 Runtime failure；same-attempt reconnect不存在。

---

## 9. Renderer Hosting / Control

```text
Main Renderer intent
→ Hostra BrowserWindow/Web app
→ Renderer Control WebSocket
→ renderer.hello
→ full current Authority Snapshot
```

Snapshot：

```text
Runtime/Stack/Activation/InputTarget
DataAuthority {S,G,dataProfile}
```

不携 Data endpoint/ticket、Runner provisioning IPC、HostraLaunchPlan/module path、Game Entry material。

---

## 10. DataConnectionBroker

```text
DataAuthority(S,G,P)
→ Hostra Broker
→ create/provision authenticated Data WebSocket material
→ Renderer side
→ target Runner side through provisioning IPC
→ at most one current Data carrier
```

Current `P = loomrealm.renderer-data/1`。

Broker不拥有 generation/profile；endpoint/ticket不能反向创造 DataAuthority。

---

## 11. Runner Provisioning IPC

Node Runner spawn 时获得 dedicated Host-owned provisioning channel，典型 child-process IPC。

只传 Platform infrastructure material，例如：

```text
fresh Data endpoint/ticket for current S/G/P
revoke/supersede physical material
```

不传 Frame RPC、Runtime status、business command、Main authority mutation、Game/Hostra manifest rewrite。

---

## 12. Provisioning Failure

```text
expired/stale ticket
Data WS connect failure
provisioning IPC loss
same-generation reconnect failure
```

本身：

```text
!= Runtime failure
!= Frame unwind
!= DataAuthority mutation
```

Data availability可暂时为 zero；Control/Frame可继续健康。

---

## 13. Data Application Mapping

Renderer Data Profile v1：

```text
one Data WebSocket text message
= one UTF-8 JSON text child-protocol object
```

One Data dispatcher demux `input.*` / `render.*`。

fresh carrier：Input registry/state empty并 republish/rebaseline；Render current registry + fresh snapshots。

---

## 14. Content

```text
filesystem-backed Content Service
→ localhost HTTP
```

Content credential与 Runtime token/Data ticket相互独立。

Executable module resolution由 Hostra Launcher trusted capability执行，不通过 ordinary Content API 给业务 arbitrary execute authority。

---

## 15. Composition Root

Current full composition root：

```text
apps/desktop
```

MAY combine：

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/game-launcher-hostra
@loomrealm/launcher-node
@loomrealm/transport-websocket
content adapters
Hostra Renderer/Data Broker/Shell integration
business artifacts
```

`apps/desktop` 可以依赖 launcher；Main/business不得反向依赖。

---

## 16. Cross-platform Equivalence

与 PWA共享：

```text
same Game Entry logical topology
same resulting LogicalGameBootstrap semantics
same subsystem keys
same SubsystemDefinitionFactory ABI
same logical scenario/business expectations
same Runtime/Frame/Data/Input/Render/Content semantics
```

允许不同 Definition artifact/module path/physical trace。

---

## 17. Tests

```text
Hostra launcher owns Game Entry validation step
apps/desktop does not duplicate Game schema/join logic
valid/invalid Hostra manifest
exact Game↔Hostra key-set join
all modules resolved before first spawn
PREPARE failure zero process/import/Control side effect
logicalBootstrap has no Game document/executable material
Host-owned Runner is process entry
Main launch has no module
manifest cannot replace Node/Runner/security policy
Runtime Control JSON-text WS
spawn != loaded != connected != identified != ready
ready independent from Data offer
provisioning IPC distinct from application protocols
Data offer S/G/P binding
same-generation fresh offer
provision failure does not fail Runtime/Frame
actual process exit → stopped
unexpected code-0 exit → Runtime failure
no auto restart
Hostra/PWA abstract-trace equivalence
```

---

## 18. Final Invariants

1. apps/desktop调用 matching Hostra Launcher prepare，而不手动调用 Game Package；
2. Hostra Launcher内部拥有 common Game validation orchestration；
3. HostraLaunchPlan + LogicalGameBootstrap在 first process side effect前完整冻结；
4. Main不接收 GameEntry/module/path；
5. Hostra implements physical composition，不拥有 Main authority；
6. business Definition Module != process entry；
7. Host-owned Node Runner是唯一 process entry；
8. Hostra manifest不能覆盖 Host Node/Runner/credential/security policy；
9. Runtime Control与 provisioning IPC独立；
10. Data provisioning/loss不等于 Runtime failure/Frame unwind；
11. Control/Data使用 UTF-8 JSON text application unit；
12. Hostra/PWA artifact/physical trace可不同，但 logical application semantics等价。
