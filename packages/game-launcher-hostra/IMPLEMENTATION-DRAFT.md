# `@loomrealm/game-launcher-hostra` M6 实现草案

> 状态：Implementation Draft  
> 阶段：M6 Hostra Platform Vertical  
> 性质：非规范实现草案；`DESIGN.md`、正式 Hostra Launcher Profile、`@loomrealm/platform-ports`、`@loomrealm/main`、`@loomrealm/subsystem/host` 的冻结契约优先于本文。  
> 目标：用一个 package 闭合 Hostra Game PREPARE、immutable `HostraLaunchPlan`、Node Runner、Runtime Control WebSocket `MessageCarrier` 与现有 `RuntimeHosting` 的第一条真实物理纵向；不新增通用 launcher / transport / supervisor 层。

核心原则：

> **M6 只把 M5 的 fake physical Platform 替换成真实 Node process + WebSocket；既有 Main / Runtime Control / Subsystem application semantics 不应改变。**

---

## 1. M6 Closure Target

```text
Hostra Game installation
→ @loomrealm/game-launcher-hostra PREPARE
→ immutable LogicalGameBootstrap + private HostraLaunchPlan
→ existing @loomrealm/main
→ existing RuntimeHosting port
→ attempt-local Node child process
→ attempt-local WebSocket MessageCarrier<string>
→ existing @loomrealm/runtime-control
→ existing @loomrealm/subsystem/host
→ exact planned Definition Module
→ Frame outcome
→ bounded physical shutdown
→ actual process exit
```

M6 不闭合：

```text
Renderer Control
Renderer/Data Broker
Input / Render
Content
PWA
Hostra BrowserWindow integration
Hostra Shell RPC abstraction
```

---

## 2. Ownership Boundary

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

本 package：

```text
owns
    Hostra Game PREPARE
    Hostra manifest validation
    executable/security preflight
    immutable HostraLaunchPlan
    LogicalGameBootstrap projection
    RuntimeHosting physical realization
    package-owned Node Runner
    Runtime Control WS carrier
    process physical convergence

does not own
    Hostra outer Host lifecycle
    Main Runtime/Frame authority
    Runtime Control protocol semantics
    Renderer/Data/Content
    business semantics
```

MUST NOT：

```text
call Hostra RPC to create Subsystem Runtime
make Hostra own LoomRealm Launch Attempt
mirror Hostra lifecycle events into LoomRealm Runtime authority
let Main receive Game/manifest/module/path
let Runner re-read Game/manifest
```

Subsystem Runner 由 LoomRealm `RuntimeHosting` 直接创建和监督。

---

## 3. Package Shape and Dependencies

第一版建议：

```text
packages/game-launcher-hostra/
├─ DESIGN.md
├─ IMPLEMENTATION-DRAFT.md
├─ package.json
├─ tsconfig.json
├─ src/
│  ├─ index.ts
│  ├─ errors.ts
│  ├─ prepare.ts
│  ├─ manifest.ts
│  ├─ module-resolver.ts
│  ├─ launch-plan.ts
│  ├─ runtime-hosting.ts
│  ├─ websocket-carrier.ts
│  └─ runner/
│     ├─ entry.ts
│     └─ bootstrap.ts
└─ test/
   ├─ prepare.test.mjs
   ├─ runtime-hosting.test.mjs
   └─ e2e.test.mjs
```

预计直接依赖：

```text
@loomrealm/game-package
@loomrealm/foundation
@loomrealm/platform-ports
@loomrealm/subsystem       (/host Runner side)
ws
```

不创建：

```text
HostraLauncher class
HostraRuntimeManager
ProcessSupervisor class
RuntimeRegistry
EventBus
GenericWebSocketTransport
GenericLauncher
@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/platform-hostra
@loomrealm/process-supervisor
@loomrealm/hostra-runtime
```

状态优先存在于 plain data / attempt-local closure 中；只有第二个真实 consumer 出现且 semantic boundary 完全相同时才允许提取通用 package。

---

## 4. Public / Integration Surface

第一版 root surface SHOULD 尽可能小：

```ts
export interface HostraGameSource {
  readonly installationRoot: string;
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

export async function prepareHostraGame(
  source: HostraGameSource,
): Promise<PreparedHostraGame>;

export function createHostraRuntimeHosting(options: {
  readonly launchPlan: HostraLaunchPlan;
  readonly nodeExecutable: string;
  readonly runnerPolicy: HostraRunnerPolicy;
}): RuntimeHosting;
```

