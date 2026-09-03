# `@loomrealm/game-launcher-hostra` M6 实现

> 状态：Implemented / Qualified Baseline
> 资格日期：2026-09-03
> 资格运行：GitHub Actions `33705805220`（Ubuntu / Windows，Node 20 / 24）
> 冻结日期：2026-09-02  
> 阶段：M6 Hostra Platform Vertical  
> 规范优先级：正式 Hostra Launcher Profile > `DESIGN.md` > 本实现文档。三者的 M6 Runtime slice 必须保持一致；若真实实现/qualification 证明契约不足，先 reopen 文档，不通过补丁扩张边界。

核心原则：

> **M6 只把 M5 fake physical Platform 替换成真实 Node process + WebSocket；既有 Main / Runtime Control / Subsystem application semantics 不改变。**

---

## 1. Closure Target

```text
Hostra Game installation
→ deterministic PREPARE
→ immutable LogicalGameBootstrap + private HostraLaunchPlan
→ existing @loomrealm/main
→ existing RuntimeHosting port
→ one attempt-local Node Runner
→ one attempt-local WebSocket MessageCarrier<string>
→ existing @loomrealm/runtime-control
→ existing @loomrealm/subsystem/host
→ exact planned Definition Module
→ Frame outcome
→ bounded physical termination
→ actual child exit
```

M6 不实现：

```text
Renderer Control
Renderer/Data Broker
Subsystem Data provisioning
Input / Render
Content
PWA
Hostra BrowserWindow integration
Hostra Shell RPC abstraction
```

M8+ 才增加 Data provisioning；M12+ 才增加 Content integration。M6 MUST NOT 预建 dormant provisioning channel 或未来 capability placeholder。

---

## 2. Ownership and Package Boundary

```text
Hostra Electron Main
    owns outer desktop shell / BrowserWindow / Host lifecycle
        │
        └── HOSTRA_SUBCMD
                ↓
          LoomRealm desktop composition process
                │
                ├── Main
                ├── session-scoped HostraPlatform composition object
                └── @loomrealm/game-launcher-hostra
                        └── Node Runner child processes
```

本 package owns：

```text
Hostra Game PREPARE
launch.hostra.json validation
Game ↔ Hostra exact key join
module/path security preflight
immutable HostraLaunchPlan
LogicalGameBootstrap projection
RuntimeHosting physical realization
package-owned Node Runner
Runtime Control WS MessageCarrier
physical process convergence
```

本 package does not own：

```text
Hostra outer Host lifecycle
Main Runtime/Frame authority
Runtime Control protocol semantics
Runtime identity/authentication authority
Renderer/Data/Content semantics
business behavior
```

MUST NOT：

```text
call Hostra RPC to create Subsystem Runtime
make Hostra own LoomRealm Launch Attempt
mirror Hostra lifecycle events into Main Runtime authority
let Main receive Game/manifest/module/path
let Runner re-read Game/manifest
```

M6 只实质开发此 package；不新增：

```text
@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/platform-hostra
@loomrealm/process-supervisor
@loomrealm/hostra-runtime
```

---

## 3. Frozen Package Shape

```text
packages/game-launcher-hostra/
├─ DESIGN.md
├─ IMPLEMENTATION.md
├─ package.json
├─ tsconfig.json
├─ src/
│  ├─ index.ts
│  ├─ errors.ts
│  ├─ manifest.ts
│  ├─ module-resolver.ts
│  ├─ launch-plan.ts
│  ├─ prepare.ts
│  ├─ websocket-carrier.ts
│  ├─ runtime-hosting.ts
│  └─ runner/
│     ├─ bootstrap.ts
│     └─ entry.ts
└─ test/
   ├─ prepare.test.mjs
   ├─ websocket-carrier.test.mjs
   ├─ runtime-hosting.test.mjs
   └─ e2e.test.mjs
```

允许实现时合并非常小的 internal helper 文件；不得以“文件过长”为理由引入 Manager / Supervisor / Registry / EventBus class。

M6 direct dependencies：

