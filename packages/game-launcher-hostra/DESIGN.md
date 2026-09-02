# `@loomrealm/game-launcher-hostra` 设计

> 状态：Frozen / Ready for Implementation  
> 冻结日期：2026-09-02  
> 阶段：M6 Hostra Platform Vertical  
> 正式契约：[Hostra Game Launcher / Node Subsystem Runner Profile v1](../../doc/15-contracts/nodejs-launcher-profile-v1.md)  
> 实现冻结：[IMPLEMENTATION.md](./IMPLEMENTATION.md)  
> 消费边界：[ADR 0020](../../doc/decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../../doc/decisions/0026-session-scoped-platform-instance.md)

核心原则：

> **这是 concrete HostraPlatform 内部的 Game PREPARE + RuntimeHosting/Runner integration component，不是 Hostra Platform 本身。Main 不调用本包，也不调用 Game Package；Product bootstrap 创建 session-scoped HostraPlatform，由 Platform 内部调用本包。**

---

## 1. Package Position

```text
apps/desktop / product entry
        ↓
session-scoped HostraPlatform
        │
        ├── prepareGame(source, policy)
        │       ↓
        │  @loomrealm/game-launcher-hostra
        │       ├── @loomrealm/game-package
        │       ├── launch.hostra.json
        │       ├── exact key join
        │       ├── module/runtime preflight
        │       ├── immutable HostraLaunchPlan
        │       └── LogicalGameBootstrap
        │
        └── runtimeHosting
                ↓
           plan-bound RuntimeHosting
                ↓
           package-owned Node Runner
```

M6 direct dependencies：

```text
@loomrealm/game-package
@loomrealm/foundation
@loomrealm/platform-ports
@loomrealm/subsystem
@loomrealm/wire
ws
```

`@loomrealm/main` and business packages MUST NOT depend on this package。

M6 does not create generic adapter packages。`launcher-node` / `transport-websocket` / generic supervisor extraction is deferred until another real consumer proves identical semantics。

---

## 2. Owned Surface

本包 owns：

```text
Hostra Runtime-product Game Entry consumption orchestration
HostraLaunchManifestV1 schema/parser
Hostra module logical syntax and filesystem security preflight
exact Game ↔ Hostra key-set join
trusted current Node/Runner static preflight
immutable HostraLaunchPlan
Main-facing LogicalGameBootstrap projection
plan-bound RuntimeHosting realization
Node Runner/bootstrap integration
Runtime Control WebSocket MessageCarrier
physical process convergence
```

本包 does not own：

```text
Game Entry common schema authority
Hostra outer Electron Host lifecycle
Main Runtime/Frame/Stack authority
Runtime Control protocol semantics/authentication authority
Renderer Hosting
DataConnectionBroker/Data provisioning in M6
Content semantics
business Definition behavior
```

---

## 3. Frozen M6 Integration Surface

```ts
interface HostraGameSource {
  readonly installationRoot: string;
}

interface HostraRunnerPolicy {
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly terminalCleanupDeadlineMs: number;
  readonly terminationGraceMs: number;
}

interface HostraPrepareOptions {
  readonly source: HostraGameSource;
  readonly runnerPolicy: HostraRunnerPolicy;
}

interface PreparedHostraGame {
  readonly logicalBootstrap: LogicalGameBootstrapShape;
  readonly launchPlan: HostraLaunchPlan;
}

prepareHostraGame(options: HostraPrepareOptions): Promise<PreparedHostraGame>

createHostraRuntimeHosting({
  launchPlan,
}: {
  readonly launchPlan: HostraLaunchPlan;
}): RuntimeHosting
```

Exact TypeScript root exports and semantics are frozen in `IMPLEMENTATION.md`。

M6 source representation is exactly：

```text
HostraGameSource = installationRoot only
```

No universal `GameSource` / `InstallationProvider` / `PreparedPlatformGame<T>` / `PlatformLaunchOptions` abstraction。

---

## 4. PREPARE → COMMIT

### PREPARE

```text
validate Hostra runner policy
→ canonicalize installation root
→ read/validate game.json through @loomrealm/game-package
→ validate launch.hostra.json
→ exact key-set join
→ resolve every .mjs safely
→ preflight current trusted Node runtime
→ preflight package-owned Runner artifact
→ freeze HostraLaunchPlan
→ freeze LogicalGameBootstrap
→ return PreparedHostraGame
```

Before success：

```text
zero Subsystem Runner process
zero business Definition import
zero Runtime Control WebSocket
```

### COMMIT

