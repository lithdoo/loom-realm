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
