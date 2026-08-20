# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra Desktop Platform Composition realization：Hostra Launch Manifest/Plan、Node Runner、Hostra Window、WebSocket、Runner provisioning IPC、DataConnectionBroker、HTTP/filesystem 与安全边界  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[Hostra Game Launcher / Node Subsystem Runner Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-20

本文描述完整 Hostra Desktop Platform Composition realization，不是 `@loomrealm/platform-hostra` 包规范。`@loomrealm/game-launcher-hostra` 只抽出其中 Subsystem Runtime launch planning/hosting/Runner integration 的窄 capability；Renderer/Data Broker/Content/Shell 仍由完整 composition 负责。

---

## 1. Composition

```text
Game Entry {key...} + initial
        +
launch.hostra.json {key,module...}
        ↓
Hostra Launch Planner
        ↓ exact key-set join / full executable preflight
HostraLaunchPlan
        ↓
Hostra Desktop
├── Node RuntimeHosting / Supervisor
├── Host-owned Node Subsystem Runner
├── Runtime Control WebSocket
├── Runner Platform Provisioning IPC
├── Hostra Renderer Hosting
├── Renderer Control WebSocket
├── DataConnectionBroker / Data WebSocket
└── fs + localhost HTTP Content
        ↓
platform-neutral Main / Renderer / Subsystem
```

Hostra只拥有 physical topology和 Hostra executable realization，不拥有 Frame/Activation/InputTarget/DataAuthority/Render state。

---

## 2. Hostra Launch Manifest / Preflight

`game.json`只声明 logical Subsystem key。Hostra-specific executable binding来自：

```text
launch.hostra.json
```

当前 binding概念：

```ts
interface HostraSubsystemBindingV1 {
  readonly key: string;
  readonly module: string;
}
```

在 first process spawn前必须完整完成：

```text
validate Game Entry
→ validate Hostra Launch Manifest
→ exact Game↔Hostra key-set join
→ validate every module logical path
→ resolve every module under trusted Installation Root
→ containment / symlink-junction-reparse checks
→ validate Host-selected Node + Runner capability
→ freeze immutable HostraLaunchPlan
```

任何 preflight failure：

```text
process create = 0
business module import = 0
Runtime Control establish = 0
```

普通 Runtime launch path不得重新解释 raw manifest，只按 key lookup frozen plan。

---

## 3. Runner Model

Process entry：

```text
Host-owned Node Runner
```

业务 module：

```text
HostraLaunchPlan[key].module
    = installation-local .mjs Definition Module
```

Runner：

```text
parse/validate Platform bootstrap
→ verify subsystemKey + planned module binding
→ import exact planned module
→ validate default SubsystemDefinitionFactory
→ construct RuntimeControlBinding
→ construct SubsystemDataBinding
→ construct ContentClient
→ runSubsystem(...)
```

Game common manifest不选择 module；Hostra launch manifest不选择 Node executable/Runner entry/arbitrary argv-env/WebSocket credential。

Hostra/PWA可以选择不同 Definition artifact；业务 ABI与 observable semantics仍必须等价。

---

## 4. Hostra Shell Separation

```text
Hostra Shell RPC
    window/platform shell operations

Hostra Game Launcher
    executable manifest / preflight / RuntimeHosting / Runner

LoomRealm Runtime Control
    Control + Frame

LoomRealm Renderer Control
    Main committed authority

LoomRealm Renderer Data
    Data Profile: Connection + Input + Render

Platform Provisioning IPC
    physical infrastructure material for Runner
```

这些可以都由同一产品进程协调，但 protocol/authority domain完全不同。

---

## 5. Runtime Bootstrap