第一版固定：

```text
HostraGameSource = installationRoot only
```

不预建：

```text
GameSource
InstallationProvider
GameRepository
PreparedPlatformGame<T>
PlatformLaunchOptions
```

`LogicalGameBootstrap` 的语义 authority 仍属于 `@loomrealm/main`；本包只生产与 frozen shape 一致的 projection，不创建第二套 bootstrap model。

保持 internal：

```text
parseHostraLaunchManifest
resolveHostraModule
RunnerBootstrapV1
createWebSocketCarrier
spawnRunner
attempt state
process termination helpers
```

---

## 5. PREPARE

固定输入：

```text
<installationRoot>/game.json
<installationRoot>/launch.hostra.json
```

完整流程：

```text
canonicalize trusted installation root
→ read game.json
→ @loomrealm/game-package parse/validate
→ read + parse launch.hostra.json
→ closed Hostra manifest validation
→ exact Game ↔ Hostra key-set equality
→ validate every logical module
→ resolve every module under installation root
→ canonical containment / symlink-junction-reparse escape rejection
→ require regular .mjs file
→ build deeply immutable HostraLaunchPlan
→ project deeply immutable LogicalGameBootstrap
→ return PreparedHostraGame
```

PREPARE 成功前：

```text
MUST NOT spawn Node process
MUST NOT import Definition Module
MUST NOT create Runtime Control listener/connection
```

该 invariant 优先通过实现依赖方向和真实 negative integration test 证明；不得为了“计数副作用”而向 production API 注入 test-only spawn/import/ws factories。

### 5.1 Manifest

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
closed object schema
exact formatVersion = 1
unique exact key
module grammar from formal Hostra profile
no normalization / trim / case fold
```

### 5.2 Module Resolution and Installation Stability

`module` MUST 在 PREPARE 内完成：

```text
logical syntax validation
→ resolve under canonical installation root
→ path-chain symlink/junction/reparse checks
→ canonical containment check
→ regular-file check
→ .mjs check
→ canonical physical path
```

M6 v1 明确冻结：

> **Prepared installation MUST remain stable for the lifetime of the prepared Platform Session.**

PREPARE 后若 installation 被替换、重写或切换，必须创建新的 Platform Session 并重新 PREPARE；M6 不解决 live installation mutation / inode snapshot / content-addressed executable identity。

### 5.3 LaunchPlan and Logical Projection

不要用 `Object.freeze(new Map())` 表达 runtime immutability；冻结 Map object 不会禁止 `.set()`。

建议：

```ts
interface HostraLaunchPlan {
  readonly canonicalInstallationRoot: string;
  readonly runtimes: readonly {
    readonly subsystemKey: string;
    readonly logicalModule: string;
    readonly physicalModule: string;
  }[];
}
```

要求：

```text
HostraLaunchPlan
    deeply immutable
    contains preflight-complete physical facts
    never enters Main/business payload

LogicalGameBootstrap
    subsystemKeys
    initial {subsystemKey,input}
    no formatVersion
    no module/path
    no HostraLaunchPlan
```

`RuntimeHosting` MAY 从 frozen array 构建 package-private lookup `Map`，但不得暴露该 mutable cache。

普通 `launch()` MUST NOT 重读或重新解释 Game/manifest。

---

## 6. RuntimeHosting Attempt Model

现有 frozen port 保持不变：

```ts
RuntimeHosting.launch(
  { subsystemKey, bootstrapToken },
  signal,
): Promise<HostedRuntime>
```

每个 `launch()` 自成一个 attempt-local closure；不建立 package-wide Runtime registry。

概念状态：

```ts
{
  child,
  controlServer,
  controlCarrier,
  controlAcquired,
  terminationStarted,
  terminationPromise,
  terminated,
  terminal
}
```

一条 Launch Attempt 只允许：

```text
one child process
one attempt-local WS capability
one accepted Control connection
one MainRuntimeControlBinding.acquire()
one terminal process fact
```

### 6.1 Launch Ordering

```text
validate request + lookup frozen plan
→ create attempt-local loopback WS listener on port 0
→ create high-entropy attempt-local WS pathname
→ await listener actually listening
→ construct Runner bootstrap
→ construct safe Runner environment
→ spawn package-owned Runner
→ await child spawn/error
→ install physical termination observation
→ return HostedRuntime
```

必须：

```text
WS listener ready
BEFORE
Runner spawn
```

### 6.2 Connection Authority

WS MAY 使用：

```text
127.0.0.1
OS ephemeral port
high-entropy attempt-local path
```

该 path 只是 one-shot local transport capability，不是 Runtime identity/authentication authority。

不得增加第二套：

```text
?token=
Authorization header
custom WS hello
```

真正 Launch Attempt identity 继续由现有 Runtime Control 使用：

```text
subsystemKey
bootstrapToken
```

因此：

```text
WS capability != bootstrapToken != Runtime identity
```

`runtimeControl.acquire(signal)` MUST：

```text
first call
→ wait for first accepted WS connection
→ stop accepting additional connections
→ return MessageCarrier

