# `@loomrealm/game-launcher-hostra` M6 实现草案

> 状态：Implementation Draft  
> 阶段：M6 Hostra Platform Vertical  
> 性质：非规范实现草案；`DESIGN.md`、正式 Hostra Launcher Profile、`@loomrealm/platform-ports` / `@loomrealm/main` / `@loomrealm/subsystem/host` 已冻结契约优先于本文。  
> 目标：在不新增通用 launcher/transport/supervisor package 的前提下，以一个 package 完成 Hostra Game PREPARE、HostraLaunchPlan、Node Runner、Runtime Control WebSocket carrier 与 `RuntimeHosting` 的第一条真实物理纵向。

---

## 1. M6 Implementation Target

M6 只闭合：

```text
Hostra Game installation
→ @loomrealm/game-launcher-hostra PREPARE
→ LogicalGameBootstrap + private HostraLaunchPlan
→ existing @loomrealm/main
→ existing RuntimeHosting port
→ real Node child process
→ real WebSocket MessageCarrier
→ existing @loomrealm/runtime-control
→ existing @loomrealm/subsystem/host
→ Definition Module
→ Frame outcome
→ actual process termination
```

不闭合：

```text
Renderer Control
Renderer/Data Broker
Input / Render
Content
PWA
Hostra BrowserWindow integration
Hostra Shell RPC abstraction
```

M6 原则：

> **把 M5 fake physical Platform 替换成真实 Node process + WebSocket；不改变 Main / Runtime Control / Subsystem application semantics。**

---

## 2. Hostra Boundary

Hostra Qualified Baseline 与 LoomRealm M6 的职责分离：

```text
Hostra Electron Main
    owns outer desktop shell / BrowserWindow / Host lifecycle
        │
        └── HOSTRA_SUBCMD
                ↓
          LoomRealm desktop composition process
                │
                ├── Main
                ├── HostraPlatform composition object
                └── @loomrealm/game-launcher-hostra
                        └── Node Runner child processes
```

M6 package：

```text
MUST NOT call Hostra RPC to create Subsystem Runtime process
MUST NOT make Hostra own LoomRealm Launch Attempt
MUST NOT mirror Hostra lifecycle events into LoomRealm Runtime authority
```

Subsystem Runner 由 LoomRealm `RuntimeHosting` 直接创建和监督。

因此 M6 core implementation 不要求直接 runtime-import `hostra` package；Hostra 是外层 shell/runtime，`@loomrealm/game-launcher-hostra` 是 LoomRealm 内部 Hostra Platform launch integration。

---

## 3. Package Shape

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

第一版不创建：

```text
HostraLauncher class
HostraRuntimeManager
ProcessSupervisor class
RuntimeRegistry
EventBus
GenericWebSocketTransport
GenericLauncher
```

状态优先放在 attempt-local closure / plain object 中；只有出现第二个真实消费者后才提取通用 package。

---

## 4. Dependencies

M6 package 预计直接依赖：

```text
@loomrealm/game-package
@loomrealm/foundation
@loomrealm/platform-ports
@loomrealm/subsystem      (/host Runner side)
ws
```

`@loomrealm/runtime-control` 由 `@loomrealm/subsystem/host` 真实消费；WebSocket adapter 本身不解析 Runtime Control。

`@loomrealm/main` MUST NOT depend on this package。

关于 `LogicalGameBootstrap`：

- 语义 authority 仍属于 `@loomrealm/main`；
- 本包只生产与该 frozen shape 一致的 projection；
- 不新增 `@loomrealm/bootstrap` / shared DTO package；
- TypeScript exact import/conformance placement在实现时选择最小无环方案，但不得产生第二套 logical bootstrap semantics。

---

## 5. Public / Integration Surface

M6 第一版只需要很窄的 integration surface。

建议概念形态：

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

约束：

```text
HostraGameSource first version = installationRoot only
```

