# ADR 0033 — Electron-hosted Hostra Runner uses the current executable in Node mode

- 状态：Accepted / M15 preimplementation correction
- 日期：2026-09-11
- 影响范围：Hostra Runner physical launch、M15 Electron product composition、qualification

## Context

M6 Hostra v1 intentionally froze a very small host policy：the trusted composition process uses its own `process.execPath` as the Runner executable，and `launch.hostra.json` cannot select arbitrary Node/argv/env。

That is correct when Hostra is composed by an ordinary Node process。M15 introduces the first real Electron product consumer，where the composition process is Electron main。In that environment `process.execPath` names the Electron executable，not a standalone `node` executable。

Electron supports starting that same executable as a normal Node process through the host-controlled environment value：

```text
ELECTRON_RUN_AS_NODE=1
```

This behavior is available only when Electron's `runAsNode` fuse is enabled。

Without an explicit M15 correction，the two frozen statements would conflict：

```text
M6: Runner executable = current composition process.execPath
M15: composition process = Electron main, but Runner must still be a Node Runner
```

There is no shipped external compatibility boundary for this Electron composition yet。This is therefore a first-implementation physical correctness correction under the existing document governance，not a new Hostra protocol version。

## Decision

Hostra keeps exactly one executable-selection rule：

```text
Runner executable = canonical current process.execPath
```

No public/configurable Node executable option is added。

Physical start mode is：

```text
ordinary Node composition
    process.execPath RunnerEntry

Electron main composition
    ELECTRON_RUN_AS_NODE=1
    process.execPath RunnerEntry
```

When the current composition process is Electron，Hostra RuntimeHosting MUST synthesize `ELECTRON_RUN_AS_NODE=1` into the exact Runner child environment。It MUST NOT copy this value from arbitrary parent environment，and Game/Hostra manifests cannot configure、remove or override it。

The existing parent-environment allowlist remains unchanged。`ELECTRON_RUN_AS_NODE` is host-owned launch material like the reserved Runner bootstrap/content values，not a newly allowed inherited environment variable。

M15 Desktop supports only an Electron binary/package whose `runAsNode` fuse remains enabled。The product build/qualification owns that physical prerequisite；a build with the fuse disabled is not a conforming M15 Desktop build。

## Why this is the smallest correction

Rejected alternatives：

```text
HostraPrepareOptions.nodeExecutable
arbitrary Node path in launch.hostra.json
bundled/external Node selection framework
second Electron-specific RuntimeHosting
Electron utilityProcess-based second Runner path
RunnerManager / ProcessRegistry
```

A configurable executable would enlarge Host policy and executable attack surface merely because the first Electron consumer exposed one physical embedding detail。A second RuntimeHosting would duplicate already-qualified Runtime/termination/Data-provisioning semantics。

Using the same trusted executable in Electron's explicit Node mode preserves the existing Hostra process model、ChildProcess supervision、Runtime Control WebSocket、Runner bootstrap and Data provisioning path。

## Security boundary

`runAsNode` is enabled because LoomRealm Desktop intentionally needs a host-owned Node Runner。That capability does not become business authority：

```text
business JS has nodeIntegration=false
business JS has no Electron/process API
launch.hostra.json cannot control Runner env/argv
Runner child receives the existing strict env allowlist
ELECTRON_RUN_AS_NODE is synthesized only by Hostra physical launch
```

M15 qualification MUST run the real Electron composition and prove that the exact Hostra Runner child reaches existing Runtime Control readiness and terminates through the existing `HostedRuntime` owner chain。

## What does not change

This correction does **not** change：

```text
Game Entry / launch.hostra.json schemas
LogicalGameBootstrap
RuntimeHosting shared port
HostedRuntime shape
Runtime Control protocol/profile
bootstrapToken semantics
Runtime Control WebSocket
Hostra Runner entry/module ABI
Data provisioning/currentness
Main/Frame/Data authority
Node-hosted Hostra behavior
```

No v2、deprecated alias or dual launcher model is introduced。

## Propagation

Current sources must describe the same rule：

```text
Hostra Launcher Profile v1
Runtime hosting architecture
Desktop Host module design
M15/01, M15/04, M15/05
Phase 1 / testing summaries where physical execution is mentioned
```

## Reopen

Reopen only if a supported Electron release/build can no longer provide a trustworthy Node-mode child through this mechanism，or a real product security requirement proves that keeping `runAsNode` enabled is unacceptable。

Such evidence may justify a different concrete Runner container，but not an arbitrary executable-selection framework by default。