second call
→ reject

carrier lost after acquisition
→ no same-attempt reconnect
```

保持：

```text
spawned != connected != identified != ready
```

本 package 直接拥有 spawned/connected physical facts；identified/ready 继续由既有 Runtime Control/Main 解释。

### 6.3 Termination Fact and Convergence

`HostedRuntime.terminated` 只来自 actual child process termination observation：

```text
actual child exit/close
→ settle terminated exactly once
```

不得因为：

```text
kill() requested
Control socket closed
shutdown requested
```

提前 resolve。

`requestTermination(signal)` SHOULD 是 idempotent 的“提交 physical convergence”操作，不依赖调用次数表达 severity：

```text
first request
→ commit termination intent once
→ graceful process termination request
→ start attempt-owned bounded grace period
→ if still alive, force termination
→ await actual exit or caller AbortSignal

subsequent requests
→ join same convergence attempt
```

因此：

```text
requestTermination resolution != stopped
terminated resolution = actual physical stopped fact
```

不新增 `forceKill()` public port，也不把“第二次调用”等同于 force command。

---

## 7. Runner Bootstrap and Environment Security

Runner 是唯一 child argv entry：

```text
<nodeExecutable> <package-owned-runner-entry>
```

固定：

```text
nodeExecutable = Host-selected trusted executable
runner entry    = package-owned artifact
shell           = false
cwd             = canonical installation root
business module != argv entry
```

Game/manifest MUST NOT 配置：

```text
Node executable
Runner entry
shell
arbitrary argv
Node flags
env
```

### 7.1 Bootstrap Envelope

M6 第一版使用一个 Host-owned reserved environment value携带小型 versioned JSON bootstrap；不建立 bootstrap IPC framework。

概念：

```ts
interface RunnerBootstrapV1 {
  readonly version: 1;
  readonly subsystemKey: string;
  readonly physicalModule: string;
  readonly controlEndpoint: string;
  readonly bootstrapToken: string;
  readonly controlProtocolVersions: readonly number[];
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly terminalCleanupDeadlineMs: number;
}
```

该结构：

```text
Platform-internal only
closed validation
not exported to Main/business
not logged
```

不得包含：

```text
GameEntry
LogicalGameBootstrap
Frame / Activation
business initial input
Renderer/Data material
Content credential
```

### 7.2 Bootstrap Scrub Invariant

Runner MUST 在 import 任何 business Definition Module 前移除 reserved bootstrap env：

```text
read encoded bootstrap into local value
→ immediately delete LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP from process.env
→ parse/validate/freeze local bootstrap value
→ only then import business module
```

目的：

```text
business Definition cannot read bootstrapToken/controlEndpoint/physicalModule from process.env
business-spawned descendants cannot inherit the reserved bootstrap
```

不得通过 business-facing API 重新暴露这些物理值。

### 7.3 Safe Environment

Runner child environment MUST 由 explicit allowlist 构造，而不是复制完整 `process.env`：

```text
platform-required baseline
+ LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP
```

Linux/Windows qualification 冻结真正 required baseline；典型候选：

```text
PATH
HOME
TMPDIR
TMP
TEMP
SystemRoot
WINDIR
```

最终只保留真实运行所需值。

MUST NOT 无条件继承：

```text
NODE_OPTIONS
NODE_PATH
npm_*
HOSTRA_RPC_TOKEN
application credentials
arbitrary parent secrets
```

---

## 8. Runner Execution

Runner startup：

```text
consume + scrub bootstrap env
→ closed schema / version validation
→ validate key/token/policy bounds
→ convert canonical physical .mjs path to file URL
→ import exact module once
→ require default export
→ treat default export as SubsystemDefinitionFactory candidate
→ connect attempt-local Runtime Control WS
→ wrap socket as MessageCarrier
→ construct RuntimeControlBinding(single-use)
→ construct DeadlineScheduler(setTimeout-backed)
→ runSubsystem(...)
```

调用既有 host surface：

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
    controlProtocolVersions,
  },
});
```