不提前抽象：

```text
GameSource
InstallationProvider
GameRepository
PreparedPlatformGame<T>
PlatformLaunchOptions
```

`HostraLaunchPlan` 可作为 HostraPlatform 内部 integration value 暴露，但不得进入 Main/business payload。

---

## 6. PREPARE

固定文件：

```text
<installationRoot>/game.json
<installationRoot>/launch.hostra.json
```

流程：

```text
canonicalize trusted installation root
→ read game.json
→ @loomrealm/game-package parse/validate
→ read + parse launch.hostra.json
→ closed Hostra manifest validation
→ exact Game ↔ Hostra key-set equality
→ validate every logical module
→ resolve every module under installation root
→ canonical containment / symlink escape rejection
→ require regular .mjs file
→ create deeply immutable HostraLaunchPlan
→ project deeply immutable LogicalGameBootstrap
→ return PreparedHostraGame
```

任何 PREPARE failure 前必须保持：

```text
Node spawn count = 0
Definition Module import count = 0
Runtime Control listener/connection count = 0
```

### 6.1 Manifest representation

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

### 6.2 LaunchPlan runtime representation

不要依赖 `Object.freeze(new Map())` 获得 runtime immutability；冻结 Map object 并不会禁止 `.set()`。

第一版建议 plan 使用 deeply-frozen data：

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

`physicalModule` 必须是 preflight 后的 canonical physical path，只存在于 Hostra Platform boundary。

`RuntimeHosting` 构造时可以从 frozen array 建一个 package-private `Map` 作为 lookup cache；该 Map 不从 API 暴露。

---

## 7. RuntimeHosting

现有 frozen port：

```ts
RuntimeHosting.launch(
  { subsystemKey, bootstrapToken },
  signal,
): Promise<HostedRuntime>
```

M6 implementation 不改变这个 shape。

每次 `launch()` 是一个独立 Launch Attempt physical realization：

```text
validate request + lookup frozen plan
→ create attempt-local loopback WS listener on port 0
→ create high-entropy attempt-local WS pathname
→ await listener actually listening
→ construct Runner bootstrap
→ spawn Host-owned Runner
→ await child `spawn` or `error`
→ return HostedRuntime
```

重要顺序：

```text
WS listener ready
BEFORE
Runner spawn
```

避免 Runner 启动后连接 endpoint 的竞态。

### 7.1 `HostedRuntime.runtimeControl`

`MainRuntimeControlBinding.acquire(signal)`：

```text
single-use
→ wait for exactly one valid attempt-local WS connection
→ stop accepting additional connections
→ return MessageCarrier
```

约束：

```text
acquire count > 1 → reject
same-attempt reconnect → reject
listener close / child exit before acquire → reject
AbortSignal abort → reject and release listener
```

Transport adapter MUST NOT parse hello/token/JSON-RPC。Main Runtime Control peer 继续拥有 bootstrap token authentication semantics。

高熵随机 pathname 只是 attempt-local transport capability，避免无关本地连接抢占普通可猜 endpoint；不得进入 Main/business state。

### 7.2 `terminated`

只来自 child process actual termination observation：

```text
child `exit` / `close`
→ resolve exactly once
```

不得因为：

```text
kill() called
Control socket closed
shutdown requested
```

就提前 resolve。

如果 termination observation 本身不可用/异常，则 reject，使 Main 按既有 `RUNTIME_TERMINATION_OBSERVATION_FAILED` 处理。

### 7.3 `requestTermination(signal)`

实现保持 physical-only，不创造新的 Runtime lifecycle authority。

建议 attempt-local 两阶段：

```text
first physical termination request
    → normal process termination request
    → wait for actual exit or caller AbortSignal

subsequent request after first attempt failed/timed out
    → force termination request
    → wait for actual exit or caller AbortSignal
```

这与 Main 当前“bounded request + failure 后再请求一次”的 termination policy自然配合，而不需要新增 `forceKill()` public port。

