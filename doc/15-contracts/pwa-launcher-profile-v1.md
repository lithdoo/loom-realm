# PWA Game Launcher / Worker Subsystem Runner Profile v1

> 层级：正式契约 / PWA Platform Profile  
> 状态：Active / Normative  
> Profile Version：1  
> 稳定程度：Stabilizing；Realm State slice pre-implementation / physical profile not frozen / not qualified  
> 主要定义：PWA Launcher-owned Game Entry consumption、PWA Launch Manifest、完整 PREPARE LaunchPlan/Main+Realm State prepared projections、Dedicated Worker RuntimeHosting、Host-owned Worker Runner、Runtime Control MessagePort 与动态 Data Port provisioning  
> 依赖：[Game Package v1](./game-package-v1.md)、[Realm State v1](./realm-state-v1.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[Subsystem Control v1](./subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](./runtime-control-profile-v1.md)、[Renderer Data Profile v1](./renderer-data-profile-v1.md)  
> 最近复核：2026-10-05

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **PWA Launcher 是 PWA Runtime-product Game Entry consumer：它内部使用 `@loomrealm/game-package` 验证 common Game Entry，再与 `launch.pwa.json` 完成 exact join / executable preflight，并分别投影 Main 的 `LogicalGameBootstrap` 与 Realm State 的 `PreparedRealmStateDefinition`。Realm State READY 后才允许 Worker business Runtime side effect。Host-owned Worker Runner 是 Dedicated Worker entry，只安装 Runtime-scoped RealmStateClient，不拥有 RealmStateAuthority。**

Realm State条款同步 future logical/ownership boundary；在 Realm State v1 formal freeze 与独立 PWA State qualification前，不得把现有 PWA Runtime/Data证据解释为 State 已实现。

---

## 1. Scope

```text
PWA game source / installation
        ↓
PWA Launcher PREPARE
    ├── @loomrealm/game-package
    │       parse/validate Game Entry including optional state document
    ├── launch.pwa.json validation
    ├── exact Subsystem key-set join
    ├── resolve all PWA modules
    ├── origin/security/capability preflight
    ├── immutable PwaLaunchPlan
    ├── immutable LogicalGameBootstrap
    └── immutable PreparedRealmStateDefinition
        ↓
PreparedPwaGame
        ↓
Session composition installs plan
→ construct RealmStateAuthority from prepared State
→ optional validated Load current overrides
→ Realm State READY
        ↓
apps/pwa installs Main
        ↓
Main launch(subsystemKey)
        ↓
plan-bound PWA RuntimeHosting
        ↓
Host-owned Worker Runner
→ install Runtime-scoped RealmStateClient
        ↓
selected Definition Module
```

```text
PREPARE valid
!= Realm State READY
!= Worker created
!= module imported
!= connected
!= identified
!= ready
!= Data Connection exists
```

Business Worker side effect requires PREPARE complete + Realm State READY once the Realm State slice is implemented。

Product application MUST NOT be required to call `@loomrealm/game-package` before invoking PWA Launcher。

---

## 2. PWA Launch Manifest

Current installation convention：

```text
launch.pwa.json
```

Normative model：

```ts
interface PwaLaunchManifestV1 {
  readonly formatVersion: 1;
  readonly subsystems: readonly PwaSubsystemBindingV1[];
}

interface PwaSubsystemBindingV1 {
  readonly key: string;
  readonly module: string;
}
```

示例：

```json
{
  "formatVersion": 1,
  "subsystems": [
    {
      "key": "loom.map",
      "module": "subsystems/pwa/loom-map/subsystem.mjs"
    },
    {
      "key": "loom.battle",
      "module": "subsystems/pwa/loom-battle/subsystem.mjs"
    }
  ]
}
```

该 manifest 是 PWA executable binding，不是 Game logical topology、Realm State Record declaration 或普通 business configuration。

---

## 3. Manifest Authority Boundary

PWA Launch Manifest MAY 声明：

```text
subsystem key → selected-installation PWA Definition Module
```

MUST NOT 声明/替换 Host-owned policy：

```text
Worker Runner entry
arbitrary Worker constructor URL/options
external module URL
Worker credentials
bootstrap MessagePort
Runtime Control Port
Data MessagePort
Realm State endpoint/Port/credential/persistence policy
Service Worker authority
same-origin policy
CSP policy
browser feature flags
```

Realm State namespace/key/value MUST remain Game Package/business facts，不得进入 PWA manifest成为 physical binding配置。

---

## 4. Game Entry Consumption / Prepared Projection

PWA Launcher MUST own Runtime-product common Game validation：

```text
obtain Game Entry text/value from PWA installation/source abstraction
→ @loomrealm/game-package parseGameEntryV1 / validateGameEntryV1 semantics
→ ValidatedGameEntryV1 internal PREPARE fact
```

`ValidatedGameEntryV1` MAY exist inside Launcher implementation but MUST NOT be required as product application input and MUST NOT be passed to Main。

Game Entry acquisition mechanism（Fetch/installation registry/OPFS etc.）is Platform/product input plumbing，不改变 Game Package schema authority。

Launcher owns two logical projections：

```text
ValidatedGameEntryV1.initial/subsystems
    → LogicalGameBootstrap

ValidatedGameEntryV1.state
    → PreparedRealmStateDefinition
```

`RealmStateGameDefinitionV1` is a Game Package document type and MUST NOT be passed directly to RealmStateAuthority as runtime bootstrap ABI。Prepared State MUST be detached/immutable/platform-neutral。

---

## 5. Key-set Join

Before any Worker creation：

```text
keys(GameEntry.subsystems)
=
keys(PwaLaunchManifest.subsystems)
```

Missing/extra/duplicate binding MUST fail closed in PREPARE。

Runtime identity始终是 Game `key`；Worker id、module URL/path不得成为第二 identity。

Realm State Record identities不参与 executable key-set join。

---

## 6. PWA `module`

Manifest `module` 是 selected installation namespace 内 executable logical module path，不是 arbitrary network URL。

MUST：

1. non-empty；
2. ASCII；
3. `/` separator；
4. 不以 `/` 开始/结束；
5. 无空、`.`、`..` segment；
6. 无 `\\`、`:`、NUL/control char；
7. UTF-8 length ≤ 512 bytes；
8. `.mjs` suffix；
9. 每 segment匹配 `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`。

Reject：

```text
../subsystem.mjs
/subsystem.mjs
https://example/subsystem.mjs
blob:https://...
file:///...
foo\\subsystem.mjs
foo/subsystem.js
```

---

## 7. PWA Resolution

Resolver MUST：

```text
validate logical path
→ resolve through current validated installation registry
→ require module belongs to selected installation
→ require same-origin / trusted-installation execution policy
→ reject arbitrary external URL substitution
→ create host-private ResolvedPwaSubsystemModule
```

Conceptual：

```ts
interface ResolvedPwaSubsystemModuleV1 {
  readonly installationId: string;
  readonly subsystemKey: string;
  readonly logicalModule: string;
  readonly moduleUrl: string; // host-private
}
```

`moduleUrl` MUST NOT enter Game Entry、LogicalGameBootstrap、PreparedRealmStateDefinition、Main、Realm State values、Renderer、Frame、Render、Data 或 business payload。

---

## 8. Immutable PwaLaunchPlan

Freeze only after：

```text
Game Entry valid
PWA manifest valid
exact key-set join valid
all logical modules valid
all modules resolve to selected installation
Host-owned Worker Runner entry available
required Worker/MessageChannel capabilities available
current security policy permits execution
LogicalGameBootstrap projected
PreparedRealmStateDefinition projected
```

Before freeze：

```text
MUST NOT create business Runtime Worker
MUST NOT import business Definition Module
MUST NOT establish Runtime Control
```

普通 launch path只按 `subsystemKey` lookup frozen plan。

---

## 9. Main / Realm State Prepared Projections

Main-facing logical projection：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

Realm State sibling projection：

```ts
interface PreparedLogicalGame {
  readonly main: LogicalGameBootstrap;
  readonly state: PreparedRealmStateDefinition;
}
```

`LogicalGameBootstrap` MUST preserve Game logical semantics and MUST NOT contain：

```text
formatVersion
ValidatedGameEntryV1 brand
Realm State Records
module/logicalModule/moduleUrl
PwaLaunchPlan
Worker/Port/Runner material
```

`PreparedRealmStateDefinition` MUST contain only Realm State prepared baseline facts and MUST NOT contain：

```text
Game Package formatVersion/document brand
PwaLaunchPlan/module/moduleUrl
Runtime revision/version
Frame/Activation/InputTarget
```

Prepared PWA result MUST NOT be released until plan + both projections are complete/immutable。

Realm State physical binding profile is separately pending；prepared projection MUST NOT prematurely require MessagePort or another universal transport。

---

## 10. RuntimeHosting Boundary

Main-facing request：

```text
launch(subsystemKey, LaunchAttemptMaterial)
```

PWA RuntimeHosting：

```text
lookup subsystemKey in PwaLaunchPlan
→ create Worker supervision record
→ establish Runtime Control/provisioning capability
→ create Dedicated Worker at Host-owned Worker Runner entry
```

Main MUST NOT pass GameEntry、PreparedRealmStateDefinition、Realm State values/revision、module URL、Worker options或 MessagePort。

RuntimeHosting owns physical Worker facts；it does not own Frame/Activation/InputTarget、Realm State OCC、Authority revision或 Session terminal policy。

---

## 11. Host-owned Worker Runner

Dedicated Worker constructor target MUST be Host-owned trusted Worker Runner，不是 game-selected Definition Module。

Runner：

```text
receive/validate Platform bootstrap
→ verify subsystemKey / selected binding
→ obtain composition-owned Runtime-scoped RealmStateClient binding when Realm State slice is enabled
→ import exact resolved Definition Module
→ validate default export SubsystemDefinitionFactory
→ construct RuntimeControlBinding
→ construct SubsystemDataBinding
→ construct ContentClient
→ install RealmStateClient into @loomrealm/subsystem/host scope
→ runSubsystem(...)
```

Definition Module 不自己寻找 bootstrap Port、不读取 manifest/Game State document、不创建第二 Runtime/RealmStateAuthority。

Runner MUST NOT require Frame/Activation to authorize `state.commit()` and MUST NOT interpret State binding loss as Main Runtime/Session failure by itself。

---

## 12. Definition Module ABI

Selected module MUST be `.mjs` ESM with default export accepted as `SubsystemDefinitionFactory` by `@loomrealm/subsystem/host`。

Hostra/PWA MAY choose different artifacts，只要 author-facing behavior、formal protocol outcome 与 cross-platform business semantics 等价。

Realm State author surface, when implemented, is `scope.state` from `@loomrealm/subsystem`; Definition Module MUST NOT import Authority/Launcher/physical binding internals。

---

## 13. Runtime Control MessagePort

PWA Host creates/provides Runtime Control MessagePort binding。

Application carrier：

```text
postMessage(string)
= one UTF-8 JSON text string
= one JSON-RPC message
```

Structured Clone only for Platform bootstrap/Port transfer。

```text
Worker created != connected != identified != ready
ready != Data Port exists
ready != Realm State authority created
```

Realm State READY is a sibling Session bootstrap prerequisite that already exists before business Worker side effect；it is not derived from Control ready。

Control loss / Worker unexpected termination进入 Main-owned Runtime failure；same-attempt Control reconnect不存在。

Realm State requests MUST NOT be multiplexed into Runtime Control RPC merely because both may use MessagePort primitives。

---

## 14. Worker Provisioning Path

Worker Runner MUST have Host-owned Data provisioning path distinct from Runtime Control/Data application carrier，typically dedicated bootstrap/provisioning MessagePort。

It MAY carry：

```text
fresh Data endpoint Port for current S/G/P
revoke/supersede physical Data material
```

It is not Subsystem Control、Frame、Renderer Control、Renderer Data application carrier、Realm State protocol、business RPC。

Realm State physical binding MAY later use same-Worker direct object semantics or a separate private MessagePort/binding；this profile intentionally does not force it through Data provisioning。

---

## 15. Data Provisioning

For current `DataAuthority(S,G,P)`：

```text
PWA DataConnectionBroker
→ create MessageChannel
→ bind endpoints to current Session/Renderer/S/G/P
→ transfer one endpoint to Renderer
→ transfer one endpoint through Worker provisioning path
→ Runner validates own S/G/P
→ MessageCarrier
→ SubsystemDataBinding yields {G,P,carrier}
```

Broker/Launcher MUST NOT mint generation/profile。

same S/G/P reconnect uses fresh MessageChannel；stale/duplicate transferred Port cannot become current。

Transfer/install failure：

```text
!= Runtime failure
!= Frame unwind
!= DataAuthority mutation
!= Realm State reset/client replacement
```

Realm State Record identity/revision/version MUST NOT use Data generation/profile。

---

## 16. Realm State Binding / Failure Boundary

Realm State logical flow：

```text
PREPARE projects PreparedRealmStateDefinition
→ Session composition constructs one RealmStateAuthority
→ optional validated Load current seed
→ Realm State READY
→ create Runtime-scoped RealmStateClient binding
→ Worker Runner installs client before business Definition observes scope
```

Physical placement MAY be：

```text
RealmStateAuthority + Main in same Worker
RealmStateAuthority in another trusted Worker
private MessagePort/binding between authority and Runtime Worker
other bounded PWA-private realization
```

This profile MUST NOT require physical symmetry with Hostra。

Realm State binding loss：

```text
→ affected old State binding/client terminal according to State profile
→ old subscriptions terminal(binding-terminal)
→ no automatic Runtime failure
→ no Frame unwind
→ no Session terminal
→ no RealmStateAuthority reset
→ no transparent old-client reattach
```

If a physical profile later supports recovery：

```text
fresh logical RealmStateClient binding
→ fresh subscribe
→ fresh baseline
```

RealmStateAuthority fatal：

```text
→ report Session-fatal condition
→ Main / Session lifecycle owner commits Session terminal/unwind
→ PWA composition performs physical cleanup
```

State subscription listener delivery MUST occur outside Authority serialized lane；sync throw/rejected thenable remains Runtime-local, and callback reentrancy MUST NOT deadlock Authority。

---

## 17. Worker Supervision / Termination

Supervisor observes：

```text
Worker creation failure
Worker error/termination
Main-requested termination
bounded force termination result
```

`stopped` only from actual Worker termination observation。

Unexpected Worker termination → Runtime failure through Main-owned owner chain。

Realm State binding loss alone MUST NOT terminate the Worker。RealmStateAuthority fatal only becomes product termination after Main/Session lifecycle owner commits Session terminal。

v1 MUST NOT automatic restart；new Runtime = fresh Launch Attempt + Worker + Control lifetime + fresh Runtime-scoped State client binding。

---

## 18. Browser / Host Policy

Host-owned PWA policy，MUST NOT be arbitrarily overridden by `launch.pwa.json`：

```text
Worker constructor options
Host-owned Runner URL
CSP/same-origin policy
Service Worker registration
bootstrap/provisioning channel encoding
Realm State physical binding/credential/persistence policy
resource/capacity/timeouts
credential material
```

Platform config只选择 selected installation 内 business implementation artifact。

Session/PWA composition MAY physically construct/wire Main + RealmStateAuthority，但 MUST NOT interpret Frame/Activation or Realm State business values, and MUST NOT become a generic SessionCoordinator/StateManager authority。

---

## 19. Failure Categories / Ownership

At least current platform categories：

```text
PLATFORM_LAUNCH_MANIFEST_INVALID
PLATFORM_BINDING_MISSING
PLATFORM_BINDING_UNDECLARED
SUBSYSTEM_MODULE_INVALID
SUBSYSTEM_MODULE_NOT_FOUND
SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION
SUBSYSTEM_MODULE_LOAD_FAILED
SUBSYSTEM_MODULE_ABI_INVALID
PLATFORM_RUNTIME_UNSUPPORTED
WORKER_CREATE_FAILED
WORKER_EXITED_DURING_BOOTSTRAP
WORKER_EXITED_UNEXPECTEDLY
PLATFORM_PROVISIONING_UNAVAILABLE
DATA_PROVISION_INVALID
DATA_ESTABLISHMENT_FAILED
```

Realm State error/evidence categories remain owned by Realm State contract：

```text
INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT
    caller-visible State result

OUTCOME_UNKNOWN
    caller reconciliation, no auto retry

subscription listener failure
    Runtime-local containment

State binding loss
    State binding/client terminal only

RealmStateAuthority fatal
    Session-fatal report to Main/Session owner
```

PWA Launcher/Runner/transport MUST NOT reinterpret these as a second Runtime/Session failure state machine。

User-facing errors MUST NOT leak credentials、Port object、Realm State private binding material、unnecessary resolved URL/internal stack。

---

## 20. Conformance

Existing PWA Runtime/Data qualification at least：

```text
launcher accepts Game source without manual Game Package caller step
Game Entry validation failures occur inside PREPARE
valid/closed PWA manifest
missing/duplicate/extra key
exact Game↔PWA key equality
module syntax/external-url/origin/install rejection
all bindings resolved before first Worker creation
no business module import during PREPARE
LogicalGameBootstrap contains no document/executable material
Main launch request contains no GameEntry/module
Host-owned Worker Runner is constructor entry
Runner imports exact planned Definition Module
Runtime Control postMessage(string)
created != connected != identified != ready
ready independent from Data offer
Worker provisioning distinct from Control/Data application protocols
Data Port binds own S/G/P
stale/duplicate Port rejected
same S/G/P fresh MessageChannel reconnect
provision failure does not fail Runtime/Frame
unexpected Worker termination fails Runtime
no automatic restart
```

Realm State slice requires separate qualification after formal/physical freeze：

```text
Game State document → PreparedRealmStateDefinition projection
Prepared State contains no PWA module/Port material
Realm State READY before first business Worker side effect
Main launch request contains no State material
Runner installs Runtime-scoped client but owns no Authority
state.commit has no Frame/Activation dependency
State does not use Renderer Data generation/currentness
State binding loss does not fail Runtime/Session
Authority fatal report reaches Main/Session owner
listener failure/reentrancy isolation
fresh logical binding/subscription/baseline recovery if supported
```

Historical PWA Runtime/Data evidence MUST NOT be cited as proof of Realm State implementation/qualification。

---

## 21. Final Invariants

1. PWA Launcher是 PWA Runtime-product Game Entry consumer；
2. `@loomrealm/game-package` common validation including optional State document在 Launcher PREPARE 内完成；
3. Product application不需手动传 `ValidatedGameEntryV1`；
4. Game/PWA Subsystem key set严格相等；Realm State keys不参与 executable join；
5. PwaLaunchPlan + LogicalGameBootstrap + PreparedRealmStateDefinition 在 first business Worker side effect前完整冻结；
6. Game Package State document不是 RealmStateAuthority bootstrap ABI；
7. Realm State READY在 business Worker side effect前成立；
8. Main不接收 Game Entry/Prepared State/module URL/Worker options/Realm State value/revision；
9. resolved module URL只存在于 PWA boundary；
10. Host-owned Worker Runner是 Dedicated Worker physical entry；Runner只安装 RealmStateClient，不拥有 Authority；
11. Game/PWA manifest不能覆盖 Runner/Port/credential/security/Realm State physical policy；
12. Definition Module ABI统一但 artifact不要求跨平台相同；
13. Runtime Control、Data provisioning、Realm State logical plane保持独立；
14. Realm State operations不依赖 Frame/Activation/InputTarget；
15. Data provisioning failure不等于 Runtime/Frame/Realm State failure；
16. Realm State binding loss不等于 Runtime/Session failure；Authority fatal只报告 Main/Session owner；
17. Control/Data MessagePort application unit仍是 JSON text string；Realm State physical encoding/profile尚未因此冻结；
18. stopped只来自 actual Worker termination；State binding loss不是 stopped事实；
19. no automatic Runtime restart；Realm State old client/subscription也不 transparent reattach；
20. Session/PWA composition只拥有 physical construction/binding/disposal，不成为第三 application authority；
21. current v1不存在旧 `{key,module}` Game Descriptor compatibility path。
