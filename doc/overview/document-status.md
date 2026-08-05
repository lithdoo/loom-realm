# LoomRealm 旧文档状态表（Legacy）

> 状态：Legacy  
> 主要定义：历史文档状态表的退役说明  
> 最近复核：2026-08-05

本文件来自文档分层重构前的旧状态表。其“单一真相源”列表和优先级规则已经失效，**不得用于判断当前架构或契约权威来源**。

当前治理：

```text
00-overview
→ 10-architecture
→ 15-contracts
→ 20-modules
→ 30-implementation
```

当前推荐入口：

- [LoomRealm 设计文档](../README.md)；
- [系统架构总览](../10-architecture/system-overview.md)；
- [正式契约目录](../15-contracts/README.md)；
- [Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)；
- [Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)；
- [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)。

## 当前 Frame 协议状态

```text
Frame / Call Protocol v1
    protocol = loomrealm.frame-call / 1
    Active / Normative / Frozen

Batch A-F
    all Frozen as design provenance
```

Frame v1 当前还冻结：1 MiB message、depth 64、512 KiB business value、identity/failure field limits、positive-safe one-shot Request IDs、1s..5min sender-local deadlines、Desktop/PWA统一 application mapping与无独立 Frame handshake/version downgrade。

## 已确认失效的旧模型

不得恢复：

- 每 Frame 一个独立 Runtime Process/Worker 或 Renderer Transport；
- Frame 必须拥有独立业务 Runtime/Projector/Client State；
- Frame close/unwind 自动删除 Render/Data Connection；
- Renderer 根据 Frame Stack 推导 Render visibility/z-order；
- Legacy `systemId` 作为新 Runtime/Frame ownership identity；
- lazy call-first Runtime startup；Process spawn=ready；failed Runtime automatic restart；
- Frame `ready/initialized/frame.status`；
- `failed/completed/cancelled` 作为 Frame lifecycle；
- closed frameId reuse / old activationId resume；
- Renderer reload恢复 cached old Activation；
- `system.call/system.return/frame.result`；
- `frame.close(reason)` / callerFrameId-on-wire；
- ordinary call必须 reverse `frame.suspend`；
- `frame.call` success=Child active；
- `frame.return` success=Child closed/Caller resumed；
- activate/resume ACK前发布新 Activation；
- post-commit恢复 revoked Activation或撤销 accepted outcome；
- same-Subsystem recursion依赖 nested bidirectional handler；
- Frame RPC timeout自动重试/replay；
- JSON-RPC id作为 operationId/idempotency key；
- timeout后释放 mutation gate继续旧 Activation；
- Frame divergence通过 reinitialize/resync修复；
- Renderer/Data reconnect恢复 Frame Control authority；
- caller-driven `frame.cancel`；
- `FrameOutcome.cancelled`=remote Caller cancellation；
- Runtime failure只删除当前/同-key最近 Frame；
- cleanup failure不扩大 unwind root；
- Runtime crash覆盖已 accepted outcome；
- failed Runtime上继续依赖 normal `frame.close ACK`；
- failure unwind自动销毁 healthy Runtime Render；
- PWA MessagePort通过 Structured Clone传 BigInt/ArrayBuffer/MessagePort作为 Frame value；
- JSON-RPC Batch承载多个 Frame operation；
- Request ID在同一 Control Connection复用；
- `frame.hello/frame.version/frame.capabilities` 作为 v1 runtime negotiation；
- `subsystem.hello.protocolVersions` 同时协商 Frame版本；
- “Batch C compatible / v1 except recovery”作为正式 v1 compatibility claim。

## 当前迁移规则

旧 `15-contracts/system-lifecycle-protocol.md` 已降为 Legacy redirect；当前权威入口是 `15-contracts/frame-call-protocol-v1.md`。

Frame v1 实现兼容性使用 `frame-call-conformance-v1.md`；可执行 fixture是否完成属于实施状态，不影响正式 Contract已 Frozen这一事实。

历史方案通过 Git 历史与 ADR 0010-0015追溯；Legacy路径不得反向覆盖当前语义。