平台差异留在该函数内部；public `HostedRuntime` contract 不增加 signal/process 字段。

---

## 8. Runner Bootstrap

Runner 是唯一 child argv entry：

```text
<nodeExecutable> <package-owned-runner-entry>
```

必须：

```text
shell = false
cwd = canonical installation root
business Definition Module != argv entry
```

Runner entry 不由 `launch.hostra.json` / Game config 覆盖。

### 8.1 Bootstrap encoding

M6 第一版使用一个 Host-owned reserved environment value携带小型 versioned JSON bootstrap 即可；不引入 bootstrap IPC protocol/framework。

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
arbitrary env/argv
```

Environment 必须由 explicit safe baseline + reserved bootstrap 构造；不得直接 `{ ...process.env }` 全量继承。

exact safe baseline allowlist 由 Linux/Windows qualification 固定；Game/manifest 无法追加 env。

---

## 9. Runner Execution

Runner startup：

```text
read bootstrap value
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

`runSubsystem()` 正常完成后 Runner 以成功 code 退出；fatal/bootstrap/module failures以非零 code退出并仅输出 bounded diagnostics。

---

## 10. WebSocket MessageCarrier

第一版 adapter 留在本 package：

```text
websocket-carrier.ts
```

不创建 `@loomrealm/transport-websocket`。

映射：

```text
one WS text message
=
one MessageCarrier string
```

必须：

```text
reject binary inbound
preserve message order
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
retry
reconnect
message duplication
application timeout
```

当 M7/M9 出现第二、第三个真实相同 adapter consumer 后，再决定是否抽 `@loomrealm/transport-websocket`。

---

## 11. Error Model

第一版不做复杂 error hierarchy。

保留：

```text
GamePackageError
    common Game validation authority

HostraLauncherError
    Hostra PREPARE / physical launch domain
```

Hostra-specific code至少覆盖正式 profile现有 categories：

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
```

Public/user-facing message MUST NOT leak：

```text
bootstrapToken
attempt-local WS capability
full safe env
unnecessary physical path
internal stack
```

Diagnostics可以保留 `cause` 给 trusted composition/test，但 token不得进入 error message/cause construction。

---

## 12. Process State

不要建立 package-wide Runtime registry。

每个 `launch()` closure只需要：

```ts
{
  child,
  controlServer,
  controlAcquired,
  terminationStage,
  terminatedDeferred,
  closed,
}
```

权威原则：

```text
child process events = physical facts
Main = logical Runtime authority
Runtime Control = protocol mechanics
```

`spawned / connected / identified / ready` 不合并：

```text
spawned
    = child OS process creation succeeded

connected
    = WS carrier established

identified
    = Runtime Control hello accepted

ready
    = Subsystem Runtime Control state reached ready