```text
@loomrealm/game-package
@loomrealm/foundation
@loomrealm/platform-ports
@loomrealm/subsystem
@loomrealm/wire
ws
```

`@loomrealm/runtime-control` 由现有 `@loomrealm/subsystem/host` 消费；WS adapter 本身不解析 Runtime Control。

---

## 4. Frozen Public / Integration Surface

```ts
import type { RuntimeHosting } from "@loomrealm/platform-ports";
import type { JsonValue } from "@loomrealm/wire";

export interface HostraGameSource {
  readonly installationRoot: string;
}

export interface HostraRunnerPolicy {
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly terminalCleanupDeadlineMs: number;
  readonly terminationGraceMs: number;
}

export interface HostraResolvedRuntime {
  readonly subsystemKey: string;
  readonly logicalModule: string;
  readonly physicalModule: string;
}

export interface HostraLaunchPlan {
  readonly canonicalInstallationRoot: string;
  readonly canonicalNodeExecutable: string;
  readonly runnerEntry: string;
  readonly runnerPolicy: HostraRunnerPolicy;
  readonly runtimes: readonly HostraResolvedRuntime[];
}

export interface PreparedHostraGame {
  readonly logicalBootstrap: {
    readonly subsystemKeys: readonly string[];
    readonly initial: {
      readonly subsystemKey: string;
      readonly input: JsonValue;
    };
  };
  readonly launchPlan: HostraLaunchPlan;
}

export interface HostraPrepareOptions {
  readonly source: HostraGameSource;
  readonly runnerPolicy: HostraRunnerPolicy;
}

export async function prepareHostraGame(
  options: HostraPrepareOptions,
): Promise<PreparedHostraGame>;

export function createHostraRuntimeHosting(options: {
  readonly launchPlan: HostraLaunchPlan;
}): RuntimeHosting;
```

### 4.1 M6 Node selection is fixed

M6 MUST use the trusted composition process executable：

```text
nodeExecutable = process.execPath
```

不提供 arbitrary Node executable injection。未来只有真实第二种 Host-selected Node requirement 出现时才 reopen。

PREPARE MUST verify：

```text
process.versions.node major >= 20
process.execPath resolves to a canonical regular file
POSIX: executable access is available
package-owned dist/runner/entry.js exists as a canonical regular file
```

因此 HostraLaunchPlan freeze 时，实际 Node executable 与 Runner entry 已经完成 static preflight。

### 4.2 Runner policy validation

四个 timing value MUST 满足 existing `runSubsystem` policy domain：

```text
helloDeadlineMs             integer in [1, 2_147_483_647]
frameDeadlineMs             integer in [1_000, 300_000]
terminalCleanupDeadlineMs   integer in [1, 300_000]
terminationGraceMs          integer in [1, 2_147_483_647]
```

不提供 package default；session composition 必须显式提供。`controlProtocolVersions` 不进入 policy，M6 固定为 `[1]`。

Product composition MUST ensure：

```text
terminationGraceMs < Main terminationDeadlineMs
```

以保证 Main 在 physical termination request 后的 bounded `terminated` observation window 覆盖 force fallback。

### 4.3 Public error type

```ts
export type HostraLauncherErrorCode =
  | "PLATFORM_LAUNCH_MANIFEST_INVALID"
  | "PLATFORM_BINDING_MISSING"
  | "PLATFORM_BINDING_UNDECLARED"
  | "SUBSYSTEM_MODULE_INVALID"
  | "SUBSYSTEM_MODULE_NOT_FOUND"
  | "SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION"
  | "PLATFORM_RUNTIME_UNSUPPORTED"
  | "LAUNCH_RUNTIME_UNAVAILABLE"
  | "PROCESS_SPAWN_FAILED"
  | "PROCESS_EXITED_DURING_BOOTSTRAP"
  | "PROCESS_TERMINATION_FAILED";

export class HostraLauncherError extends Error {
  readonly code: HostraLauncherErrorCode;
  readonly cause?: unknown;
}
```

