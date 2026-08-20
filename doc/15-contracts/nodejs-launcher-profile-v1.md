# Hostra Game Launcher / Node Subsystem Runner Profile v1

> 层级：正式契约 / Hostra Platform Profile  
> 状态：Active / Normative  
> Profile Version：1  
> 稳定程度：Stabilizing  
> 主要定义：Hostra Launcher-owned Game Entry consumption、Hostra Launch Manifest、完整 PREPARE LaunchPlan/LogicalGameBootstrap、Node RuntimeHosting、Host-owned Runner、Runtime Control 与动态 Data provisioning  
> 依赖：[Game Package v1](./game-package-v1.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[Subsystem Control v1](./subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](./runtime-control-profile-v1.md)、[Renderer Data Profile v1](./renderer-data-profile-v1.md)  
> 最近复核：2026-08-20

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Hostra Launcher 是 Hostra Runtime-product Game Entry consumer：它内部使用 `@loomrealm/game-package` 验证 common Game Entry，再与 `launch.hostra.json` 完成 exact join / executable preflight；只有 immutable HostraLaunchPlan + Main-facing LogicalGameBootstrap 同时闭合后，才允许 Runtime side effect。Host-owned Node Runner 才是 process entry。**

---

## 1. Scope

```text
Hostra game source / installation
        ↓
Hostra Launcher PREPARE
    ├── @loomrealm/game-package
    │       parse/validate Game Entry
    ├── launch.hostra.json validation
    ├── exact key-set join
    ├── resolve all Hostra modules
    ├── Hostra hosting/security preflight
    ├── immutable HostraLaunchPlan
    └── immutable LogicalGameBootstrap
        ↓
PreparedHostraGame
        ↓
apps/desktop installs Main
        ↓
Main launch(subsystemKey)
        ↓
plan-bound Hostra RuntimeHosting
        ↓
Host-owned Node Runner
        ↓
selected Definition Module
```

```text
PREPARE valid
!= process spawned
!= module imported
!= connected
!= identified
!= ready
!= Data Connection exists
```

Product application MUST NOT be required to call `@loomrealm/game-package` before invoking Hostra Launcher。

---

## 2. Hostra Launch Manifest

Current installation convention：

```text
launch.hostra.json
```

Normative model：

```ts
interface HostraLaunchManifestV1 {
  readonly formatVersion: 1;
  readonly subsystems: readonly HostraSubsystemBindingV1[];
}

interface HostraSubsystemBindingV1 {
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
      "module": "subsystems/hostra/loom-map/subsystem.mjs"
    },
    {
      "key": "loom.battle",
      "module": "subsystems/hostra/loom-battle/subsystem.mjs"
    }
  ]
}
```

该 manifest 是 Hostra executable binding，不是 Game logical topology，也不是普通 business configuration。

---

## 3. Manifest Authority Boundary

Hostra Launch Manifest MAY 声明：

```text
subsystem key → package-local Hostra Definition Module
```

MUST NOT 声明/替换 Host-owned policy：

```text
Node executable
Host-owned Runner entry
shell
arbitrary argv/flags
NODE_OPTIONS / NODE_PATH
process env injection
Control endpoint
bootstrap token
Data endpoint/ticket
provisioning IPC handle
Supervisor policy
absolute filesystem path
external URL
```

---

## 4. Game Entry Consumption

Hostra Launcher MUST own Runtime-product common Game validation：

```text
obtain Game Entry text/value from Hostra installation/source abstraction
→ @loomrealm/game-package parseGameEntryV1 / validateGameEntryV1 semantics
→ ValidatedGameEntryV1 internal PREPARE fact
```

`ValidatedGameEntryV1` MAY exist inside Launcher implementation but MUST NOT be required as product application input and MUST NOT be passed to Main。

Game Entry acquisition mechanism itself（filesystem/install repository）is Platform/product input plumbing，不改变 Game Package schema authority。

---

## 5. Key-set Join

Before any process/Runner creation：

```text
keys(GameEntry.subsystems)
=
keys(HostraLaunchManifest.subsystems)
```

```text
Game key missing Hostra binding
    → PLATFORM_BINDING_MISSING

Hostra binding for undeclared Game key
    → PLATFORM_BINDING_UNDECLARED

duplicate Hostra binding key
    → PLATFORM_LAUNCH_MANIFEST_INVALID
```

Runtime identity始终来自 logical `key`；module path不得成为第二 identity。

---

## 6. Hostra `module`

`module` 是相对于 trusted Installation Root 的 Hostra executable logical module path。

MUST：

1. non-empty；
2. ASCII；
3. `/` 唯一目录分隔符；
4. 不以 `/` 开头/结尾；
5. 无空 segment；
6. 无 `.` / `..` segment；
7. 无 `\\`；
8. 无 `:`；
9. 无 NUL/control char；
10. UTF-8 length ≤ 512 bytes；
11. `.mjs` suffix；
12. 每 segment 匹配 `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`。

Reject：

```text
../subsystem.mjs
./subsystem.mjs
/subsystem.mjs
C:/game/subsystem.mjs
file:///subsystem.mjs
https://example/subsystem.mjs
foo\\subsystem.mjs
foo//subsystem.mjs
foo/subsystem.js
foo/subsystem.cjs
```

---

## 7. Preflight Resolution

Hostra resolver MUST：

```text
validate logical module syntax
→ resolve under trusted Installation Root
→ reject symlink/junction/reparse escape in path chain
→ require regular file
→ require .mjs
→ canonical containment verification
→ create host-private ResolvedHostraSubsystemModule
```

Conceptual：

```ts
interface ResolvedHostraSubsystemModuleV1 {
  readonly installationId: string;
  readonly subsystemKey: string;
  readonly logicalModule: string;
  readonly physicalModule: string; // host-private
}
```

`physicalModule` MUST NOT enter Game Entry、LogicalGameBootstrap、Main authority、Renderer、Frame、Render、Data 或 business payload。

---

## 8. Immutable HostraLaunchPlan

只有以下全部完成才能 freeze：

```text
Game Entry valid
Hostra manifest valid
exact key-set join valid
all module logical paths valid
all modules safely resolve inside installation
Host-selected Node Runtime available
Host-owned Runner entry available
required Hostra runtime capability available
```

Conceptual：

```ts
interface HostraLaunchPlanV1 {
  readonly installationId: string;
  readonly runtimes: ReadonlyMap<string, ResolvedHostraSubsystemModuleV1>;
}
```

Freeze前：

```text
MUST NOT spawn business Runtime process
MUST NOT import business Definition Module
MUST NOT establish Runtime Control
```

普通 launch path MUST NOT 重新解释 Game Entry/manifest，只按 key lookup frozen plan。

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

Projection MUST preserve exact Game logical semantics and MUST NOT contain：

```text
formatVersion
ValidatedGameEntryV1 brand
module/logicalModule/physicalModule
HostraLaunchPlan
Node/Runner/process material
```

Prepared Hostra result MUST NOT be released for Runtime bootstrap until both plan and logical projection are complete。

---

## 10. RuntimeHosting Boundary

Main-facing request：

```text
launch(subsystemKey, LaunchAttemptMaterial)
```

Hostra RuntimeHosting：

```text
lookup subsystemKey in HostraLaunchPlan
→ create supervision record
→ prepare bootstrap/provisioning capability
→ spawn Host-owned Node Runner
```

Main MUST NOT pass GameEntry/module/physical path/Node flags。

RuntimeHosting不拥有 Frame/Activation/InputTarget/Runtime ready/failure unwind/Data generation/profile authority。

---

## 11. Host-owned Node Runner

唯一 process entry：

```text
Host-selected Node
argv = [Host-owned Runner Entry]
shell = false
```

Business Definition Module 绝不是 process argv entry。

Runner：

```text
parse/validate Hostra bootstrap
→ verify subsystemKey / selected binding
→ import exact resolved Definition Module
→ validate default export SubsystemDefinitionFactory
→ construct RuntimeControlBinding
→ construct SubsystemDataBinding
→ construct ContentClient
→ runSubsystem(...)
```

MUST NOT fallback to package main、directory index、CommonJS、another module 或 arbitrary user argv。

---

## 12. Definition Module ABI

Selected module MUST：

```text
load as ESM .mjs
have default export
be accepted as SubsystemDefinitionFactory by @loomrealm/subsystem/host
```

Hostra/PWA MAY select different `.mjs` artifacts，但都遵守相同 author/host ABI 与 observable semantics。

---

## 13. Node Runtime / Environment Policy

Node executable与 Runtime support policy由 Host选择。

Manifest MUST NOT specify：

```text
Node executable
--require / --loader / --inspect
shell/interpreter
arbitrary argv
NODE_OPTIONS / NODE_PATH
```

Environment：

```text
Host-defined Safe Baseline
+ LoomRealm Reserved Bootstrap Environment
```

不得无条件继承完整 `process.env`。

Typical：

```text
cwd          Installation Root
shell        false
detached     false
stdin        closed/ignored
stdout       bounded diagnostics
stderr       bounded diagnostics
provisioning dedicated Host-owned IPC capability
```

---

## 14. Launch Attempt / Bootstrap Token

Each Runtime creation uses fresh：

```text
subsystemKey
launchId
bootstrapToken
selected resolved module (Platform-private)
```

Token MUST be high-entropy、opaque、bound to Launch Attempt + key、registered before Runner executes、one successful hello consumption、revoked on abandonment、not logged。

---

## 15. Runner Bootstrap Context

Hostra MAY use reserved environment/IPC：

```ts
interface HostraNodeRunnerBootstrapContextV1 {
  readonly version: 1;
  readonly subsystemKey: string;
  readonly subsystemModule: string;
  readonly controlEndpoint: string;
  readonly bootstrapToken: string;
}
```

Platform-internal only。MUST NOT contain：

```text
GameEntryV1 / LogicalGameBootstrap
Frame/Activation
Data generation/profile
Renderer Data endpoint/ticket
business initial input
Content bearer
```

---

## 16. Platform Provisioning Channel

Each Node Runner Process MUST have a Host-owned provisioning capability distinct from stdout/stderr、Runtime Control、Data carrier。

Phase 1 first consumer：Renderer Data provisioning。

It is not Subsystem Control、Frame、Renderer Control、Renderer Data application carrier 或 business RPC。

---

## 17. Data Provisioning

For current `DataAuthority(S,G,P)`：

```text
Hostra DataConnectionBroker
→ Runner provisioning integration
→ one-time endpoint/ticket for S/G/P
→ target Runner validates own S/G/P
→ Data WebSocket
→ MessageCarrier
→ SubsystemDataBinding yields {G,P,carrier}
```

Broker/Launcher MUST NOT mint generation/profile。

same S/G/P reconnect uses fresh one-time material；stale/duplicate/consumed material cannot become current。

Provisioning failure：

```text
!= Runtime failure
!= Frame unwind
!= DataAuthority mutation
```

---

## 18. Runtime Control / Ready

```text
Runner obtains Control carrier
→ subsystem.hello
→ identified
→ initialize
→ ready
```

```text
spawned != connected != identified != ready
ready != Data offer/carrier
```

Control loss按 Runtime Control Profile 进入 Runtime failure；same-attempt Control reconnect不存在。

---

## 19. Supervisor / Termination

Supervisor reports physical facts：

```text
process creation success/failure
alive/exited
exit code/signal
termination request/result
```

`stopped` only from actual process termination observation。

Unexpected exit without Main termination intent—including code 0—enters Runtime failure。

v1 MUST NOT automatic restart。

---

## 20. Failure Categories

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
LAUNCH_RUNTIME_UNAVAILABLE
PROCESS_SPAWN_FAILED
PROCESS_EXITED_DURING_BOOTSTRAP
PROCESS_EXITED_UNEXPECTEDLY
PROCESS_TERMINATION_FAILED
PLATFORM_PROVISIONING_UNAVAILABLE
DATA_PROVISION_INVALID
DATA_ESTABLISHMENT_FAILED
```

User-facing errors MUST NOT leak token/ticket/sensitive env/unnecessary physical path/internal stack。

---

## 21. Conformance

At least：

```text
launcher accepts Game source without manual Game Package caller step
Game Entry validation failures occur inside PREPARE
valid/closed Hostra manifest
missing/duplicate/extra key
exact Game↔Hostra key equality
module syntax/containment/security rejection
all bindings resolved before first process spawn
no business module import during PREPARE
LogicalGameBootstrap contains no document/executable material
Main launch request contains no GameEntry/module
Host-owned Runner is argv entry
Runner imports exact planned module/default-export ABI
Host-selected Node/safe env/shell=false
spawn != connected != identified != ready
ready independent from Data offer
unexpected code-0 exit fails Runtime
no auto restart
provisioning distinct from Control/stdout/Data
stale/duplicate Data material rejected
provision failure does not fail Runtime/Frame
```

---

## 22. Final Invariants

1. Hostra Launcher是 Hostra Runtime-product Game Entry consumer；
2. `@loomrealm/game-package` common validation在 Launcher PREPARE 内完成；
3. Product application不需手动传 `ValidatedGameEntryV1`；
4. Game/Hostra key set严格相等；
5. HostraLaunchPlan + LogicalGameBootstrap 在 first Runtime side effect前完整冻结；
6. Main不接收 Game Entry/module/path；
7. module/physical path只存在于 Hostra Platform boundary；
8. Host-owned Node Runner是唯一 process entry；
9. manifest不能选择 Node/Runner/argv-env/endpoint/credential；
10. Definition Module ABI统一但 artifact不要求跨平台相同；
11. Runtime Control与 Platform provisioning独立；
12. ready不依赖 Data provisioning；
13. Data provisioning failure不等于 Runtime/Frame failure；
14. stopped只来自 actual process termination；
15. no automatic restart；
16. current v1不存在旧 `{key,module}` Game Descriptor compatibility path。