```

本 package只直接拥有前两个 physical facts；后两个继续由现有 Runtime Control/Main语义解释。

---

## 13. Tests

### 13.1 PREPARE unit/integration

必须覆盖：

```text
valid game.json + launch.hostra.json
invalid Game Entry bubbles correct GamePackage domain
manifest unknown/missing members
formatVersion mismatch
duplicate Hostra key
missing Hostra binding
undeclared Hostra binding
module grammar rejection
absolute/path traversal/backslash/URL rejection
missing module
non-file module
symlink directory escape
symlink file escape
all bindings resolved before result
LogicalGameBootstrap no formatVersion/module/path
launchPlan deeply immutable
```

PREPARE negative tests必须计数证明：

```text
process spawn = 0
module import = 0
WS listen/connect = 0
```

### 13.2 RuntimeHosting tests

使用真实 child + loopback WS，覆盖：

```text
listener ready before spawn
Runner argv entry is package-owned runner
business module never argv entry
runtimeControl acquire single-use
binary WS rejected
same-attempt reconnect rejected
child exit resolves terminated once
unexpected code-0 exit仍是 physical exit fact
spawn failure rejects launch
exit-before-Control rejects acquire
requestTermination first attempt
requestTermination second/force attempt
abort cleanup leaves no listener/process leak
```

### 13.3 Real M6 vertical

fixture 至少一个简单 Definition：

```text
Game fixture
→ prepareHostraGame
→ real HostraLaunchPlan
→ Main
→ RuntimeHosting
→ real Node Runner
→ real WebSocket carrier
→ real Runtime Control
→ real runSubsystem
→ initial Frame
→ completed outcome
→ graceful shutdown
→ actual child exit
```

再增加：

```text
2 Subsystem nested Frame
unexpected Runner exit → Main Runtime failure
invalid PREPARE → zero Runtime side effect
```

M6 qualification要求 Linux + Windows。

Outer Hostra full-process smoke可以由 `apps/desktop` / product qualification承担；package-local测试不需要把 Hostra Electron shell变成本 package dependency。

---

## 14. Implementation Order

### Step 1 — Package skeleton + PREPARE

```text
package.json / tsconfig
errors
manifest
module resolver
launch plan
prepareHostraGame
PREPARE tests
```

Closure：Game Package first real Runtime-product consumer + zero-side-effect PREPARE invariant。

### Step 2 — WebSocket carrier

```text
MessageCarrier implementation
text-only/order/close/loss tests
attempt-local listener helper
```

Closure：真实 platform transport，无 application protocol semantics。

### Step 3 — Runner

```text
bootstrap validator
safe environment contract
package-owned entry
module import/default export validation
RuntimeControlBinding
runSubsystem
```

Closure：Runner可独立连接 fixture Main-side carrier并运行 Definition。

### Step 4 — RuntimeHosting

```text
plan lookup
listener-before-spawn
child supervision
HostedRuntime
single-use MainRuntimeControlBinding
termination convergence
```

Closure：满足现有 `@loomrealm/platform-ports` M5 frozen interface，无 port change。

### Step 5 — M6 real vertical

```text
HostraPlatform/app composition glue
prepareGame
runMain
real Runner + WS
Frame outcome
shutdown
Linux/Windows CI
```

只有真实 consumer暴露契约缺口时才允许回头修改已有 package；不得以实现方便为理由预先扩 `main` / `platform-ports` / `subsystem`。

---

## 15. Explicit Non-goals / Extraction Gate

M6 完成前不新增：

```text
@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/platform-hostra
@loomrealm/process-supervisor
@loomrealm/hostra-runtime
```

允许未来提取的唯一条件：

```text
第二个真实 consumer出现
+
semantic boundary完全相同
+
提取后不会把 application authority带入 adapter
```

典型候选：M7 Renderer Control 与 M9 Data 都实际使用同一 WS carrier 后，再评估 `@loomrealm/transport-websocket`。

---

## 16. M6 Package Closure Checklist

只有以下全部成立才把 `@loomrealm/game-launcher-hostra` 标记为 Implemented Baseline：

```text
[ ] raw Hostra installation → Game Package validation
[ ] launch.hostra.json closed validation
[ ] exact Game ↔ Hostra key-set join
[ ] all modules canonical-safe resolved before side effect
[ ] deeply immutable HostraLaunchPlan
[ ] LogicalGameBootstrap contains no physical material
[ ] Main/platform-ports/subsystem frozen contracts unchanged
[ ] RuntimeHosting uses real Node child process
[ ] package-owned Runner is only argv entry
[ ] Definition module imported exactly by Runner
[ ] Runtime Control uses real text WebSocket MessageCarrier
[ ] no adapter JSON-RPC/retry/reconnect
[ ] MainRuntimeControlBinding single-use
[ ] actual process exit is sole terminated fact
[ ] unexpected exit reaches existing Main Runtime failure path
[ ] physical termination converges without new public port
[ ] no automatic Runtime restart/reconnect
[ ] Linux qualification green
[ ] Windows qualification green
```

最终 M6 package code shape应仍可概括为：

```text
PREPARE
+
RuntimeHosting
+
Runner
+
WS carrier
```

如果实现过程中开始需要 Platform mega-object、generic supervisor、generic RPC/transport framework，优先判断为 scope drift，而不是默认新增抽象。

---

## 17. Closure-oriented Implementation Discipline

实现顺序 MUST 优先保持失败域可分离，而不是优先把 happy path 一次跑通。

推荐依赖方向：

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

在写 RuntimeHosting 之前，PREPARE 应先达到 package-local qualification：

```text
valid input → deterministic immutable plan/bootstrap
invalid input → deterministic typed failure + zero Runtime side effect
```

这保证后续 Runtime 问题不会与文档/路径/preflight 问题混在同一调试域。

---

## 18. Attempt-local Runtime State and Connection Authority

每次 `RuntimeHosting.launch()` 自成一个 attempt-local closure；不得建立 package-wide mutable Runtime registry。

概念状态：

```ts
{
  child,
  controlServer,
  controlCarrier,
  controlAcquired,
  terminationStage,
  terminated,
  terminal
}
```

一条 Launch Attempt 只允许：

```text
one child process
one attempt-local WS capability
one accepted Runtime Control connection
one MainRuntimeControlBinding.acquire()
one terminal process fact
```

### 18.1 Transport capability != Runtime identity

WS MAY 使用：

```text
127.0.0.1
OS ephemeral port
high-entropy attempt-local path
```

该 path 只是降低无关本地连接抢占 one-shot listener 的 transport capability，不是 Runtime authentication authority。

不得增加第二套：

```text
?token=
Authorization header
custom WS hello
```

真正的 Launch Attempt identity/authentication 继续由现有 Runtime Control hello 中的：

```text
subsystemKey
bootstrapToken
```

及 Main authority负责。

因此：

```text
WS capability
!= bootstrapToken
!= Runtime identity
```

### 18.2 Single-use acquire

`runtimeControl.acquire(signal)` MUST：

```text
first call
→ wait for first accepted WS connection
→ close/disable listener acceptance
→ return carrier