Error message/cause MUST NOT contain bootstrap token、attempt capability、完整 env 或不必要 physical path。

保持 internal：

```text
manifest parser
module resolver helpers
RunnerBootstrapV1
WS carrier constructor
spawn helpers
attempt mutable state
process termination helpers
```

---

## 5. PREPARE — Complete Before Runtime Side Effects

固定 installation files：

```text
<installationRoot>/game.json
<installationRoot>/launch.hostra.json
```

完整顺序：

```text
validate HostraRunnerPolicy
→ canonicalize trusted installation root
→ read game.json
→ @loomrealm/game-package parse/validate
→ read + parse launch.hostra.json
→ closed Hostra manifest validation
→ exact Game ↔ Hostra key-set equality
→ validate every module logical path
→ resolve every module under canonical installation root
→ reject symlink/junction/reparse escape
→ canonical containment verification
→ require regular .mjs files
→ preflight current Node >=20 + process.execPath
→ preflight package-owned Runner artifact
→ build deeply immutable HostraLaunchPlan
→ project deeply immutable LogicalGameBootstrap
→ return PreparedHostraGame
```

PREPARE 成功前 MUST NOT：

```text
spawn Subsystem Runner
import business Definition Module
create Runtime Control WS listener/connection
```

Node/Runner static capability preflight MUST NOT execute Runner/business code。

### 5.1 Manifest exact model

```ts
interface HostraLaunchManifestV1 {
  readonly formatVersion: 1;
  readonly subsystems: readonly {
    readonly key: string;
    readonly module: string;
  }[];
}
```

Parser MUST：

```text
closed objects
formatVersion exactly 1
unique exact key
no trim / normalization / case-fold
```

`module` grammar is frozen by the formal Profile：ASCII、`/` separator only、relative、no empty/`.`/`..` segment、no `\\`/`:`/control/NUL、UTF-8 <=512 bytes、`.mjs` suffix、each segment `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`。

### 5.2 Exact key-set join

Before plan construction：

```text
keys(GameEntry.subsystems) == keys(HostraLaunchManifest.subsystems)
```

Mapping：

```text
missing Hostra binding  → PLATFORM_BINDING_MISSING
extra Hostra binding    → PLATFORM_BINDING_UNDECLARED
duplicate binding       → PLATFORM_LAUNCH_MANIFEST_INVALID
```

Ordering MAY differ；identity is exact logical key, never module path。

### 5.3 Installation stability invariant

M6 freezes：

> **Prepared installation MUST remain stable for the lifetime of the prepared Platform Session.**

Installation replacement/update/switch requires a new Platform Session and new PREPARE。M6 does not implement live executable mutation、inode snapshot、content-addressed executable identity。

### 5.4 Immutable plan and logical projection

Do not expose a frozen `Map` as immutable data；`Object.freeze(new Map())` does not block `.set()`。

`HostraLaunchPlan` MUST be deeply frozen plain data。RuntimeHosting MAY construct an internal mutable lookup `Map` from the frozen array; it never leaves the package。

`LogicalGameBootstrap` exact shape：

```text
subsystemKeys
initial { subsystemKey, input }
```

It MUST NOT contain：

```text
formatVersion
Game document model/brand
HostraLaunchPlan
module/logicalModule/physicalModule
Node/Runner/process material
```

普通 `RuntimeHosting.launch()` MUST NOT re-read or reinterpret Game/manifest/filesystem binding policy。

---

## 6. RuntimeHosting — One Launch, One Attempt Closure

Existing port is unchanged：

```ts
RuntimeHosting.launch(
  { subsystemKey, bootstrapToken },
  signal,
): Promise<HostedRuntime>
```

No `launchId` is required by M6 Runtime identity。A Platform-private diagnostic attempt id MAY exist internally but MUST NOT become a public/Protocol identity field。

Attempt-local mutable facts only：

```ts
{
  ownership,          // pending | returned | abandoned
  child,
  spawned,
  exited,
  exitCode,
  exitSignal,
  controlServer,
  controlCarrier,
  controlAcquired,
  terminationCommitted,
  forceTimer,
  terminatedDeferred,
}
```

