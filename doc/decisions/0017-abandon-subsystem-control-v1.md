# ADR 0017：实现前废弃 Subsystem Control v1，确立 v2 为唯一当前版本

> 状态：Accepted  
> 日期：2026-08-09  
> 影响范围：Subsystem Control、Runtime Control Application Profile、Runtime Bootstrap、Desktop/PWA Control binding、契约目录  
> 替代：[ADR 0009：冻结 Subsystem Control Protocol v1](./0009-freeze-subsystem-control-protocol-v1.md) 中关于 v1 作为当前实现契约的结论；[ADR 0016](./0016-protocol-boundary-cleanup.md) 中“v1/v2 并行”的迁移安排

## 背景

Subsystem Control v1 在设计阶段曾被冻结，其 `subsystem.status({state:"ready"})` Desktop schema 携带 `rendererDataEndpoint`。后续协议边界清理确认：Runtime lifecycle 与 Renderer⇄Subsystem Data transport/bootstrap 是两个独立 authority/lifecycle domain，因此 Subsystem Control v2 移除了该 endpoint，并将 Control 收敛为纯 Runtime identity/lifecycle 协议。

在本 ADR 接受时：

```text
Subsystem Control v1
    has no conformant implementation
    has no released deployment
    has no third-party compatibility dependency
    has no persisted wire data requiring migration
```

因此继续维持“v1 Frozen + v2 Current”的双轨只会制造不存在的兼容负担。

## 决策

### 1. Subsystem Control v1 实现前废弃

Subsystem Control v1 状态改为：

```text
Abandoned Before Implementation
Superseded by Subsystem Control v2
```

v1 保留文档路径仅用于历史追溯，不再是可实现/可协商协议。

新实现：

```text
MUST NOT implement Subsystem Control v1
MUST NOT advertise protocol version 1
MUST NOT negotiate protocol version 1
```

不存在 v1→v2 runtime migration、fallback 或 compatibility mode。

### 2. Subsystem Control v2 成为唯一当前版本

当前 Runtime Control bootstrap/lifecycle 使用：

```text
loomrealm.subsystem-control / 2
```

v2 `ready` 只表示 Runtime required initialization 已完成，并能承担 enclosing Runtime Application Profile 声明的后续角色。

`ready` 不携带也不暗示：

```text
Renderer Data endpoint
MessagePort
Data credential
DataAuthority generation
Renderer connection existence
Frame / Activation / InputTarget
Render state
Content capability
```

### 3. Runtime Control Application Profile v1 同步废弃

旧 Profile v1 静态绑定：

```text
Subsystem Control v1 + Frame / Call v1
```

由于 Control v1 从未实现，该 Profile 同样不存在需要保护的 deployed compatibility，因此改为 `Abandoned Before Implementation`。

当前组合使用新的：

```text
Runtime Control Application Profile v2
=
Subsystem Control v2
+
Frame / Call v1
```

Frame / Call v1 本身保持 Frozen，不因 Control major version变化而升级。

### 4. Data bootstrap 继续保持独立

本次版本治理不把旧 v1 的 `rendererDataEndpoint` 搬到其他 Control method。

Data 链路继续是：

```text
Main Renderer Control
    publishes logical DataAuthority

Host / Platform Binding
    establishes authenticated carrier

Renderer ⇄ Subsystem Data Connection
    defines current / retired identity and generation semantics
```

Desktop WebSocket endpoint/ticket 与 PWA MessagePort creation/transfer 属于 Host/Platform Profile，不属于 Subsystem Control。

## 兼容性

这是一次 **pre-implementation protocol abandonment**，不是 deployed protocol migration。

因此：

```text
no v1 compatibility support
no dual-stack implementation
no version downgrade
no data migration
no fallback negotiation
```

Git history、旧协议 tombstone 与 ADR 保存设计演变即可。

## 文档治理规则

从本 ADR 起，当前文档必须：

- 把 Subsystem Control v2 标为唯一 Current implementation target；
- 把 Subsystem Control v1 标为 Legacy / Abandoned Before Implementation；
- 把 Runtime Control Profile v2 作为当前组合入口；
- 把 Runtime Control Profile v1 标为 Legacy / Abandoned Before Implementation；
- 不再描述 `ready.rendererDataEndpoint` 为当前架构路径；
- 不再把“保持 v1 compatibility”列为当前实现要求。

历史 ADR 不通过重写删除旧决定，但应明确指向本 ADR 的 superseding relation。

## 结果

当前 Runtime Control 主线统一为：

```text
Game Package v2
    ↓
Desktop/PWA Host bootstrap
    ↓
Subsystem Control v2
    ↓
Runtime Control Application Profile v2
    = Control v2 + Frame / Call v1
```

Data plane 独立为：

```text
Renderer Control DataAuthority
    ↓
Host / Platform Data Binding
    ↓
Renderer ⇄ Subsystem Data Connection
    ├── User Input
    └── Render Update
```

最终原则：

> **协议版本用于真实互操作兼容边界，而不是保存尚未实现的设计草稿。v1 的历史由 Git/ADR 保存；当前实现只面对 v2。**
