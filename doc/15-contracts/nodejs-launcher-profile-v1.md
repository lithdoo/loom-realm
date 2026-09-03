# Hostra Game Launcher / Node Subsystem Runner Profile v1

> 层级：正式契约 / Hostra Platform Profile  
> 状态：Active / Normative  
> Profile Version：1  
> M6 Runtime Slice：Frozen / Ready for Implementation  
> M8+ Data / M12+ Content slices：Staged / Stabilizing  
> M6 冻结日期：2026-09-02  
> 依赖：[Game Package v1](./game-package-v1.md)、[Subsystem Control v1](./subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](./runtime-control-profile-v1.md)、[Renderer Data Profile v1](./renderer-data-profile-v1.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Hostra Launcher 是 Hostra Runtime-product Game Entry consumer。它在任何 Subsystem Runtime side effect 前完成 common Game validation、Hostra executable binding、安全 preflight、immutable HostraLaunchPlan 与 LogicalGameBootstrap。Host-owned Node Runner 是唯一 process entry。**

---

## 1. Milestone Applicability

Profile v1 是跨 milestone 累积契约，不要求 M6 创建尚无消费者的未来 capability。

```text
M6
    Game PREPARE
    HostraLaunchPlan
    LogicalGameBootstrap
    Node RuntimeHosting
    Node Runner
    Runtime Control WebSocket
    physical Runtime supervision/termination

M8+
    Runner provisioning capability
    Subsystem Data binding/provisioning

M12+
    ContentClient / Content integration
```

因此：

```text
M6 MUST NOT create dormant provisioning IPC merely for future conformance
M6 Runtime slice conformance != full future Profile v1 capability completion
```

Sections explicitly marked M8+/M12+ do not apply to M6 implementation qualification。

---

## 2. M6 Runtime Product Flow

```text
Hostra installation
        ↓
Hostra Launcher PREPARE
    ├── @loomrealm/game-package
    ├── launch.hostra.json
    ├── exact key-set join
    ├── all module/security preflight
    ├── current trusted Node/Runner preflight
    ├── immutable HostraLaunchPlan
    └── immutable LogicalGameBootstrap
        ↓
PreparedHostraGame
        ↓
session-scoped HostraPlatform installs plan
        ↓
existing Main launch({subsystemKey, bootstrapToken})
        ↓
plan-bound RuntimeHosting
        ↓
attempt-local WS + Host-owned Node Runner
        ↓
selected Definition Module
```

```text
PREPARE valid
!= Runner spawned
!= business module imported
!= connected
!= identified
!= ready
```

Product application MUST NOT be required to call `@loomrealm/game-package` before Hostra Launcher。

---

## 3. Hostra Launch Manifest

Installation convention：

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

The manifest only selects installation-local Hostra business implementation artifacts。

MUST NOT configure/replace Host policy：

```text
Node executable
Runner entry
shell
arbitrary argv/flags
env
NODE_OPTIONS / NODE_PATH
Control endpoint
bootstrap token
Data endpoint/ticket
Content credential
Supervisor policy
absolute path
external URL
```

---

## 4. Game Entry Consumption

Launcher MUST own Runtime-product common Game validation：

```text
read <installationRoot>/game.json
→ @loomrealm/game-package parse/validate
→ internal validated Game fact
```

Validated Game representation MUST NOT be required from product caller and MUST NOT be passed to Main。

M6 Hostra source representation is exactly：

```text
HostraGameSource { installationRoot }
```

No universal cross-platform GameSource abstraction is required by v1。

---

## 5. Exact Key-set Join

Before HostraLaunchPlan construction：

```text
keys(GameEntry.subsystems)
=
keys(HostraLaunchManifest.subsystems)
```

Errors：

```text
Game key missing Hostra binding
    → PLATFORM_BINDING_MISSING

Hostra binding for undeclared Game key
    → PLATFORM_BINDING_UNDECLARED

duplicate Hostra binding key
    → PLATFORM_LAUNCH_MANIFEST_INVALID
```

Ordering MAY differ。Runtime identity always comes from logical key；module path is never a second identity。

---

## 6. Hostra `module` Grammar

`module` is relative to trusted Installation Root and MUST：

1. be non-empty；
2. be ASCII；
3. use `/` as the only directory separator；
4. not start/end with `/`；
5. contain no empty segment；
6. contain no `.` / `..` segment；
7. contain no `\\`；
8. contain no `:`；
9. contain no NUL/control char；
10. have UTF-8 length ≤ 512 bytes；
11. have `.mjs` suffix；
12. each segment matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`。

Reject examples：

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

## 7. Module Resolution and Installation Stability

Launcher MUST：

```text
validate logical module syntax
→ resolve under canonical Installation Root
→ reject symlink/junction/reparse escape in path chain
→ canonical containment verification
→ require regular file
→ require .mjs
→ create host-private resolved module fact
```

Conceptual M6 resolved fact：

```ts
interface ResolvedHostraSubsystemModuleV1 {
  readonly subsystemKey: string;
  readonly logicalModule: string;
  readonly physicalModule: string; // Hostra Platform-private
}
```

`physicalModule` MUST NOT enter Game Entry、LogicalGameBootstrap、Main authority、Renderer、Frame、Data、Render or business payload。

M6 freezes：

> **Prepared installation MUST remain stable for the lifetime of the prepared Platform Session.**

Installation update/replacement/switch requires a new Session + new PREPARE。Live executable mutation/content-addressed executable identity is outside M6。

---

## 8. M6 Node Runtime and Runner Policy

M6 intentionally uses the already-running trusted composition process Node：

```text
Node executable = process.execPath
supported Node  = major >= 20
Runner entry    = package-owned dist/runner/entry.js
```

M6 does not expose arbitrary Node executable selection。

PREPARE MUST statically verify：

```text
process.versions.node major >= 20
process.execPath canonical regular file
POSIX executable access
package-owned Runner entry canonical regular file
```

No Runner/business execution is permitted for this preflight。

Frozen Runner policy：

```ts
interface HostraRunnerPolicyV1 {
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly terminalCleanupDeadlineMs: number;
  readonly terminationGraceMs: number;
}
```

The values MUST satisfy the existing `runSubsystem` policy domain：

```text
helloDeadlineMs             integer in [1, 2_147_483_647]
frameDeadlineMs             integer in [1_000, 300_000]
terminalCleanupDeadlineMs   integer in [1, 300_000]
terminationGraceMs          integer in [1, 2_147_483_647]
```

Hostra PREPARE validates this domain before any Runtime side effect, so a
prepared Runner policy cannot later be rejected by the existing Subsystem host.

M6 Control protocol versions are fixed：

```text
[1]
```

No protocol-version configuration surface is introduced。

Product composition MUST ensure：

```text
terminationGraceMs < Main terminationDeadlineMs
```

---

## 9. Immutable HostraLaunchPlan

Plan MAY freeze only after：

```text
Game Entry valid
Hostra manifest valid
exact key-set join valid
all logical module paths valid
all modules safely resolved
M6 Node runtime supported
package-owned Runner entry available
Runner policy valid
```

Conceptual M6 model：

```ts
interface HostraLaunchPlanV1 {
  readonly canonicalInstallationRoot: string;
  readonly canonicalNodeExecutable: string;
  readonly runnerEntry: string;
  readonly runnerPolicy: HostraRunnerPolicyV1;
  readonly runtimes: readonly ResolvedHostraSubsystemModuleV1[];
}
```

Plan MUST be deeply immutable plain data。A frozen `Map` alone is not an immutable representation because `.set()` remains possible。

Before plan + logical projection are complete：

```text
MUST NOT spawn Subsystem Runner
MUST NOT import Definition Module
MUST NOT establish Runtime Control WS
```

Ordinary launch MUST NOT re-read Game/manifest or re-resolve selected module policy。

---

## 10. LogicalGameBootstrap Projection

M6 Main-facing projection：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

MUST preserve exact Game logical semantics and MUST NOT contain：

```text
formatVersion
validated Game brand/model
module/logicalModule/physicalModule
HostraLaunchPlan
Node/Runner/process material
```

Prepared result MUST NOT be released until both HostraLaunchPlan and LogicalGameBootstrap are complete and immutable。

---

## 11. RuntimeHosting Boundary

Existing M5 platform port remains authoritative：

```text
launch({subsystemKey, bootstrapToken}, signal)
→ HostedRuntime
```

Main MUST NOT pass GameEntry、manifest、module/path、Node flags or Hostra material。

No public `launchId` is required by M6。A Hostra implementation MAY create an internal attempt id for diagnostics, but：

```text
launchId is not Runtime identity
launchId is not protocol material
launchId is not required in RuntimeLaunchRequest
```

RuntimeHosting owns physical creation facts only；it does not own Frame/Activation/InputTarget/Runtime ready/failure unwind authority。

---

## 12. Attempt-local Runtime Establishment

Each launch owns exactly：

```text
one child process
one 127.0.0.1:0 WebSocket listener
one base64url(randomBytes(32)) path capability
one valid accepted Control connection
one single-use MainRuntimeControlBinding.acquire()
one terminal child exit fact
```

WS listener MUST be listening before Runner spawn。

Only exact attempt path may upgrade。Wrong paths MUST be rejected without consuming the valid connection slot。

Transport capability is not authentication：

```text
WS capability != bootstrapToken != Runtime identity
```

MUST NOT add query-token、Authorization or custom transport hello。Existing Runtime Control `subsystemKey + bootstrapToken` owns identification/authentication。

---

## 13. Child Event Ordering and Launch Abort

Frozen creation sequence：

```text
child = spawn(process.execPath, [RunnerEntry], shell=false)
→ synchronously install spawn/error/exit observers
→ only then await spawn-or-error
```

Canonical facts：

```text
spawn event = OS process creation succeeded
exit event  = actual process termination authority
close event = stdio/resource closure diagnostic only
```

If `error` occurs before spawn：

```text
PROCESS_SPAWN_FAILED
```

If child exits before HostedRuntime ownership transfer：

```text
PROCESS_EXITED_DURING_BOOTSTRAP
```

Launch AbortSignal owns the physical attempt only before ownership transfer：

```text
abort while pending
→ mark attempt abandoned first-wins
→ close WS server
→ force-converge any spawned child
→ retain internal exit observation until actual exit
→ never return HostedRuntime
```

Abort cleanup MUST continue even when the outer Main deadline has already rejected its own wait。No abandoned attempt may leave a listener/live child indefinitely。

---

## 14. Runtime Control Binding / Ready

Main-side `runtimeControl.acquire(signal)` is single-use：

```text
first call → wait exact attempt connection → return MessageCarrier
second call → reject
```

Abort before connection closes the listener and rejects acquire。Child exit before acquire rejects acquire。Carrier loss does not permit same-attempt reconnect。

Facts remain distinct：

```text
spawned != connected != identified != ready
```

Hostra RuntimeHosting owns spawned/connected；existing Runtime Control/Main own identified/ready。

---

## 15. Runner Bootstrap Context

M6 uses one reserved environment value：

```text
LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP
```

Normative M6 envelope：

```ts
interface HostraNodeRunnerBootstrapContextV1 {
  readonly version: 1;
  readonly subsystemKey: string;
  readonly physicalModule: string;
  readonly controlEndpoint: string;
  readonly bootstrapToken: string;
  readonly controlProtocolVersions: readonly [1];
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly terminalCleanupDeadlineMs: number;
}
```

Encoded JSON MUST be ≤ 16_384 UTF-8 bytes and closed-validated。

MUST NOT contain：

```text
GameEntryV1 / LogicalGameBootstrap
Frame/Activation
business initial input
Renderer/Data material
Content bearer
```

Runner MUST consume and scrub before business import：

```text
copy encoded value to local variable
→ immediately delete reserved env key from process.env
→ parse/validate/freeze local context
→ only then import business module
```

---

## 16. Safe Runner Environment

M6 parent-env allowlist, copy-if-defined only：

```text
PATH
HOME
USERPROFILE
HOMEDRIVE
HOMEPATH
TMPDIR
TMP
TEMP
SystemRoot
WINDIR
```

plus exactly the reserved bootstrap value。

No other parent env is inherited by default, including：

```text
NODE_OPTIONS
NODE_PATH
npm_*
HOSTRA_RPC_TOKEN
application credentials
arbitrary secrets
```

Game/manifest cannot append env。

---

## 17. Host-owned Node Runner — M6 Slice

Only process entry：

```text
process.execPath <package-owned Runner Entry>
```

```text
shell = false
cwd   = canonical Installation Root
```

Business Definition Module is never argv entry。

M6 Runner sequence：

```text
consume/scrub bootstrap
→ validate bootstrap
→ convert exact physical .mjs to file URL
→ import exact module once
→ require default export
→ accept it as SubsystemDefinitionFactory candidate
→ establish Runtime Control WS MessageCarrier
→ create RuntimeControlBinding + DeadlineScheduler
→ runSubsystem(...)
```

Runner MUST NOT fallback to package main、directory index、CommonJS、alternate module or arbitrary argv。

M6 `runSubsystem` receives Runtime Control capability only。Subsystem Data binding is M8+；Content integration is M12+。

---

## 18. Definition Module ABI

Selected module MUST：

```text
load as ESM .mjs
have default export
be accepted as SubsystemDefinitionFactory by @loomrealm/subsystem/host
```

Different platforms MAY select different artifacts while preserving the same author/host ABI and business-observable semantics。

Runner-local module load/ABI failures MAY use bounded diagnostics and nonzero exit；M6 does not require a second Runner→Parent typed-status protocol。

---

## 19. WebSocket MessageCarrier

M6 WS adapter semantics：

```text
one WS text message = one MessageCarrier string
```

MUST：

```text
reject binary as lost
preserve order
resolve send on local send acceptance only
single logical inbound reader
idempotent close
normal close → {kind:"closed"}
unexpected socket/error → {kind:"lost", cause}
```

MUST NOT parse JSON/JSON-RPC、authenticate Runtime hello、retry、reconnect or own application deadlines。

---

## 20. Physical Termination

`HostedRuntime.terminated` settles only from child `exit` observation。

```text
kill requested           != stopped
Control closed           != stopped
requestTermination done  != stopped
child close event alone  != stopped
child exit               = stopped physical fact
```

`requestTermination(signal)` MUST be idempotent：

```text
first non-aborted request
→ commit normal host termination once
→ install terminationGraceMs force fallback
→ if child exits, cancel fallback
→ if grace expires while alive, force terminate once

subsequent requests
→ join same committed convergence
```

Caller abort before commit rejects without starting a new convergence。Caller abort after commit MUST NOT cancel the already-committed convergence。

POSIX/Windows mechanics MAY differ；observable requirement is bounded physical convergence + actual exit fact。No automatic restart in v1。

---

## 21. M6 Failure Ownership

Parent-observable Hostra failure categories：

```text
PLATFORM_LAUNCH_MANIFEST_INVALID
PLATFORM_BINDING_MISSING
PLATFORM_BINDING_UNDECLARED
SUBSYSTEM_MODULE_INVALID
SUBSYSTEM_MODULE_NOT_FOUND
SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION
PLATFORM_RUNTIME_UNSUPPORTED
LAUNCH_RUNTIME_UNAVAILABLE
PROCESS_SPAWN_FAILED
PROCESS_EXITED_DURING_BOOTSTRAP
PROCESS_TERMINATION_FAILED
```

Runner-local diagnostic categories MAY include：

```text
SUBSYSTEM_MODULE_LOAD_FAILED
SUBSYSTEM_MODULE_ABI_INVALID
bootstrap validation failure
Subsystem host fatal failure
```

After HostedRuntime ownership transfer, unexpected process exit—including code 0 without Main termination intent—is a physical fact consumed by existing Main Runtime failure authority；Hostra Launcher MUST NOT duplicate that state machine。

User-facing material MUST NOT leak bootstrap token、attempt capability、sensitive env、unnecessary physical paths or internal stack。

---

## 22. M8+ Platform Provisioning Slice

**Not applicable to M6.**

When M8 implements Subsystem Data, each Runner will gain a Host-owned provisioning capability distinct from stdout/stderr、Runtime Control and Data carrier。

Conceptual future flow：

```text
Hostra DataConnectionBroker
→ Runner provisioning integration
→ one-time endpoint/ticket for current DataAuthority(S,G,P)
→ target validates own S/G/P
→ Data WebSocket
→ MessageCarrier
→ SubsystemDataBinding
```

Broker/Launcher MUST NOT mint generation/profile。Provisioning failure remains distinct from Runtime/Frame failure unless the owning later contract explicitly says otherwise。

M6 MUST NOT create an unused version of this channel。

---

## 23. M12+ Content Slice

**Not applicable to M6.**

ContentClient/Content bearer integration enters the Runner only when the Content milestone provides a real consumer and contract。M6 bootstrap MUST NOT carry future Content credentials/material。

---

## 24. M6 Conformance

At minimum：

```text
Launcher accepts installation root without manual Game Package caller step
Game Entry validation occurs inside PREPARE
closed Hostra manifest
missing/duplicate/extra key rejection
exact Game↔Hostra key equality
module grammar/containment/security rejection
all module + current Node/Runner static preflight before plan freeze
no Runner/business import/Runtime WS before PREPARE success
LogicalGameBootstrap contains no executable material
Main RuntimeLaunchRequest contains only logical key + bootstrap token
no public launchId requirement
WS listener ready before Runner spawn
child observers installed before awaiting spawn
exit is canonical termination fact
launch abort converges pending physical resources
package-owned Runner is argv entry
Runner scrubs bootstrap env before business import
safe env allowlist
Runtime Control text MessageCarrier
spawn != connected != identified != ready
single-use Control binding / no reconnect
unexpected post-transfer code-0 exit reaches Main Runtime failure
idempotent bounded physical termination
no auto restart
Linux + Windows qualification
actual packed Runner artifact smoke
```

M6 non-conformance includes creating dormant M8+/M12+ capability solely to satisfy future profile text。

---

## 25. Final Invariants

1. Hostra Launcher owns Hostra Runtime-product Game Entry consumption；
2. common Game validation happens inside Launcher PREPARE；
3. Game/Hostra key sets are exactly equal；
4. plan + logical projection freeze before Subsystem Runtime side effects；
5. M6 Node is trusted `process.execPath`, Node major ≥20；
6. Main receives no Game/module/path/Node material；
7. physical module material stays Hostra Platform-private；
8. Host-owned Runner is the only process entry；
9. manifest cannot select Node/Runner/argv/env/endpoint/credential；
10. no public `launchId` is required；
11. Runtime Control transport capability is not Runtime identity/authentication；
12. child `exit` is the sole successful stopped physical fact；
13. launch abort cannot orphan a pending child/listener；
14. physical termination is idempotent and bounded with force fallback；
15. no automatic Runtime restart/reconnect；
16. M6 contains no dormant Data/Content provisioning；
17. M8+/M12+ extend the same Runner boundary only when their real consumers arrive。
