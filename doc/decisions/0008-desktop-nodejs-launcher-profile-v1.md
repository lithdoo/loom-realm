# ADR 0008：Desktop Node.js Launcher v1 旧直接 Entry 模型（历史）

> 状态：Superseded by [ADR 0018：首次实现前直接收口当前 v1](./0018-preimplementation-v1-closure.md)  
> 日期：2026-08-03  
> 影响范围：Game Package、Runtime Bootstrap、Desktop Runtime Hosting/Supervisor  
> 当前规范：[Desktop Node.js Launcher / Subsystem Runner Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)

## 历史背景

本 ADR 曾冻结 Desktop-first 的直接执行模型：

```text
Game Package launcher.entry
→ resolve physical entry
→ Node argv = business entry
```

并确定了若干仍然有价值的安全/监督原则：

```text
Host选择 Node Runtime
shell=false
Installation Root containment
bootstrap token registered before Runtime executes
explicit safe environment
spawn != connected != identified != ready
Supervisor observes actual exit
unexpected exit including code 0 = failure
no automatic restart
trusted executable code != sandboxed code
```

## 当前仍然有效的原则

上述 Runtime Hosting、Supervisor、bootstrap auth、no-shell、no-auto-restart、trust boundary原则继续由 current Node Runner Profile v1承担。

## 已被取代的核心模型

以下不再是 current v1：

```text
Game Package launcher.entry
.mjs/.cjs business process entry
business module directly used as Node argv
validated descriptor.env
```

Current v1现在是：

```text
Game Package {key,module}
        ↓
Host-owned Node Subsystem Runner = process entry
        ↓ import exact .mjs
Subsystem Definition Module = business implementation
```

Runner再构造：

```text
RuntimeControlBinding
SubsystemDataBinding
ContentClient
```

并进入 `@loomrealm/subsystem/host`。

## 新增的 late provisioning closure

旧直接-entry模型也无法解释 Runtime ready之后如何获得新的 Data physical material。

Current Node Runner Profile增加独立：

```text
Platform Provisioning Channel
```

典型由 child-process IPC实现，用于：

```text
DataConnectionBroker
→ fresh S/G/dataProfile endpoint/ticket
→ Runner
→ Data WebSocket
→ SubsystemDataBinding
```

Provisioning不是 Runtime Control/business protocol；失败不自动失败 Runtime/Frame。

## 为什么不发布 Launcher v2

没有既有 conformant v1 implementation需要兼容。ADR 0018明确：首次实现前直接修订当前 v1，使 first implementation只有一个模型。

因此本文只保留历史说明；当前实现必须读取现行 Node Runner Profile v1，而不是这里的旧 direct-entry决策。