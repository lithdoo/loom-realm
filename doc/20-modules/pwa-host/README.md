# PWA Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：PWA Platform Composition realization：PWA Launcher-owned Game PREPARE、Window、Worker Runner、MessagePort/MessageChannel、Worker provisioning、Service Worker/OPFS 与安全边界  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[ADR 0026](../../decisions/0026-session-scoped-platform-instance.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[PWA Game Launcher / Worker Subsystem Runner Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-28

本文描述完整 PWA Platform Composition realization，不是 `@loomrealm/platform-pwa` mega-package。`@loomrealm/game-launcher-pwa` 只抽出 Game Entry consumption + Subsystem Runtime launch planning/hosting/Runner integration；Renderer/Data Broker/Content/SW integration 仍由完整 composition负责。

---

## 1. Composition

```text
apps/pwa / product entry
        ↓
create session-scoped PwaPlatform
        ↓
PwaPlatform.prepareGame(installation/source)
        ↓
@loomrealm/game-launcher-pwa PREPARE component
    ├── @loomrealm/game-package validates Game Entry
    ├── validates launch.pwa.json
    ├── exact key-set join
    ├── full installation/origin/security preflight
    ├── immutable PwaLaunchPlan → installed privately in PwaPlatform
    └── immutable LogicalGameBootstrap → returned to composition
        ↓
runMain({ bootstrap: logicalBootstrap, platform: same PwaPlatform })
        ↓
PwaPlatform
├── Main-facing RuntimeHosting / scheduler
├── Worker RuntimeHosting / Supervision
├── Host-owned Worker Subsystem Runner
├── Runtime Control MessagePort
├── Worker Platform Provisioning path
├── browser Window Renderer
├── Renderer Control MessagePort
├── DataConnectionBroker / MessageChannel transfer
└── Fetch + Service Worker / OPFS Content
```

`apps/pwa` MUST NOT duplicate Game Package schema validation or PWA manifest/join semantics。

Window/Worker/Port/Service Worker 只负责 physical realization，不拥有 Frame/Activation/InputTarget/DataAuthority/Render authority。

---

## 2. PWA PREPARE

Product bootstrap caller 调 `PwaPlatform.prepareGame(...)`；PwaPlatform 内部调用 PWA Launcher component，而不是让 product caller：

```text
parse Game Entry manually
→ pass ValidatedGameEntryV1 manually
→ call PWA planner
```

PWA Launcher内部：

```text
obtain Game Entry
→ @loomrealm/game-package validate
→ validate launch.pwa.json
→ exact Game↔PWA key-set join
→ validate all module logical paths
→ resolve through selected Installation Registry
→ enforce same-origin/trusted-installation policy
→ validate Worker/MessageChannel/Runner capability
→ freeze PwaLaunchPlan
→ project LogicalGameBootstrap
```

Any PREPARE failure：

```text
Worker create = 0
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
    structurally satisfied by the same prepared PwaPlatform instance
```

Main does not receive：

```text
GameEntryV1 / ValidatedGameEntryV1
formatVersion
launch.pwa.json
PwaLaunchPlan
module/moduleUrl
Worker/Runner/Port details
```

`PwaPlatform` 持有 frozen PwaLaunchPlan；`apps/pwa` 只负责编排 `prepareGame()` 与 `runMain()`，MUST NOT re-interpret raw config。Main 不读取 PwaLaunchPlan。

---

## 4. Worker Runner

PWA physical entry：

```text
Dedicated Worker entry = Host-owned Worker Runner
```

Business module：

```text
PwaLaunchPlan[key].module
    = selected-installation executable .mjs
```

Runner：

```text
receive/validate Platform bootstrap
→ verify subsystemKey + planned binding
→ resolve/import exact planned module
→ validate default SubsystemDefinitionFactory
→ construct RuntimeControlBinding
→ M8+ construct SubsystemDataBinding
→ M12+ construct ContentClient
→ runSubsystem(...) with current-milestone capabilities
```

Business module不得创建 Worker、寻找 bootstrap Port、读取 launch manifest或分支 PWA business semantics。

---

## 5. PWA Host Policy

`launch.pwa.json` MAY select installation business artifact，但不得控制：

```text
Host-owned Worker Runner URL/entry
arbitrary Worker constructor options
bootstrap/Runtime Control/Data MessagePort
credential material
CSP/same-origin policy
Service Worker authority
resource/timeouts
```

这些属于 PWA Host deployment/security policy。

---

## 6. Runtime Bootstrap

```text
PwaLaunchPlan already frozen
→ Main creates Launch Attempt/auth for key
→ RuntimeHosting looks up plan[key]
→ create Dedicated Worker running Host-owned Runner
→ establish Runner provisioning capability
→ Runner imports exact planned module
→ Runtime Control Port available
→ subsystem.hello
→ identified
→ initialize
→ ready
```

```text
plan valid != Worker created != module loaded != connected != identified != ready
ready != Data Port/offer/current carrier
```

Module import/ABI failure使 required bootstrap失败并统一 cleanup。

---

## 7. Runtime Control MessagePort

```text
postMessage(string)
= one UTF-8 JSON text JSON-RPC message
```

Structured Clone 只用于 Platform bootstrap/Port transfer，不形成第二 application value model。

Control loss / unexpected Worker termination属于 Runtime failure；same-attempt Control reconnect不存在。

