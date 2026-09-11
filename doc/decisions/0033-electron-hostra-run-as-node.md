# ADR 0033 — Electron-hosted Hostra Runner uses the current executable in Node mode

- 状态：Accepted / historical direct-Electron compatibility decision
- 日期：2026-09-11
- 当前关系：**canonical M15 Desktop composition 已由 [ADR 0034](./0034-hostra-owned-desktop-composition.md) supersede 本 ADR 的 Electron-main embedding assumption**
- 影响范围：任何真实 consumer 仍直接在 Electron main 中组合 `@loomrealm/game-launcher-hostra` 时的 Runner physical launch

## Current relevance

本 ADR 解决的前提是：

```text
current composition process = Electron main
```

在该前提下，`process.execPath` 指向 Electron binary，因此需要 host-owned：

```text
ELECTRON_RUN_AS_NODE=1
```

来继续启动既有 Node Runner。

ADR 0034 已决定 canonical M15 不再采用该前提：

```text
Hostra shell
→ HOSTRA_SUBCMD LoomRealm Desktop plain Node process
→ RuntimeHosting
→ Runner
```

因此 canonical M15 product path 不依赖本 ADR 的 run-as-node correction。本 ADR 作为历史实现 provenance 保留；若未来另一个真实 Electron-main consumer 直接消费同一 launch profile，本决策仍可适用于那个 consumer。

## Context

M6 Hostra launch profile冻结了很小的 executable policy：trusted composition process 使用自己的 `process.execPath` 作为 Runner executable，`launch.hostra.json` 不能选择任意 Node/argv/env。

历史 direct-Electron M15 首次把 composition process 设为 Electron main。在该环境中 `process.execPath` 指向 Electron executable，而 Runner 仍要求 Node execution semantics，因此产生：

```text
M6: Runner executable = current composition process.execPath
historical M15: composition process = Electron main
Runner: must execute as Node
```

该 direct-Electron composition 当时尚未形成外部 compatibility obligation，因此允许作为 first-implementation physical correction。

## Decision under that embedding

当且仅当 current composition process 确实是 Electron main 时：

```text
Runner executable = canonical current process.execPath
Runner child env += ELECTRON_RUN_AS_NODE=1
```

该值由 host physical launch code合成，不从 arbitrary parent environment 或 Game/launch manifest继承。

不增加：

```text
HostraPrepareOptions.nodeExecutable
arbitrary Node path in launch.hostra.json
bundled/external Node selector
second Electron-specific RuntimeHosting
UtilityProcess alternate Runner path
RunnerManager / ProcessRegistry
```

Electron build必须保持 `runAsNode` fuse enabled 才能满足该 embedding。

## What does not change

该历史 correction 不改变：

```text
Game Entry / launch.hostra.json schema
LogicalGameBootstrap
RuntimeHosting port
HostedRuntime shape
Runtime Control protocol/profile
bootstrapToken semantics
Runtime Control WebSocket
Runner entry/module ABI
Data provisioning/currentness
Main/Frame/Data authority
ordinary Node-hosted launch-profile behavior
```

## Canonical M15 supersession

ADR 0034 不否定这里描述的 Electron compatibility mechanics；它删除了 canonical M15 对这些 mechanics 的需求。

因此 Current 文档描述 M15 时必须使用：

```text
Hostra shell
→ LoomRealm Desktop HOSTRA_SUBCMD Node process
→ RuntimeHosting Runner child
```

不得再把：

```text
Electron main
→ ELECTRON_RUN_AS_NODE Runner
```

写成 canonical M15 topology。

## Reopen

仅当存在新的真实 Electron-main consumer，并且其支持的 Electron build无法安全提供 Node-mode child时，才针对那个 consumer重新评估 physical Runner container。不得因此引入任意 executable-selection framework。