No package-wide Runtime registry。

### 6.1 Listener and capability

Each attempt：

```text
bind address = 127.0.0.1
port = 0 (OS ephemeral)
path capability = base64url(randomBytes(32))
```

Only the exact path MAY upgrade。Wrong path is rejected without consuming the one valid connection slot。

The capability is transport-only：

```text
WS capability != bootstrapToken != Runtime identity
```

MUST NOT add query token、Authorization、custom transport hello。Runtime Control remains the only `subsystemKey + bootstrapToken` identification/authentication authority。

### 6.2 Launch ordering and child observation

Frozen ordering：

```text
validate request + plan lookup
→ create/listen attempt WS server
→ construct bootstrap + safe env
→ child = spawn(process.execPath, [runnerEntry], shell=false)
→ synchronously attach child spawn/error/exit observers
→ only then await spawn-or-error outcome
→ if spawn succeeded and attempt not abandoned, transfer ownership by returning HostedRuntime
```

The child `exit` event is the canonical process-termination fact。

```text
exit  = actual process termination authority
close = stdio/resource closure diagnostic only
```

A successful `spawn` event means OS process creation succeeded；it does not mean connected/identified/ready。

If `error` occurs before `spawn`：

```text
close WS server
reject PROCESS_SPAWN_FAILED
no HostedRuntime returned
```

If actual `exit` is observed before HostedRuntime ownership transfer：

```text
close WS server
reject PROCESS_EXITED_DURING_BOOTSTRAP
```

### 6.3 `launch(..., signal)` abandonment semantics

The launch AbortSignal owns the attempt only until HostedRuntime ownership transfer。

```text
signal already aborted
→ reject before side effect

signal aborts while ownership=pending
→ atomically mark abandoned
→ close WS server / reject pending acquire
→ if child exists, issue immediate force-capable termination
→ keep internal exit observation until actual exit
→ never resolve HostedRuntime afterward
```

Abort cleanup MUST continue even if Main's outer deadline has already rejected its `Promise.race`。An abandoned attempt MUST NOT leave a listener or live child indefinitely。

Ownership transfer vs abort is first-wins in the single JS event loop：

```text
pending → returned
or
pending → abandoned
```

No transition out of `returned`/`abandoned`。

---

## 7. `HostedRuntime` Facts and Control Binding

### 7.1 `runtimeControl.acquire(signal)`

MUST be single-use：

```text
first call
→ wait for one valid attempt-path WS connection
→ accept text carrier
→ close listener against further connection attempts
→ return MessageCarrier

second call
→ reject
```

If acquire signal aborts before connection：

```text
reject acquire
close listener
```

The child remains owned by returned HostedRuntime and Main cleanup can terminate it。

If child exits before a carrier is acquired：

```text
reject acquire
```

After carrier loss：

```text
no same-attempt reconnect
```

Facts stay distinct：

```text
spawned != connected != identified != ready
```

This package directly owns `spawned/connected` physical facts only。Existing Runtime Control/Main own `identified/ready`。

### 7.2 `terminated`

`HostedRuntime.terminated` settles successfully exactly once from the already-installed child `exit` observer。

MUST NOT resolve because：

```text
kill/terminate requested
Control socket closed
requestTermination returned
shutdown intent committed
child close event alone
```

If process termination observation itself becomes unusable, `terminated` MAY reject；Main already owns `RUNTIME_TERMINATION_OBSERVATION_FAILED` handling。

### 7.3 `requestTermination(signal)`

MUST be idempotent。

First non-aborted call commits exactly one physical convergence：

```text
commit termination intent
→ issue normal host process termination request
→ install attempt-owned terminationGraceMs timer
→ if child exits, cancel timer
→ if timer expires while child alive, issue force-capable termination once
```

Subsequent calls join the same committed convergence and MUST NOT create additional timers/state machines。

`requestTermination()` resolves when the physical termination request + force fallback have been successfully committed locally；resolution does not mean stopped。`terminated` remains the only stopped fact。