second call
→ reject

carrier lost after acquisition
→ no same-attempt reconnect
```

连接建立、Control identified、Runtime ready 必须继续保持三件不同的事实。

---

## 19. Runner Environment and Executable Policy

Runner child environment MUST 从显式 allowlist 构造，而不是复制父进程完整环境。

概念：

```ts
createRunnerEnvironment(process.env, encodedBootstrap)
→ platform-required baseline
+ LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP
```

Linux/Windows qualification 应冻结实际 required baseline；典型候选包括：

```text
PATH
HOME
TMPDIR
TMP
TEMP
SystemRoot
WINDIR
```

但最终只保留真实运行所需值。

MUST NOT 无条件继承：

```text
NODE_OPTIONS
NODE_PATH
npm_*
HOSTRA_RPC_TOKEN
application credentials
arbitrary parent secrets
```

Game Entry / `launch.hostra.json` MUST NOT 有任何渠道追加：

```text
env
argv
Node flags
Runner entry
shell
```

Runner executable policy固定为：

```text
nodeExecutable = Host-selected trusted executable
argv[0]        = package-owned Runner entry
shell          = false
cwd            = canonical installation root
```

---

## 20. Qualification Layers and Fixture Strategy

不要依赖一个 full E2E 覆盖所有语义。M6 qualification 分四层。

### 20.1 Pure contract tests

覆盖：

```text
manifest closed schema
module grammar
exact key-set join
LogicalGameBootstrap projection
HostraLaunchPlan immutability
error code mapping
```

特点：无 child、无 WS、尽量无真实 filesystem。

### 20.2 Real filesystem PREPARE tests

使用真实 temp directory，而不是 mock `fs`：

```text
regular .mjs
missing file
directory
symlink/junction/reparse behavior
canonical containment
ordering-independent exact key set
```

目标：证明 security/preflight 对实际平台 filesystem 成立。

### 20.3 RuntimeHosting integration tests

使用真实：

```text
child_process
loopback WebSocket
package-owned Runner
```

但不强制经过 Main，用于精确验证：

```text
listener-before-spawn
single-use acquire
text carrier
spawn failure
exit-before-acquire
actual terminated fact
graceful/force termination
abort cleanup
```

### 20.4 Full Main ↔ Runner vertical

最终才验证完整链：

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

第一组 fixture SHOULD 保持极小：

```text
fixture/
├─ game.json
├─ launch.hostra.json
└─ subsystems/
   ├─ root.mjs
   └─ child.mjs