Runner 不实现：

```text
Main authority
JSON-RPC dispatcher
Frame protocol
retry/reconnect
Data plane
Content
business dispatch framework
```

正常完成后可成功退出；bootstrap/module/runtime fatal failure 以非零 code 退出并仅输出 bounded diagnostics。

---

## 9. WebSocket MessageCarrier

第一版 adapter 留在本 package：

```text
websocket-carrier.ts
```

映射严格为：

```text
one WS text message = one MessageCarrier string
```

必须：

```text
reject binary inbound
preserve order
send() resolves on local WS send acceptance only
exactly one messages() logical reader
close() idempotent
normal local/peer close → {kind:"closed"}
unexpected socket/error loss → {kind:"lost", cause}
```

不得：

```text
JSON.parse
JSON-RPC classification
bootstrap authentication
retry
reconnect
message duplication
application timeout
```

当 M7/M9 出现第二、第三个真实相同 consumer 后，再评估是否抽 `@loomrealm/transport-websocket`。

---

## 10. Failure and Error Ownership

第一版不建立复杂 error hierarchy，也不为了“精确 Runner error code”新增 Runner→Parent private status protocol。

按可观察域分层：

### 10.1 Game Package domain

```text
GamePackageError
    common Game document validation authority
```

Launcher 不把 common Game error伪装成 Hostra module error。

### 10.2 PREPARE / synchronous Launcher domain

`HostraLauncherError` 可直接表达：

```text
PLATFORM_LAUNCH_MANIFEST_INVALID
PLATFORM_BINDING_MISSING
PLATFORM_BINDING_UNDECLARED
SUBSYSTEM_MODULE_INVALID
SUBSYSTEM_MODULE_NOT_FOUND
SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION
PLATFORM_RUNTIME_UNSUPPORTED
```

### 10.3 Launch establishment / physical convergence domain

Parent 可直接观察并表达：

```text
LAUNCH_RUNTIME_UNAVAILABLE
PROCESS_SPAWN_FAILED
PROCESS_TERMINATION_FAILED
```

### 10.4 Runner-local diagnostics

Runner 内部 MAY 分类：

```text
SUBSYSTEM_MODULE_LOAD_FAILED
SUBSYSTEM_MODULE_ABI_INVALID
bootstrap validation failure
Runtime host fatal failure
```

但 parent 不要求得到同名 typed status；Runner 只需 bounded diagnostics + physical exit fact。

### 10.5 Main-observed Runtime failure

```text
process exits during bootstrap
unexpected process exit, including code 0 without Main termination intent
termination observation failure
```

首先是 `HostedRuntime.terminated` / termination observation physical fact，再由既有 Main authority映射为 Runtime failure。

不得为了把所有 formal profile category 都变成 parent-side typed error 而新增第二条 lifecycle/status protocol。

Public/user-facing material MUST NOT leak：

```text
bootstrapToken
attempt-local WS capability
full safe env
unnecessary physical path
internal stack
```

---

## 11. Implementation Order and Reviewable Commits

实现顺序 MUST 保持失败域可分离，而不是优先一次跑通 happy path。

依赖方向：

```text
raw source / filesystem
        ↓
manifest + module validation
        ↓
immutable prepared facts
        ↓
RuntimeHosting attempt
        ↓
Runner physical bootstrap
        ↓
existing role/protocol packages
```

禁止反向依赖：

```text
Runner → game.json / launch.hostra.json
RuntimeHosting.launch() → raw source重新解释
Main → HostraLaunchPlan/module/path
WS adapter → Runtime Control schema
```

推荐提交序列：