Caller AbortSignal semantics：

```text
aborted before convergence commit
→ reject without starting a new convergence

aborts after convergence was committed
→ does not cancel the committed convergence
```

Platform mechanics MAY differ：POSIX may use normal termination followed by SIGKILL fallback；Windows may use the available force-capable child termination primitive。Observable contract is bounded convergence, not identical OS signal semantics。

---

## 8. Runner Bootstrap and Environment Security

Runner is the sole argv entry：

```text
process.execPath <package-owned dist/runner/entry.js>
```

Fixed：

```text
shell = false
cwd = canonical installation root
business Definition Module != argv entry
```

Game/manifest MUST NOT configure Node executable、Runner entry、shell、argv、Node flags、env、Control endpoint、credentials。

### 8.1 Reserved bootstrap envelope

Exact reserved key：

```text
LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP
```

Envelope：

```ts
interface RunnerBootstrapV1 {
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

Encoded JSON MUST be <= 16_384 UTF-8 bytes。Closed validation only。

It MUST NOT contain GameEntry、LogicalGameBootstrap、Frame/Activation、business input、Renderer/Data/Content material。

### 8.2 Bootstrap scrub invariant

Before importing any business module：

```text
read encoded value into local variable
→ immediately delete LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP from process.env
→ parse/validate/freeze local bootstrap
→ only then import business Definition Module
```

Thus business code and business-spawned descendants cannot inherit bootstrap token/control endpoint/physical module through environment。

### 8.3 Exact safe environment allowlist

Runner child env is built from only these parent keys when defined：

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

plus exactly：

```text
LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP
```

On Windows, lookup of the allowlisted semantic keys is case-insensitive; the constructed env uses the canonical names above。

MUST NOT inherit any other parent env by default, including：

```text
NODE_OPTIONS
NODE_PATH
npm_*
HOSTRA_RPC_TOKEN
application credentials
arbitrary parent secrets
```

Future need for an additional parent environment key requires explicit review; Game/manifest can never append arbitrary env。

---

## 9. Runner Execution

Frozen sequence：

```text
consume + scrub bootstrap env
→ closed bootstrap validation
→ convert canonical physical .mjs path to file URL
→ import exact module once
→ require default export
→ use default export as SubsystemDefinitionFactory candidate
→ connect exact attempt WS endpoint
→ wrap socket as MessageCarrier<string>
→ create single-use RuntimeControlBinding
→ create setTimeout-backed DeadlineScheduler
→ runSubsystem(...)
```

Exact host call：

```ts
await runSubsystem({
  definition,
  runtimeControl,
  runtimePolicy: {
    scheduler,
    helloDeadlineMs,
    frameDeadlineMs,
    terminalCleanupDeadlineMs,
  },
  launch: {
    subsystemKey,
    bootstrapToken,
    controlProtocolVersions: [1],
  },
});
```

Runner MUST NOT implement：

```text
Main authority
JSON-RPC dispatcher
Frame protocol
retry/reconnect
Data plane
Content
business dispatch framework
```

Normal `runSubsystem` completion may exit code 0。Bootstrap/module/runtime fatal failure exits nonzero and emits bounded diagnostics only。

---

## 10. WebSocket `MessageCarrier<string>`

Adapter stays internal to this package in M6。

Mapping：

```text
one WS text message = one MessageCarrier string
```

MUST：

```text
reject binary inbound and terminate carrier as lost
preserve inbound/outbound order
send() resolve on local WS send acceptance only
allow exactly one messages() logical reader
close() be idempotent
normal local/peer close → {kind:"closed"}
unexpected socket/error loss → {kind:"lost", cause}
```

MUST NOT：

```text
JSON.parse
classify JSON-RPC
perform bootstrap authentication
retry/reconnect
duplicate messages
own application deadlines
```

Extraction to `@loomrealm/transport-websocket` is allowed only after another real consumer proves identical semantics。

---

## 11. Failure Ownership

No Runner→Parent private lifecycle/status protocol is introduced for M6。

### Game Package

Common Game validation errors remain `GamePackageError` authority and pass through as that domain。

### Parent-observable Hostra errors

PREPARE / launch establishment MAY throw frozen `HostraLauncherError` codes from section 4.3。

### Runner-local diagnostics

Runner MAY internally classify：

```text
SUBSYSTEM_MODULE_LOAD_FAILED
SUBSYSTEM_MODULE_ABI_INVALID
bootstrap validation failure
Subsystem host fatal failure
```

Parent does not require matching typed status；bounded diagnostics + physical exit are sufficient。

### Main Runtime authority

```text
process exit after ownership transfer
unexpected exit including code 0 without Main termination intent
Control loss
termination observation failure
```

are first physical/protocol facts and are interpreted by existing Main Runtime authority。Do not duplicate Main's Runtime failure state machine in this package。

---

## 12. Qualification Strategy

M6 qualification is four-layered；one giant E2E is insufficient。

### 12.1 Pure contract tests

```text
closed manifest schema
module grammar
exact key-set join
runner policy bounds
LogicalGameBootstrap projection
HostraLaunchPlan deep immutability
error code mapping
```

### 12.2 Real filesystem PREPARE tests

Use real temp directories, not mocked `fs`：

```text
valid regular .mjs
missing file
directory instead of file
symlink/junction/reparse escape
canonical containment
ordering-independent exact key set
process.execPath + Runner artifact preflight
prepared installation stability documented/enforced by composition
```

Negative PREPARE proves no Runner/import/Runtime-WS side effect without production test-injection hooks。

### 12.3 RuntimeHosting integration tests

Use real `child_process` + loopback WS + package Runner：

```text
listener ready before spawn
observers attached before awaiting spawn
exit is canonical terminated fact
Runner is argv entry; business module is not
single-use acquire
wrong path rejected without consuming slot
binary carrier loss
same-attempt reconnect rejected
spawn failure
exit-before-ownership-transfer
exit-before-acquire
launch AbortSignal abandonment cleanup
requestTermination idempotence
normal termination + force fallback
abort-after-commit does not cancel convergence
no listener/child leak
```

### 12.4 Full Main ↔ Runner vertical

Minimal fixture：

```text
fixture/
├─ game.json
├─ launch.hostra.json
└─ subsystems/
   ├─ root.mjs
   └─ child.mjs