```

happy-path scenario 优先复用 M5 已验证的 logical trace：

```text
root Frame
→ frame.call(child)
→ child completed
→ root completed
```

M6 的变量只应是：

```text
MemoryCarrier/fake physical Platform
        ↓ replace with
Node child + WebSocket + real Runner
```

observable application outcome SHOULD 与 M5 等价。

### 20.5 Required negative verticals

至少增加：

```text
module/bootstrap failure
→ Runner nonzero exit
→ existing Main required-Runtime failure path
→ cleanup

unexpected Runner exit (including code 0 without Main intent)
→ Runtime failure

first termination request fails/times out
→ Main invokes second request
→ platform force convergence
→ actual exit
```

---

## 21. Package Artifact and CI Qualification

Runner 是 package-owned executable artifact，因此 M6 closure 不只验证 monorepo source tree。

MUST 执行：

```text
npm pack --dry-run
```

并确认发布 artifact 含实际 Runner entry，例如：

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

CI 从 RuntimeHosting 开始就覆盖：

```text
ubuntu-latest
windows-latest
```

最小 gate：

```text
build
unit tests
filesystem PREPARE tests
RuntimeHosting integration
full vertical E2E
npm pack --dry-run
```

跨平台重点观察：

```text
path/canonicalization
symlink/junction behavior
child process spawn
safe env
process termination
loopback WS
```

---

## 22. Public Surface Minimization

第一版 package root SHOULD 尽可能只暴露 composition integration 所需内容。

候选：

```text
HostraGameSource
PreparedHostraGame
HostraLaunchPlan (type/integration value only)
HostraLauncherError
prepareHostraGame
createHostraRuntimeHosting
```

以下 SHOULD 保持 internal：

```text
parseHostraLaunchManifest
resolveHostraModule
RunnerBootstrapV1
createWebSocketCarrier
spawnRunner
attempt state
process termination helpers
```

避免把一次实现细节升级为长期 public compatibility obligation。

---

## 23. Stop Conditions / Design Reopen Gate

实现过程中若发现以下任一项成为“必须条件”，先停止实现并重新检查设计假设，而不是用 optional field / adapter / compatibility path 继续补丁：

```text
必须修改 @loomrealm/main public contract
必须修改 RuntimeHosting / HostedRuntime port
必须修改 runSubsystem public API
必须修改 Runtime Control protocol
必须让 Hostra RPC 创建 Subsystem Runtime
必须新建通用 process supervisor package
必须新建通用 WebSocket transport package才能完成 M6
必须让 RuntimeHosting重新读取 Game/manifest
```

这些都与当前 M5/M6 boundary 的预期相冲突。

只有真实 consumer 证明 frozen contract 不足时才允许 reopen，并需要明确 provenance；不得因为实现便利而扩大既有 Core contract。

---

## 24. Reviewable Commit Sequence

推荐把实现拆成可独立 review / revert 的小闭环：

```text
1. feat(hostra-launcher): implement manifest and launch plan preparation

2. feat(hostra-launcher): add canonical module preflight

3. feat(hostra-launcher): add websocket message carrier