```text
1. feat(hostra-launcher): implement manifest and launch plan preparation
   - manifest parser
   - exact key join
   - projection
   - focused tests

2. feat(hostra-launcher): add canonical module preflight
   - filesystem containment/security
   - real temp-dir tests

3. feat(hostra-launcher): add websocket message carrier
   - text/order/close/loss
   - focused transport tests

4. feat(hostra-launcher): add node subsystem runner
   - bootstrap validator + scrub
   - safe env
   - package-owned entry
   - exact module import

5. feat(hostra-launcher): implement runtime hosting
   - listener-before-spawn
   - attempt-local state
   - single-use acquire
   - idempotent graceful→force convergence

6. test(hostra-launcher): qualify real main-to-runner vertical
   - happy vertical
   - nested Frame
   - failure/exit/termination cases
   - Linux/Windows
   - packed artifact smoke

7. docs(hostra-launcher): freeze M6 implemented baseline
```

每一步：

```text
behavior introduced
→ focused tests in same step
→ previous layers remain green
```

---

## 12. Qualification Strategy

不要依赖一个 full E2E 覆盖所有语义。M6 分四层 qualification。

### 12.1 Pure contract tests

```text
manifest closed schema
module grammar
exact key-set join
LogicalGameBootstrap projection
HostraLaunchPlan immutability
error-domain mapping
```

无 child、无 WS、尽量无真实 filesystem。

### 12.2 Real filesystem PREPARE tests

使用真实 temp directory，不 mock `fs`：

```text
valid .mjs
missing file
directory
symlink/junction/reparse escape
canonical containment
ordering-independent exact key set
prepared installation stability assumption documented
```

Negative PREPARE qualification 要证明没有 Runtime side effect，但不要求 production API 暴露计数 hooks。

### 12.3 RuntimeHosting integration tests

真实：

```text
child_process
loopback WebSocket
package-owned Runner
```

验证：

```text
listener ready before spawn
Runner is argv entry; business module is not
single-use acquire
binary rejected
same-attempt reconnect rejected
spawn failure
exit-before-acquire
actual terminated fact
gracious termination converges
force fallback converges
repeated requestTermination joins same convergence
abort cleanup leaves no listener/process leak
```

### 12.4 Full Main ↔ Runner Vertical

第一组 fixture 保持极小：

```text
fixture/
├─ game.json
├─ launch.hostra.json
└─ subsystems/
   ├─ root.mjs
   └─ child.mjs
```

优先复用 M5 已验证 logical trace：

```text
root Frame
→ frame.call(child)
→ child completed
→ root completed
```

完整链：

```text
prepareHostraGame
→ createHostraRuntimeHosting
→ existing runMain
→ real Node Runner
→ real Runtime Control WS
→ existing runSubsystem
→ business Definition
→ Frame outcome
→ shutdown
→ actual child exit
```

Required negative verticals：

```text
bootstrap/module failure
→ Runner nonzero exit
→ existing Main required-Runtime failure path
→ cleanup

unexpected Runner exit, including code 0 without Main intent
→ Runtime failure

Runner ignores graceful convergence
→ platform grace expires
→ force termination
→ actual exit
```

Outer Hostra full-process smoke由 `apps/desktop` / product qualification负责；package-local qualification不把 Hostra Electron shell变成本 package dependency。

---

## 13. Package Artifact and CI Qualification

Runner 是 package-owned executable artifact，因此不能只验证 monorepo source tree。

MUST：

```text
npm pack --dry-run
→ verify expected files

npm pack
→ install/extract actual tarball
→ import packed package
→ execute at least one packed Runner smoke/vertical
```

必须确认 artifact 含真实 Runner entry，例如：

```text
dist/runner/entry.js
```

RuntimeHosting 查找 Runner MUST 以 package runtime location 为基准，例如：

```ts
new URL("./runner/entry.js", import.meta.url)
```

不得依赖：

```text
repository root
packages/game-launcher-hostra/src
current test working directory
```

CI 从 RuntimeHosting 开始覆盖：

```text
ubuntu-latest
windows-latest
```

最小 gate：

```text
build
pure tests
filesystem PREPARE tests
RuntimeHosting integration
full vertical E2E
npm pack qualification
packed Runner smoke
```

跨平台重点：

```text
path/canonicalization
symlink/junction behavior
child spawn
safe env
process termination
loopback WS
```

---

## 14. Extraction and Design Reopen Gates

允许未来提取通用 package 的条件必须同时成立：