```

Reuse M5 logical trace：

```text
root Frame
→ frame.call(child)
→ child completed
→ root completed
```

Required verticals：

```text
happy root outcome
nested 2-Subsystem Frame
bootstrap/module failure
unexpected Runner code-0 exit
Runner ignores normal termination → force fallback
```

Observable application result on the happy trace MUST match the M5 fake-platform result。

Outer Hostra Electron smoke belongs to `apps/desktop` product qualification, not package-local dependency。

---

## 13. Package Artifact and CI Qualification

Runner is a package-owned executable artifact；source-tree tests alone are insufficient。

MUST：

```text
npm pack --dry-run
→ verify expected files

npm pack
→ install/extract actual tarball
→ import packed package
→ execute at least one packed Runner smoke/vertical
```

Packed artifact MUST contain：

```text
dist/runner/entry.js
```

Runner path lookup MUST be package-relative, e.g.：

```ts
new URL("./runner/entry.js", import.meta.url)
```

Never depend on repository root、`src/` layout、test cwd。

CI gate from M6 RuntimeHosting onward：

```text
ubuntu-latest
windows-latest
```

Minimum gate：

```text
build
pure tests
filesystem PREPARE tests
RuntimeHosting integration
full vertical E2E
npm pack qualification
packed Runner smoke
```

---

## 14. Implementation Order

Implement/review in this order：

```text
1. manifest + key join + launch-plan projection
2. canonical filesystem/module preflight
3. WebSocket MessageCarrier
4. Runner bootstrap/env/import/runSubsystem
5. RuntimeHosting attempt + supervision + termination
6. real Main↔Runner vertical + Linux/Windows + packed artifact
7. implementation review / mark Implemented / Qualified Baseline
```

Each behavior change lands with focused tests in the same step。

Do not combine all layers into one initial patch。

---

## 15. Reopen / Extraction Gates

Before M6 is implemented, stop and reopen design if implementation proves any of these necessary：

```text
change @loomrealm/main public contract
change RuntimeHosting / HostedRuntime port
change runSubsystem public API
change Runtime Control protocol
let Hostra RPC create Subsystem Runtime
let RuntimeHosting re-read Game/manifest
create generic process supervisor package
create generic WebSocket transport package merely to finish M6
add Runner→Parent lifecycle/status protocol only for detailed error codes
add arbitrary Node executable/configuration surface
```

Only a real consumer failure may reopen a frozen choice。

---

## 16. Frozen Definition of Done

Only after all items pass may status advance to `Implemented / Qualified Baseline`：

```text
PREPARE
[x] Game validation occurs inside Launcher via @loomrealm/game-package
[x] launch.hostra.json closed validation
[x] exact Game ↔ Hostra key-set equality
[x] all modules safely resolved before first Runtime side effect
[x] process.execPath Node >=20 and Runner artifact preflight complete before plan freeze
[x] symlink/junction/reparse escape qualified by platform-specific tests
[x] prepared installation remains session-stable
[x] HostraLaunchPlan deeply immutable
[x] LogicalGameBootstrap contains no physical/document material
[x] PREPARE failure creates no Runner/import/Runtime-WS side effect

