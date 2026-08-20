# Hostra Game Launcher / Node Subsystem Runner Profile v1

> 层级：正式契约 / Hostra Platform Profile  
> 状态：Active / Normative  
> Profile Version：1  
> 稳定程度：Stabilizing  
> 主要定义：Hostra Platform Launch Manifest、完整 preflight LaunchPlan、Node Runtime Hosting、Host-owned Runner、Runtime Control 与动态 Data provisioning  
> 依赖：[Game Package v1](./game-package-v1.md)、[Subsystem Control v1](./subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](./runtime-control-profile-v1.md)、[Renderer Data Profile v1](./renderer-data-profile-v1.md)  
> 最近复核：2026-08-20

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Game Package 声明 logical Subsystem key；Hostra Launch Manifest 绑定 key → Hostra executable Definition Module；Hostra Launcher 在零 Runtime 副作用的 preflight 中生成 immutable LaunchPlan；Host-owned Node Runner 才是 process entry。**

---

## 1. Scope

```text
Validated Game Entry {key...}
        +
launch.hostra.json
        ↓
Hostra manifest validation
        ↓
exact key-set join
        ↓
resolve all required Hostra modules
        ↓
immutable HostraLaunchPlan
────────────────────────────────
Main launch(subsystemKey)
        ↓
Hostra RuntimeHosting lookup plan
        ↓
Launch Attempt / token
        ↓
spawn Host-owned Node Runner
        ↓
Runner imports selected Definition Module
        ↓
Runtime Control bootstrap / supervision
```

```text
preflight valid
!= process spawned
!= connected
!= identified
!= ready
!= Data Connection exists
```

---

## 2. Hostra Launch Manifest

当前 installation 的 Hostra launch document convention：

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

该 manifest 是 **Hostra platform binding**，不是 Game logical topology，也不是普通 business configuration。

---

## 3. Manifest Authority Boundary

Hostra Launch Manifest MAY声明：

```text
subsystem key → package-local Hostra Definition Module
```

它 MUST NOT声明或替换 Host-owned security/deployment policy：

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

这些由 Hostra Host/Launcher implementation拥有。

---

## 4. Key-set Join

Hostra Launch Planner MUST 在任何 process/Runner 创建前验证：

```text
keys(GameEntry.subsystems)
=
keys(HostraLaunchManifest.subsystems)
```

因此：

```text
Game key missing Hostra binding
    → PLATFORM_BINDING_MISSING

Hostra manifest contains undeclared Game key
    → PLATFORM_BINDING_UNDECLARED

duplicate Hostra binding key
    → PLATFORM_LAUNCH_MANIFEST_INVALID
```

Runtime identity始终来自 Game `key`；module path不得成为第二 identity。

---

## 5. Hostra `module`

`module` 是相对于当前 Installation Root 的 Hostra executable logical module path。

它 MUST：

1. 非空；
2. 使用 ASCII 字符；
3. 使用 `/` 作为唯一目录分隔符；
4. 不以 `/` 开头或结尾；
5. 不包含空 segment；
6. 不包含 `.` 或 `..` segment；
7. 不包含 `\\`；
8. 不包含 `:`；
9. 不包含 NUL/control char；
10. UTF-8 长度不超过 512 bytes；
11. 以 `.mjs` 结尾；
12. 每个 segment匹配 `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`。

以下 MUST reject：

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

## 6. Preflight Resolution

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

概念：

```ts
interface ResolvedHostraSubsystemModuleV1 {
  readonly installationId: string;
  readonly subsystemKey: string;
  readonly logicalModule: string;
  readonly physicalModule: string; // host-private
}
```

`physicalModule` MUST NOT进入 Game Entry、Main authority、Renderer、Frame、Render、Data 或普通 business payload。

---

## 7. Immutable HostraLaunchPlan

只有以下全部完成才能冻结 plan：

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

概念：

```ts
interface HostraLaunchPlanV1 {
  readonly installationId: string;
  readonly runtimes: ReadonlyMap<string, ResolvedHostraSubsystemModuleV1>;
}
```

在 plan冻结前：

```text
MUST NOT spawn any business Runtime process
MUST NOT import any business Definition Module
MUST NOT establish Runtime Control
```

Plan冻结后普通 Runtime launch path MUST NOT重新解释 game/platform config；它只按 `subsystemKey`查 frozen plan。

---

## 8. RuntimeHosting Boundary

Main-facing logical request：

```text
launch(subsystemKey, Launch Attempt material)
```

Hostra RuntimeHosting：

```text
lookup subsystemKey in HostraLaunchPlan
→ create process supervision record
→ prepare bootstrap/provisioning capability
→ spawn Host-owned Node Runner
```

Main MUST NOT传入 module/physical path/Node flags。

Hostra RuntimeHosting不拥有：

```text
Frame/Activation/InputTarget
Runtime public ready authority
failure unwind root
Data generation/profile
```

---

## 9. Host-owned Node Runner

唯一 process entry 是 Host-owned trusted Runner：

```text
Host-selected Node
argv = [Host-owned Runner Entry]
shell = false
```

业务 Definition Module绝不是 process argv entry。

Runner：

```text
parse/validate Hostra bootstrap
→ verify subsystemKey / selected module binding
→ import exact resolved Definition Module
→ validate default export SubsystemDefinitionFactory
→ construct RuntimeControlBinding
→ construct SubsystemDataBinding
→ construct ContentClient
→ runSubsystem(...)
```