---

## 8. Renderer Hosting / Control

```text
Main Renderer intent
→ current browser Window/Web application
→ Renderer Control MessagePort
→ renderer.hello
→ full current Authority Snapshot
```

Snapshot only logical：

```text
Runtime / Stack / Activation / InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

不携 Data MessagePort、transfer object、credential、PwaLaunchPlan/module URL、Game Entry material。

---

## 9. DataConnectionBroker

```text
DataAuthority(S,G,P)
→ PWA Broker
→ create MessageChannel
→ bind endpoints to S/G/P
→ transfer Renderer endpoint
→ transfer Subsystem endpoint through Worker provisioning
→ RendererDataBinding / SubsystemDataBinding
```

Current `P = loomrealm.renderer-data/1`。

Broker不拥有 generation/profile。Profile change必须 fresh generation。

---

## 10. Worker Platform Provisioning Path

Worker Runner MUST have a path distinct from Runtime Control/Data carrier，typically Host-owned provisioning MessagePort。

MAY carry：

```text
fresh Data endpoint for current S/G/P
revoke/supersede old physical material
```

It is not Subsystem Control、Frame、Renderer Control、Renderer Data application carrier、business RPC、Game/PWA manifest update channel。

---

## 11. Data Installation / Reconnect

Runner receives current Data offer：

```text
validate own subsystem + generation + dataProfile
→ accept transferred MessagePort
→ wrap MessageCarrier
→ SubsystemDataBinding yields {G,P,carrier}
→ SDK DataPlane installs current
```

Data carrier：

```text
postMessage(string)
= one UTF-8 JSON text child-protocol object
```

Same S/G/P may sequentially reconnect using fresh MessageChannel；stale/duplicate endpoint cannot become current。

---

## 12. Provisioning Failure Domain

```text
MessageChannel creation failure
Port transfer/installation failure
provisioning Port loss
same-generation reconnect failure
```

本身：

```text
!= Runtime failure
!= Frame unwind
!= DataAuthority mutation
```

Runtime Control loss / Worker unexpected termination remains Runtime failure domain。

---

## 13. Data Profile / Input / Render

Renderer Data Profile v1：

```text
Connection v1 + User Input v1 + Render Update v1
```

One Data dispatcher demux `input.*` / `render.*`。

Fresh carrier：

```text
Input registry/state empty → republish/rebaseline
Render current Registry → fresh Snapshot each Domain → Patch/Event
```

Frame/Data/Render lifecycles独立。

---

## 14. Content

```text
same-origin Fetch
Service Worker
OPFS / Cache Storage
```

只实现 Content API logical semantics。

Definition Module executable loading属于 trusted Launcher/Runner capability，不通过 ordinary Content API给业务 arbitrary executable access。

---

## 15. Composition Root

Current：

```text
apps/pwa
```

MAY combine：

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/game-launcher-pwa
@loomrealm/transport-messageport
@loomrealm/content-service-worker
PWA Renderer/Data Broker integration
business artifacts
```

`apps/pwa` 可以依赖 launcher；Main/business不得反向依赖。

---

## 16. Cross-platform Equivalence

Hostra/PWA share：

```text
same Game Entry logical topology
same resulting LogicalGameBootstrap semantics
same subsystem keys
same Subsystem Definition ABI
same logical scenario/business expectations
same formal application semantics
```

允许各自 launch manifest/artifact不同。

Compare logical Runtime/Frame/Renderer/Data/Input/Render/Content/business results，不比较 module path/bytes、PID/Worker id、IPC/Port、WS/MessagePort 等 physical trace。

---

## 17. Tests

```text
PWA launcher owns Game Entry validation step
apps/pwa does not duplicate Game schema/join logic
valid/invalid PWA manifest
exact Game↔PWA key-set join
all modules resolved/security-checked before first Worker creation
PREPARE failure zero Worker/import/Control side effect
logicalBootstrap has no Game document/executable material
Host-owned Worker Runner is constructor entry
Main launch has no module
manifest cannot override Runner/Port/CSP/credential policy
Runtime Control postMessage(string)
created != loaded != connected != identified != ready
ready independent from Data offer
provisioning path distinct from Runtime/Data application protocols
Data transfer binds S/G/P
same-generation fresh MessageChannel
profile change requires fresh generation
provision failure does not fail Runtime/Frame
actual Worker termination → stopped
unexpected termination → Runtime failure
no auto restart
PWA/Hostra abstract-trace equivalence
```

---

## 18. Final Invariants

1. apps/pwa调用 matching PWA Launcher prepare，而不手动调用 Game Package；
2. PWA Launcher内部拥有 common Game validation orchestration；
3. PwaLaunchPlan + LogicalGameBootstrap在 first Worker side effect前完整冻结；
4. Main不接收 GameEntry/module URL/Worker options；
5. business module != Worker entry；
6. Host-owned Worker Runner是 physical entry；
7. PWA manifest不能覆盖 Host Runner/security/credential policy；
8. Runtime Control与 provisioning path独立；
9. Data provisioning/loss不等于 Runtime failure/Frame unwind；
10. Control/Data MessagePort application unit统一 JSON text string；
11. Frame/Data/Render lifecycle独立；
12. PWA/Hostra artifact/physical mechanism可不同，但 logical application semantics等价。