```text
HostraLaunchPlan already frozen
→ Main creates Launch Attempt/token for key
→ RuntimeHosting looks up plan[key]
→ establish Runner provisioning capability
→ spawn Host-owned Runner Process
→ Runner loads exact planned Definition Module
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

## 6. Host-owned Process Policy

Host选择：

```text
Node executable
Host-owned Runner entry
safe environment baseline
shell=false
cwd / resource / timeout / supervision policy
```

`launch.hostra.json` MUST NOT 任意覆盖：

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

Business implementation selection与 Host security/deployment authority严格分开。

---

## 7. Runtime Control WebSocket

```text
one WebSocket text message
= one UTF-8 JSON text string
= one JSON-RPC message
```

no binary / no Batch / no adapter retry/duplicate。

Frame transaction ordering保持 Response-before-dependent-RPC / ACK-before-publication。

Runtime Control loss仍进入 Runtime failure；same-attempt Control reconnect不存在。

---

## 8. Renderer Hosting / Control

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

不携：

```text
Data endpoint/ticket
Runner provisioning IPC
window/process identity
HostraLaunchPlan/module path
```

---

## 9. DataConnectionBroker

当前 authority：

```text
DataAuthority(S,G,P)
```

Broker：

```text
bind current Session/Renderer/S/G/P
→ create/provision authenticated Data WebSocket material
→ supply Renderer side
→ supply target Runner side through Platform Provisioning IPC
→ at most one current Data carrier
```

当前 P：

```text
loomrealm.renderer-data/1
```

Broker不拥有 G/P；endpoint/ticket不能反向创造 DataAuthority。

---

## 10. Runner Provisioning IPC

Node Runner在 spawn时获得 dedicated Host-owned provisioning channel；典型实现 child-process IPC。

它只传 Platform infrastructure material，例如：

```text
fresh Data endpoint/ticket for current S/G/P
revoke/supersede physical material
```

不传：

```text
Frame RPC
Runtime status
business command
Input/Render application message
Main authority mutation
Game/Hostra manifest rewrite
```

Runner收到 current Data offer后：

```text
validate own S/G/P
→ connect authenticated Data WebSocket
→ wrap MessageCarrier<string>
→ SubsystemDataBinding yields {G,P,carrier}
```

same S/G/P reconnect使用 fresh one-time material。

---

## 11. Provisioning Failure

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

Data availability可暂时为 zero；Control/Frame可继续健康运行。

---

## 12. Data Application Mapping

Renderer Data Profile v1：

```text
one Data WebSocket text message
= one UTF-8 JSON text child-protocol object
```

one Data dispatcher demux：

```text
input.*
render.*
```

fresh carrier：

```text
Input registry/state empty → republish/baseline
Render registry → fresh snapshots
```

Data retire不销毁 authoritative Render Domain，也不重建 Runtime/Frame。

---

## 13. Content

```text
filesystem-backed Content Service
→ localhost HTTP
```

Content bearer与 Runtime token/Data ticket相互独立；credential不进入 Frame/Render/business payload。

Executable module resolution由 Hostra Launcher受信任 capability执行，不通过 ordinary Content API给业务任意 execute权限。

---

## 14. Composition Root

当前完整 composition root：

```text
apps/desktop
```

组合可能包括：

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

`game-launcher-hostra`不成为 Renderer/DataBroker/Content/Shell mega-package。

---

## 15. Cross-platform Equivalence

与 PWA共享：

```text
same Game Entry logical topology
same subsystem keys
same SubsystemDefinitionFactory ABI
same logical scenario/business expectations
same Runtime/Frame/Data/Input/Render/Content semantics
```

允许：

```text
Hostra Definition artifact != PWA Definition artifact
Hostra module path != PWA module path
```

不要求：

```text
PID == Worker id
IPC == Port transfer
WS endpoint == MessagePort
HTTP == Service Worker
```

---

## 16. Tests

至少：

```text
valid/invalid Hostra manifest
exact Game↔Hostra key-set join
all modules safely resolved before first spawn
preflight failure produces zero process/import/Control side effect
Host-owned Runner is process entry
business module is loaded exactly from frozen plan
Main launch request has no module
manifest cannot replace Node/Runner/security policy
Runtime Control JSON-text WS
spawn != loaded != connected != identified != ready
ready independent from Data offer
provisioning IPC distinct from application protocols
Data offer S/G/P binding
stale/duplicate offer rejected
same-generation fresh offer
provision failure does not fail Runtime/Frame
Renderer Control has no physical Data/executable material
Data Profile JSON-text demux
fresh input/render baseline
actual process exit → stopped
unexpected code-0 exit → Runtime failure
no auto restart
Hostra/PWA abstract-trace equivalence
```

---

## 17. Final Invariants

1. Game Package只声明 logical key；Hostra manifest拥有 key→Hostra module binding；
2. Game/Hostra key set Phase 1严格相等；
3. immutable HostraLaunchPlan在 first process side effect前完整冻结；
4. Main launch只使用 subsystemKey，不携 module/path；
5. Hostra implements system Platform Composition，不拥有 Main authority；
6. business Definition Module != process entry；
7. Host-owned Node Runner是唯一 process entry；
8. Hostra manifest不能覆盖 Host Node/Runner/credential/security policy；
9. Runtime Control与 provisioning IPC独立；
10. ready不携/暗示 Data offer；
11. Renderer Control只发布 S/G/dataProfile；
12. Broker经 provisioning IPC给 Runner动态提供 Data material；
13. Broker/provisioning不拥有 generation/profile；
14. Data provisioning/loss不等于 Runtime failure/Frame unwind；
15. Control/Data都使用 UTF-8 JSON text application unit；
16. Frame/Data/Render lifecycles独立；
17. Hostra/PWA implementation artifact/physical trace可不同，但 logical application semantics等价。