4. feat(hostra-launcher): add node subsystem runner

5. feat(hostra-launcher): implement runtime hosting and supervision

6. test(hostra-launcher): qualify real main-to-runner vertical

7. docs(hostra-launcher): freeze M6 implemented baseline
```

每一步原则：

```text
behavior introduced
→ focused tests introduced in same step
→ previous layers remain green
```

避免一个大提交同时混合：

```text
manifest parser + filesystem security + WS + spawn + Runner + Main E2E
```

否则无法判断哪个物理边界真正导致失败。

---

## 25. Final Definition of Done

只有以下全部成立，才允许把 M6 从 Implementation Draft 推进到：

```text
@loomrealm/game-launcher-hostra
Implemented / Qualified Baseline
```

完整 DoD：

```text
PREPARE
[ ] raw Game source由 Launcher内部交给 @loomrealm/game-package
[ ] Hostra manifest closed validation
[ ] exact Game ↔ Hostra key-set equality
[ ] all required modules在 first Runtime side effect前安全 resolve
[ ] symlink/junction/reparse escape按平台测试关闭
[ ] HostraLaunchPlan deeply immutable
[ ] LogicalGameBootstrap不含 document/executable material
[ ] every PREPARE failure保持 spawn/import/WS = 0

BOUNDARY
[ ] @loomrealm/main public contract unchanged
[ ] @loomrealm/platform-ports M5 contract unchanged
[ ] @loomrealm/subsystem/host public contract unchanged
[ ] @loomrealm/runtime-control protocol unchanged
[ ] business Definition依赖边界 unchanged

RUNTIME
[ ] one launch = one attempt-local closure
[ ] loopback WS ready before child spawn
[ ] endpoint uses OS ephemeral port + attempt-local capability
[ ] MainRuntimeControlBinding single-use
[ ] no same-attempt Control reconnect
[ ] package-owned Runner is sole argv entry
[ ] business module imported exactly by Runner
[ ] safe environment allowlist qualified
[ ] actual child exit is sole successful terminated fact
[ ] graceful → forced physical convergence works
[ ] no automatic Runtime restart

TRANSPORT
[ ] WS adapter只实现 MessageCarrier<string>
[ ] binary rejected
[ ] order / close / loss semantics qualified
[ ] no JSON-RPC/parser/deadline/retry/reconnect logic in adapter

QUALIFICATION
[ ] pure contract tests green
[ ] real filesystem PREPARE tests green
[ ] real child + WS integration green
[ ] real Main ↔ Runner ↔ Subsystem happy vertical green
[ ] nested 2-Subsystem Frame vertical green
[ ] bootstrap/module failure vertical green
[ ] unexpected code-0 exit vertical green
[ ] forced termination vertical green
[ ] Linux green
[ ] Windows green
[ ] npm pack --dry-run green and Runner artifact present
```

最终闭环：

```text
Hostra installation
→ deterministic PREPARE
→ immutable HostraLaunchPlan + LogicalGameBootstrap
→ existing Main contract
→ attempt-local RuntimeHosting
→ package-owned Node Runner
→ WS MessageCarrier<string>
→ existing Runtime Control
→ existing Subsystem Host
→ business Frame outcome
→ bounded shutdown
→ actual process exit
```

不存在旁路：

```text
Main → Game/manifest/module/path          ✗
Runner → Game/manifest重新解释            ✗
business → bootstrapToken/physical path   ✗
WS adapter → Runtime Control semantics    ✗
Hostra shell → LoomRealm Runtime authority ✗
```

M6 的优雅闭环标准不是“代码足够多”，而是：

> **真实物理 Hostra/Node/WS vertical 替换 M5 fake Platform 后，既有 logical contracts 与 business-observable semantics 完全不需要改动；新增复杂性只存在于当前 Platform 的物理边界，并且每个失败域、资源和终止事实都能独立收敛。**