```text
second real consumer exists
+
semantic boundary is actually identical
+
extraction does not move application authority into adapter
```

实现过程中若出现以下任一“必须条件”，先停止并重新检查设计，而不是增加 optional field / compatibility path / manager layer：

```text
must change @loomrealm/main public contract
must change RuntimeHosting / HostedRuntime port
must change runSubsystem public API
must change Runtime Control protocol
must let Hostra RPC create Subsystem Runtime
must create generic process supervisor package
must create generic WebSocket transport package to finish M6
must let RuntimeHosting re-read Game/manifest
must add Runner→Parent lifecycle/status protocol only to recover detailed error codes
```

只有真实 consumer 证明 frozen contract 不足时才 reopen。

---

## 15. Final Definition of Done

只有以下全部成立，才允许将 M6 标记为：

```text
@loomrealm/game-launcher-hostra
Implemented / Qualified Baseline
```

```text
PREPARE
[ ] raw Game source在 Launcher内部交给 @loomrealm/game-package
[ ] launch.hostra.json closed validation
[ ] exact Game ↔ Hostra key-set equality
[ ] all required modules before first Runtime side effect safely resolved
[ ] symlink/junction/reparse escape qualified on target platforms
[ ] prepared installation session-stability invariant documented/enforced by composition
[ ] HostraLaunchPlan deeply immutable
[ ] LogicalGameBootstrap contains no document/executable material
[ ] PREPARE failure has no process/import/WS Runtime side effect

BOUNDARY
[ ] @loomrealm/main public contract unchanged
[ ] @loomrealm/platform-ports M5 contract unchanged
[ ] @loomrealm/subsystem/host public contract unchanged
[ ] @loomrealm/runtime-control protocol unchanged
[ ] business Definition dependency boundary unchanged
[ ] no Hostra RPC Runtime creation path

RUNTIME
[ ] one launch = one attempt-local closure
[ ] loopback WS ready before child spawn
[ ] endpoint uses OS ephemeral port + attempt-local capability
[ ] MainRuntimeControlBinding single-use
[ ] no same-attempt Control reconnect
[ ] package-owned Runner is sole argv entry
[ ] business module imported exactly by Runner
[ ] reserved bootstrap env scrubbed before business import
[ ] safe environment allowlist qualified
[ ] actual child exit is sole successful terminated fact
[ ] requestTermination is idempotent
[ ] graceful → bounded force physical convergence works
[ ] no automatic Runtime restart

TRANSPORT
[ ] WS adapter only implements MessageCarrier<string>
[ ] binary rejected
[ ] order / close / loss semantics qualified
[ ] no JSON-RPC/parser/auth/deadline/retry/reconnect logic in adapter

FAILURE OWNERSHIP
[ ] Game errors remain Game Package domain
[ ] PREPARE/launch errors are observable without new private status protocol
[ ] Runner-local failures use bounded diagnostics + physical exit
[ ] unexpected exit reaches existing Main Runtime failure path
[ ] no duplicate Runtime lifecycle authority

QUALIFICATION
[ ] pure contract tests green
[ ] real filesystem PREPARE tests green
[ ] real child + WS integration green
[ ] real Main ↔ Runner ↔ Subsystem happy vertical green
[ ] nested 2-Subsystem Frame vertical green
[ ] bootstrap/module failure vertical green
[ ] unexpected code-0 exit vertical green
[ ] force termination vertical green
[ ] Linux green
[ ] Windows green
[ ] npm pack --dry-run green
[ ] actual packed artifact contains Runner
[ ] packed package Runner smoke/vertical green
```

最终不存在旁路：

```text
Main → Game/manifest/module/path            ✗
Runner → Game/manifest re-interpretation     ✗
business → bootstrapToken/physical path      ✗
WS adapter → Runtime Control semantics       ✗
Hostra shell → LoomRealm Runtime authority   ✗
```

最终代码形态仍应可概括为：

```text
PREPARE
+
RuntimeHosting
+
Runner
+
WS carrier
```

M6 的优雅闭环标准不是代码量，而是：

> **真实 Node/WS physical vertical 替换 M5 fake Platform 后，既有 logical contracts 与 business-observable semantics 无需改变；新增复杂性只存在于 Hostra Platform 的物理边界，每个失败域、资源和终止事实都能独立收敛。**