```text
HostraPlatform installs immutable HostraLaunchPlan
→ apps/desktop passes LogicalGameBootstrap + same Platform to Main
→ Main creates Launch Attempt {subsystemKey, bootstrapToken}
→ HostraPlatform.runtimeHosting.launch(...)
→ exact frozen-plan lookup
→ attempt-local WS + Node Runner
```

Ordinary launch MUST NOT re-read Game/manifest or re-resolve business module selection。

---

## 5. Frozen Host Policy

M6 Node selection is intentionally minimal：

```text
Node executable = current trusted composition process.execPath
supported Node  = major >= 20
Runner entry    = package-owned dist/runner/entry.js
shell           = false
cwd             = canonical installation root
```

Game/manifest cannot select Node、Runner、argv、Node flags、env、endpoint、bootstrap credential。

`HostraRunnerPolicy` contains exactly four bounded integer timing values：

```text
helloDeadlineMs
frameDeadlineMs
terminalCleanupDeadlineMs
terminationGraceMs
```

Runtime Control protocol versions are not configurable in M6；Runner uses `[1]`。

---

## 6. Logical vs Physical Material

`LogicalGameBootstrap` only contains：

```text
subsystemKeys
initial {subsystemKey,input}
```

It MUST NOT contain：

```text
Game document model/brand
formatVersion
HostraLaunchPlan
module/path
Node/Runner/process material
```

`HostraLaunchPlan` is a HostraPlatform integration value containing preflight-complete physical facts。It remains private from Main、Renderer and business code。

---

## 7. RuntimeHosting and Launch Attempt

Existing M5 port remains unchanged：

```text
RuntimeHosting.launch({subsystemKey, bootstrapToken}, signal)
→ HostedRuntime
```

No public `launchId`、module/path、Node flags or Hostra material is added。

Each launch owns only attempt-local physical state：

```text
one child
one loopback ephemeral WS listener
one 32-byte random path capability
one accepted Control connection
one single-use MainRuntimeControlBinding.acquire()
one child exit fact
```

```text
spawned != connected != identified != ready
```

This package owns spawned/connected；existing Runtime Control/Main own identified/ready。

---

## 8. Runner

Only process argv entry：

```text
process.execPath <package-owned runner entry>
```

Runner：

```text
consume + scrub reserved bootstrap env
→ validate closed RunnerBootstrapV1
→ import exact planned .mjs once
→ validate/use default SubsystemDefinitionFactory
→ establish Runtime Control WS MessageCarrier
→ runSubsystem(...)
```

Business Definition Module is never process entry and never receives Hostra physical material through author API。

M6 Runner includes Runtime Control only。

```text
M8+  adds Subsystem Data provisioning/binding when that milestone is implemented
M12+ adds Content integration when that milestone is implemented
```

No dormant provisioning capability is created in M6。

---

## 9. Process Facts and Termination

Child `exit` is the canonical physical termination fact；`close` is resource/stdio diagnostic only。

`HostedRuntime.terminated` settles from the child `exit` observer already installed immediately after `spawn()` returns and before awaiting the `spawn` event。

`requestTermination(signal)` is idempotent：

```text
commit normal host termination request once
→ schedule terminationGraceMs force fallback
→ actual exit settles terminated
```

Repeated requests join the same convergence。No public `forceKill()` port；no automatic restart。

Launch AbortSignal owns a physical attempt only until HostedRuntime is returned。Abort before ownership transfer closes the listener and force-converges any spawned child without returning an orphan Runtime。

---

## 10. Security Invariants

```text
module path is installation-relative .mjs only
all module bindings canonical-safe before plan freeze
prepared installation remains stable for one Platform Session
reserved bootstrap env is deleted before business import
Runner env is an explicit allowlist, never full process.env
WS binds only 127.0.0.1:0
attempt path uses 32 random bytes
WS capability is not Runtime authentication
bootstrapToken remains Runtime Control/Main authority
```

---

## 11. M6 Non-goals

```text
Renderer Control
DataConnectionBroker / Data provisioning
Content
Input / Render
PWA
universal launcher registry
universal transport package
generic process supervisor
Runner→Parent private lifecycle/status protocol
arbitrary Node executable configuration
Runtime restart/reconnect
live installation mutation
```

---

## 12. Freeze / Reopen Rule

M6 is Frozen / Ready for Implementation。

Implementation MUST NOT reopen boundary merely for convenience。Reopen only if a real implementation/qualification failure proves one of the frozen contracts insufficient。

Any need to change Main/RuntimeHosting/runSubsystem/Runtime Control public contracts, create generic manager/transport layers, or let RuntimeHosting re-read Game/manifest is a design-reopen signal, not permission for a compatibility patch。
