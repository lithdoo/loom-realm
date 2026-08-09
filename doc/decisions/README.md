# LoomRealm 架构决策记录

> 层级：设计决策记录  
> 状态：Active  
> 主要定义：重大架构决策的背景、取舍、结果和重新评估条件  
> 最近复核：2026-08-09

本目录记录 LoomRealm 重大架构结论的形成过程。当前有效系统职责和协议仍以 `10-architecture` 与 `15-contracts` 权威文档为准；ADR 保存候选方案、决定原因、代价和重新评估条件。

## 当前决策

1. [每个 System 一个 Runtime Container](./0001-system-container-per-system-id.md)
2. [桌面与 PWA Transport Profile](./0002-platform-transport-profiles.md)
3. [统一只读 Content API](./0003-readonly-content-api.md)
4. [Client State 渲染流水线](./0004-client-state-rendering-pipeline.md)
5. [Game Entry 声明 Subsystem Launcher](./0005-game-entry-subsystem-launchers.md)
6. [Frame 与 Render 生命周期解耦](./0006-frame-render-decoupling.md)
7. [Subsystem Descriptor MVP 收敛](./0007-subsystem-descriptor-mvp.md)
8. [冻结 Desktop Node.js Launcher Profile v1](./0008-desktop-nodejs-launcher-profile-v1.md)
9. [历史：冻结 Subsystem Control Protocol v1](./0009-freeze-subsystem-control-protocol-v1.md) — **Superseded**
10. [冻结 Frame / Call Protocol v1 Batch A](./0010-freeze-frame-call-protocol-v1-batch-a.md)
11. [冻结 Frame / Call Protocol v1 Batch B](./0011-freeze-frame-call-protocol-v1-batch-b.md)
12. [冻结 Frame / Call Protocol v1 Batch C](./0012-freeze-frame-call-protocol-v1-batch-c.md)
13. [冻结 Frame / Call Protocol v1 Batch D](./0013-freeze-frame-call-protocol-v1-batch-d.md)
14. [冻结 Frame / Call Protocol v1 Batch E](./0014-freeze-frame-call-protocol-v1-batch-e.md)
15. [冻结 Frame / Call Protocol v1 Batch F / 完成 v1](./0015-freeze-frame-call-protocol-v1-batch-f.md)
16. [协议边界清理与 Data Authority 方向](./0016-protocol-boundary-cleanup.md)
17. [实现前废弃 Subsystem Control v1，确立 v2 为唯一当前版本](./0017-abandon-subsystem-control-v1.md)

## 当前替代 / 补充关系

- ADR 0006 部分替代 ADR 0004 中“Client State / Store 必须以 Frame 为所有权单元”的假设；
- ADR 0005 替代旧“游戏只声明 systemId，由平台固定 Registry 提供实现”的第一阶段假设；
- ADR 0007 部分替代 ADR 0005 中旧 Descriptor/Launcher 表述；
- ADR 0008 冻结 Desktop Node.js Launcher Profile v1；
- **ADR 0017 替代 ADR 0009 中“Subsystem Control v1 作为当前 Frozen 实现目标”的结论：v1 从未实现，现已 Abandoned Before Implementation；**
- **ADR 0017 更新 ADR 0016 的 Control 版本迁移安排：Subsystem Control v2 是唯一 Current；Runtime Control Profile v2 = Control v2 + Frame v1；**
- ADR 0010 冻结 Frame identity / authority / lifecycle / Activation；
- ADR 0011 冻结七方法 wire、FrameOutcome、Caller relationship 不下发与 call/return local semantics；
- ADR 0012 冻结 Stack transaction / acceptance barrier / InputTarget causal barrier / rollback boundary，并明确 ordinary call不依赖 reverse suspend；
- ADR 0013 冻结 Success/Explicit Error/Ambiguous 三分法、finite deadline、no retry/replay、recoverable rejection、control divergence Runtime-fatal 与 no caller-driven cancel；
- ADR 0014 冻结 Runtime failure fixed-point suffix unwind：lowest failed-runtime Frame root、Top→Bottom cleanup、logical retire、healthy close、failed-set expansion、outcome preservation 与 fresh Caller resume；
- ADR 0015 冻结 Frame / Call v1 的 JSON/ID/size/depth limits、deadline profile、Desktop/PWA application mapping、静态 version binding 与 conformance claim，并将整个 Frame / Call Protocol v1 转为 Active / Normative / Frozen；
- ADR 0015 不新增 Frame handshake、retry/replay、cancel/abort/unwind 或其他 wire method；
- 旧 `system.call / system.return / frame.result / frame.close(reason) / frame.cancel` 不进入 Frame / Call v1。

## 当前 Runtime Control 版本关系

```text
Subsystem Control v1
    Abandoned Before Implementation
    historical only

Subsystem Control v2
    Current

Runtime Control Application Profile v1
    Abandoned Before Implementation

Runtime Control Application Profile v2
    Current
    = Subsystem Control v2 + Frame / Call v1
```

不存在 Control v1 compatibility/fallback requirement。

## 维护规则

- ADR 一经接受，不通过删除历史表达新决定；后续变化新增 ADR，并明确 superseding relation；
- 架构文档保存当前有效结论，ADR 保存结论形成过程；
- **尚未形成实现/发布/第三方依赖的协议可以通过明确 ADR 在实现前废弃；不应为了保存设计草稿而制造永久 compatibility version；**
- 已形成真实 compatibility boundary 的 Frozen protocol发生不兼容变化必须提升协议版本；
- Frame / Call v1 的不兼容变化必须提升协议版本，而不是增加“Batch G”或私有 v1 字段；
- Transport/Profile 实现不得通过平台差异覆盖已冻结应用层 transaction/error/recovery/limit semantics；
- Conformance fixture 可以增加对既有协议语义的覆盖，不因此改变 protocol version。