Runner MUST NOT fallback 到 package main、directory index、CommonJS、另一 module 或 arbitrary user argv。

---

## 10. Definition Module ABI

Hostra selected module MUST：

```text
load as ESM .mjs
have default export
be accepted as SubsystemDefinitionFactory by @loomrealm/subsystem/host
```

Definition Module MUST NOT通过 module-load side effect读取 Hostra bootstrap/token/provisioning channel获得 portable business semantics。

Hostra 与 PWA MAY选择不同 `.mjs` artifact，但两者都遵守同一个 Subsystem Definition Module ABI。

---

## 11. Node Runtime / Environment Policy

Node executable与 Runtime support policy由 Host选择。

Hostra Launch Manifest MUST NOT指定：

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

典型 process semantics：

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

## 12. Launch Attempt / Bootstrap Token

每次 Runtime创建 fresh Launch Attempt：

```text
subsystemKey
launchId (Main/private)
bootstrapToken
selected resolved Hostra module (Platform/private)
```

Token MUST：

```text
high entropy
opaque
bound to Launch Attempt + subsystemKey
registered before Runner executes
one successful subsystem.hello consumption
revoked on abandoned bootstrap
not logged
```

Module binding来自 frozen HostraLaunchPlan，不来自 Main 或业务代码。

---

## 13. Runner Bootstrap Context

Hostra MAY使用 reserved environment/IPC传递 Runner bootstrap。概念 context：

```ts
interface HostraNodeRunnerBootstrapContextV1 {
  readonly version: 1;
  readonly subsystemKey: string;
  readonly subsystemModule: string; // host-private logical/opaque material for Runner
  readonly controlEndpoint: string;
  readonly bootstrapToken: string;
}
```

该 context 是 Platform-internal material，不是 Game Package schema或 application protocol。

MUST NOT包含：

```text
Frame/Activation
Data generation/profile
Renderer Data endpoint/ticket
business initial input
Content bearer
```

---

## 14. Platform Provisioning Channel

每个 Node Runner Process MUST拥有一条与 stdout/stderr、Runtime Control、Data carrier 独立的 Host-owned provisioning capability，典型为 child-process IPC。

用途：

> 在 Runtime 已运行后向 trusted Runner adapter 动态提供/撤销物理基础设施材料。

Phase 1 首个消费者是 Renderer Data Connection provisioning。

它不是：

```text
Subsystem Control
Frame / Call
Renderer Control
Renderer Data application carrier
business RPC
```

其 encoding 属于 Hostra implementation，不形成 LoomRealm application protocol。

---

## 15. Data Provisioning

当 Main current authority 为 `DataAuthority(S,G,P)`：

```text
Hostra DataConnectionBroker
→ Hostra Runner provisioning integration
→ one-time endpoint/ticket for S/G/P
→ target Runner validates own S/G/P
→ Data WebSocket
→ MessageCarrier<string>
→ SubsystemDataBinding yields {G,P,carrier}
```

Broker/Launcher MUST NOT mint generation/profile。

same `S/G/P` reconnect使用 fresh one-time material；stale/duplicate/consumed material不得重新成为 current。

Provisioning failure：

```text
!= Runtime failure
!= Frame unwind
!= DataAuthority mutation
```

---

## 16. Runtime Control / Ready

```text
Runner obtains Control carrier
→ subsystem.hello
→ identified
→ initialize
→ ready
```

```text
spawned != connected != identified != ready
ready != Data offer exists
ready != Data carrier current
```

Control loss按 Runtime Control Profile解释为 Runtime failure；same-attempt Control reconnect不存在。

---

## 17. Supervisor / Termination

Supervisor只报告 physical facts：

```text
process creation success/failure
alive/exited
exit code/signal
termination request/result
```

`stopped` 只来自 actual process termination observation。

无 Main termination intent 的 unexpected exit，包括 code 0，进入 Runtime failure。

v1 MUST NOT automatic restart failed Runtime；新 Runtime = fresh Launch Attempt + token + process/Control lifetime。

---

## 18. Failure Categories

至少：

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

用户错误不得泄露 token/ticket、敏感 env、无必要 physical path/internal stack。

---

## 19. Conformance

至少覆盖：

```text
valid Hostra manifest
closed Hostra manifest schema
missing/duplicate/extra key
exact Game↔Hostra key-set equality
absolute/traversal/url/backslash/module type rejection
safe installation containment
all bindings resolved before first process spawn
no business module import during preflight
Main launch request contains no module
Host-owned runner is argv entry
business module is not argv entry
runner imports exact planned module/default-export ABI
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

## 20. Final Invariants

1. Game Package只声明 logical key；Hostra manifest独立声明 key→Hostra Definition Module；
2. Game/Hostra key set在 Phase 1严格相等；
3. HostraLaunchPlan在任何 business Runtime side effect前完整冻结；
4. Main launch intent只携 logical subsystemKey/Launch Attempt material；
5. module/physical path只存在于 Hostra Platform boundary；
6. Host-owned Node Runner是唯一 process entry；
7. Game manifest不能选择 Node、Runner、argv/env、endpoint或 credential；
8. Definition Module ABI统一，但 Hostra/PWA artifact不要求 byte/path identity；
9. Runtime Control与 Platform provisioning独立；
10. ready不依赖 Data provisioning；
11. Data provisioning failure不等于 Runtime/Frame failure；
12. stopped只来自 actual process termination；
13. no automatic restart；
14. 本 Profile是 current v1直接更新，不存在旧 `{key,module}` Game Descriptor兼容路径。
