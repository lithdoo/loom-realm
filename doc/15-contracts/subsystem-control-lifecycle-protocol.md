# Main ⇄ Subsystem Control Protocol v1 — Abandoned

> 层级：历史契约 / Tombstone  
> 状态：Abandoned Before Implementation  
> 协议版本：1  
> 稳定程度：Superseded  
> 当前替代：[Main ⇄ Subsystem Control Protocol v2](./subsystem-control-protocol-v2.md)  
> 决策记录：[ADR 0017：实现前废弃 Subsystem Control v1](../decisions/0017-abandon-subsystem-control-v1.md)  
> 最近复核：2026-08-09

## 1. 当前地位

Subsystem Control v1 曾在设计阶段被冻结，但在任何 conformant implementation、正式 deployment 或第三方 compatibility dependency 出现之前被废弃。

因此：

```text
v1 is not a current LoomRealm protocol
v1 has no compatibility obligation
v1 MUST NOT be implemented by new code
v1 MUST NOT be advertised in protocolVersions
v1 MUST NOT be selected by Main
```

当前唯一 Subsystem Control 实现目标是：

```text
loomrealm.subsystem-control / 2
```

见 [Subsystem Control Protocol v2](./subsystem-control-protocol-v2.md)。

## 2. 为什么废弃

旧 v1 的主要边界错误是把 Desktop Renderer Data transport discovery放入 Runtime lifecycle：

```ts
{ state: "ready", rendererDataEndpoint: ... }
```

这把两个独立协议域绑定在一起：

```text
Runtime readiness
Renderer ⇄ Subsystem Data bootstrap
```

当前架构已经拆分为：

```text
Subsystem Control v2
    Runtime identity / lifecycle only

Main ⇄ Renderer Control
    logical DataAuthority

Host / Platform Binding
    WebSocket endpoint/ticket or MessagePort establishment

Renderer ⇄ Subsystem Data Connection
    current / retired + generation semantics
```

因此 v2 的：

```json
{"state":"ready"}
```

不再携带 Data endpoint。

## 3. 不提供兼容模式

因为 v1 从未形成真实互操作边界，本项目不提供：

```text
v1/v2 dual stack
v1 fallback
v1→v2 migration
ready.rendererDataEndpoint compatibility adapter
protocol version downgrade to 1
```

Runtime 实现应只 advertise：

```text
protocolVersions: [2]
```

或未来包含 2 的受支持版本集合。

## 4. 历史参考

旧 v1 的完整设计历史仍保存在 Git history 与：

- [ADR 0009：冻结 Subsystem Control Protocol v1](../decisions/0009-freeze-subsystem-control-protocol-v1.md)
- [ADR 0016：协议边界清理](../decisions/0016-protocol-boundary-cleanup.md)
- [ADR 0017：实现前废弃 v1](../decisions/0017-abandon-subsystem-control-v1.md)

这些历史不构成当前实现要求。

## 5. 当前入口

```text
Subsystem Control Protocol v2
    ↓
Runtime Control Application Profile v2
    = Subsystem Control v2 + Frame / Call v1
```

当前 Profile见 [Runtime Control Application Profile v2](./runtime-control-profile-v2.md)。

最终原则：

> **保留 v1 路径只为历史追溯；任何新实现、测试、Profile 或架构说明都必须以 v2 为当前 Subsystem Control。**
