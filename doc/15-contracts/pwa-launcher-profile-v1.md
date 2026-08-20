# PWA Game Launcher / Worker Subsystem Runner Profile v1

> 层级：正式契约 / PWA Platform Profile  
> 状态：Active / Normative  
> Profile Version：1  
> 稳定程度：Stabilizing  
> 主要定义：PWA Launcher-owned Game Entry consumption、PWA Launch Manifest、完整 PREPARE LaunchPlan/LogicalGameBootstrap、Dedicated Worker RuntimeHosting、Host-owned Worker Runner、Runtime Control MessagePort 与动态 Data Port provisioning  
> 依赖：[Game Package v1](./game-package-v1.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[Subsystem Control v1](./subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](./runtime-control-profile-v1.md)、[Renderer Data Profile v1](./renderer-data-profile-v1.md)  
> 最近复核：2026-08-20

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **PWA Launcher 是 PWA Runtime-product Game Entry consumer：它内部使用 `@loomrealm/game-package` 验证 common Game Entry，再与 `launch.pwa.json` 完成 exact join / executable preflight；只有 immutable PwaLaunchPlan + Main-facing LogicalGameBootstrap 同时闭合后，才允许 Worker Runtime side effect。Host-owned Worker Runner 才是 Dedicated Worker entry。**

---

## 1. Scope

```text
PWA game source / installation
        ↓
PWA Launcher PREPARE
    ├── @loomrealm/game-package
    │       parse/validate Game Entry
    ├── launch.pwa.json validation
    ├── exact key-set join
    ├── resolve all PWA modules
    ├── origin/security/capability preflight
    ├── immutable PwaLaunchPlan
    └── immutable LogicalGameBootstrap
        ↓
PreparedPwaGame
        ↓
apps/pwa installs Main
        ↓
Main launch(subsystemKey)
        ↓
plan-bound PWA RuntimeHosting
        ↓
Host-owned Worker Runner
        ↓
selected Definition Module
```

```text
PREPARE valid
!= Worker created
!= module imported
!= connected
!= identified
!= ready
!= Data Connection exists
```

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

该 manifest 是 PWA executable binding，不是 Game logical topology 或普通 business configuration。

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
Service Worker authority
same-origin policy
CSP policy
browser feature flags
```

---

## 4. Game Entry Consumption

PWA Launcher MUST own Runtime-product common Game validation：

```text
obtain Game Entry text/value from PWA installation/source abstraction
→ @loomrealm/game-package parseGameEntryV1 / validateGameEntryV1 semantics
→ ValidatedGameEntryV1 internal PREPARE fact
```

`ValidatedGameEntryV1` MAY exist inside Launcher implementation but MUST NOT be required as product application input and MUST NOT be passed to Main。

Game Entry acquisition mechanism（Fetch/installation registry/OPFS etc.）is Platform/product input plumbing，不改变 Game Package schema authority。

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

`moduleUrl` MUST NOT enter Game Entry、LogicalGameBootstrap、Main、Renderer、Frame、Render、Data 或 business payload。

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
```

Before freeze：

```text
MUST NOT create business Runtime Worker
MUST NOT import business Definition Module
MUST NOT establish Runtime Control
```

普通 launch path只按 `subsystemKey` lookup frozen plan。

---

## 9. LogicalGameBootstrap Projection

Full PREPARE MUST also construct immutable Main-facing logical projection：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

Projection MUST preserve Game logical semantics and MUST NOT contain：

```text
formatVersion
ValidatedGameEntryV1 brand
module/logicalModule/moduleUrl
PwaLaunchPlan
Worker/Port/Runner material
```

Prepared PWA result MUST NOT be released for Runtime bootstrap until plan and logical projection are both complete。

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
→ establish bootstrap/provisioning capability
→ create Dedicated Worker at Host-owned Worker Runner entry
```

Main MUST NOT pass GameEntry/module URL/Worker options/MessagePort。

---

## 11. Host-owned Worker Runner

Dedicated Worker constructor target MUST be Host-owned trusted Worker Runner，不是 game-selected Definition Module。

Runner：

```text
receive/validate Platform bootstrap
→ verify subsystemKey / selected binding
→ import exact resolved Definition Module
→ validate default export SubsystemDefinitionFactory
→ construct RuntimeControlBinding
→ construct SubsystemDataBinding
→ construct ContentClient
→ runSubsystem(...)
```

Definition Module 不自己寻找 bootstrap Port、不读取 manifest、不创建第二 Runtime。

---

## 12. Definition Module ABI

Selected module MUST be `.mjs` ESM with default export accepted as `SubsystemDefinitionFactory` by `@loomrealm/subsystem/host`。

Hostra/PWA MAY choose different artifacts，只要 author-facing behavior、formal protocol outcome 与 cross-platform business semantics 等价。

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
```

Control loss / Worker unexpected termination进入 Runtime failure；same-attempt Control reconnect不存在。

---

## 14. Worker Provisioning Path

Worker Runner MUST have Host-owned provisioning path distinct from Runtime Control/Data carrier，typically dedicated bootstrap/provisioning MessagePort。

It MAY carry：

```text
fresh Data endpoint Port for current S/G/P
revoke/supersede physical material
```

It is not Subsystem Control、Frame、Renderer Control、Renderer Data application carrier、business RPC。

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
```

---

## 16. Worker Supervision / Termination

Supervisor observes：

```text
Worker creation failure
Worker error/termination
Main-requested termination
bounded force termination result
```

`stopped` only from actual Worker termination observation。

Unexpected Worker termination → Runtime failure。

v1 MUST NOT automatic restart；new Runtime = fresh Launch Attempt + Worker + Control lifetime。

---

## 17. Browser / Host Policy

Host-owned PWA policy，MUST NOT be arbitrarily overridden by `launch.pwa.json`：

```text
Worker constructor options
Host-owned Runner URL
CSP/same-origin policy
Service Worker registration
bootstrap/provisioning channel encoding
resource/capacity/timeouts
credential material
```

Platform config只选择 selected installation 内 business implementation artifact。

---

## 18. Failure Categories

At least：

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

User-facing errors MUST NOT leak credentials、Port object、unnecessary resolved URL/internal stack。

---

## 19. Conformance

At least：

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

---

## 20. Final Invariants

1. PWA Launcher是 PWA Runtime-product Game Entry consumer；
2. `@loomrealm/game-package` common validation在 Launcher PREPARE 内完成；
3. Product application不需手动传 `ValidatedGameEntryV1`；
4. Game/PWA key set严格相等；
5. PwaLaunchPlan + LogicalGameBootstrap 在 first Worker side effect前完整冻结；
6. Main不接收 Game Entry/module URL/Worker options；
7. resolved module URL只存在于 PWA boundary；
8. Host-owned Worker Runner是 Dedicated Worker physical entry；
9. Game/PWA manifest不能覆盖 Runner/Port/credential/security policy；
10. Definition Module ABI统一但 artifact不要求跨平台相同；
11. Runtime Control与 provisioning path独立；
12. Data provisioning failure不等于 Runtime/Frame failure；
13. Control/Data MessagePort application unit仍是 JSON text string；
14. stopped只来自 actual Worker termination；
15. no automatic restart；
16. current v1不存在旧 `{key,module}` Game Descriptor compatibility path。