BOUNDARY
[x] @loomrealm/main contract unchanged
[x] @loomrealm/platform-ports M5 contract unchanged
[x] @loomrealm/subsystem/host contract unchanged
[x] @loomrealm/runtime-control protocol unchanged
[x] business dependency boundary unchanged
[x] no Hostra RPC Runtime creation
[x] no dormant M8+/M12+ provisioning capability

RUNTIME
[x] one launch = one attempt-local closure
[x] WS listener ready before spawn
[x] child observers installed before awaiting spawn
[x] exit is canonical termination fact
[x] launch abort cannot leak listener/child
[x] MainRuntimeControlBinding single-use
[x] no same-attempt Control reconnect
[x] package Runner is sole argv entry
[x] business module imported exactly by Runner
[x] bootstrap env scrubbed before business import
[x] exact safe env allowlist qualified
[x] actual child exit is sole stopped fact
[x] requestTermination idempotent
[x] normal physical request → bounded force fallback
[x] no automatic restart

TRANSPORT
[x] loopback 127.0.0.1 + port 0
[x] 32-byte random path capability
[x] WS adapter only implements MessageCarrier<string>
[x] binary rejected as lost
[x] order / close / loss semantics qualified
[x] no JSON-RPC/auth/deadline/retry/reconnect in adapter

FAILURE OWNERSHIP
[x] common Game errors stay Game Package domain
[x] Hostra PREPARE/launch failures use frozen parent-observable codes
[x] Runner-local failures remain diagnostics + exit
[x] unexpected post-transfer exit reaches existing Main failure path
[x] no duplicate Runtime lifecycle authority

QUALIFICATION
[x] pure tests green
[x] real filesystem PREPARE tests green
[x] real child + WS integration green
[x] Main↔Runner happy vertical green
[x] nested Frame vertical green
[x] bootstrap/module failure vertical green
[x] unexpected code-0 exit vertical green
[x] force fallback vertical green
[x] Linux CI green
[x] Windows CI green
[x] npm pack --dry-run green
[x] actual packed artifact contains Runner
[x] packed Runner smoke/vertical green
```

Final code shape must still reduce to：

```text
PREPARE
+
RuntimeHosting
+
Runner
+
WS carrier
```

No side path：

```text
Main → Game/manifest/module/path             ✗
Runner → Game/manifest reinterpretation       ✗
business → bootstrapToken/physical path       ✗
WS adapter → Runtime Control semantics        ✗
Hostra shell → LoomRealm Runtime authority    ✗
```
